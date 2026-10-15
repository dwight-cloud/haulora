/**
 * Run with: npx tsx --test lib/au/__tests__/road-events.test.ts
 * No live APIs are called. The SQLite file is redirected to a temp path so the
 * test never touches data/haulio.db.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { RoadEvent } from "../../domain/types";

type RoadEventsModule = typeof import("../road-events");
type PolylineModule = typeof import("../../polyline");
let re: RoadEventsModule;
let poly: PolylineModule;

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-test-"));
  process.env.DB_PATH = path.join(dir, "test.db");
  re = await import("../road-events");
  poly = await import("../../polyline");
});

// ---- Minimal HERE flexible polyline encoder (precision 5, 2-D), test-only ----
const ENC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function encUnsigned(v: number, out: string[]) {
  while (v >= 0x20) { out.push(ENC[(v & 0x1f) | 0x20]); v = Math.floor(v / 32); }
  out.push(ENC[v]);
}
function encSigned(v: number, out: string[]) {
  encUnsigned(v < 0 ? ~(v * 2) : v * 2, out); // zigzag
}
function encodePolyline(points: Array<{ lat: number; lon: number }>, precision = 5): string {
  const out: string[] = [];
  encUnsigned(1, out);               // version
  encUnsigned(precision, out);       // precision, no third dimension
  const f = 10 ** precision;
  let lastLat = 0, lastLon = 0;
  for (const p of points) {
    const lat = Math.round(p.lat * f), lon = Math.round(p.lon * f);
    encSigned(lat - lastLat, out); encSigned(lon - lastLon, out);
    lastLat = lat; lastLon = lon;
  }
  return out.join("");
}

const BRISBANE = { lat: -27.4698, lon: 153.0251 };
const TOWNSVILLE = { lat: -19.2590, lon: 146.8169 };

function ev(over: Partial<RoadEvent> = {}): RoadEvent {
  return {
    id: "ev-1", accountId: "a-1", source: "scenario", kind: "flood", road: "Bruce Hwy",
    title: "Test", description: null, lat: -26.0, lon: 152.0, radiusKm: 5,
    severity: "major", startsAt: 0, endsAt: null, active: true, createdAt: 0, ...over,
  };
}

test("haversine Brisbane -> Townsville is about 1,110 km", () => {
  const km = re.haversineKm(BRISBANE, TOWNSVILLE);
  assert.ok(Math.abs(km - 1110) / 1110 < 0.02, `got ${km.toFixed(1)} km`);
  assert.equal(re.haversineKm(BRISBANE, BRISBANE), 0);
});

test("test encoder round-trips through lib/polyline decoder", () => {
  const pts = [BRISBANE, { lat: -26.5, lon: 152.7 }, TOWNSVILLE];
  const decoded = poly.decodeFlexiblePolyline(encodePolyline(pts));
  assert.equal(decoded.length, 3);
  for (let i = 0; i < pts.length; i++) {
    assert.ok(Math.abs(decoded[i].lat - pts[i].lat) < 1e-5);
    assert.ok(Math.abs(decoded[i].lon - pts[i].lon) < 1e-5);
  }
});

test("polylineIntersectsEvent hits when a vertex is inside the radius", () => {
  // Brisbane -> Gympie -> Maryborough -> Rockhampton, roughly the Bruce Highway.
  const route = encodePolyline([
    BRISBANE,
    { lat: -26.19, lon: 152.66 }, // Gympie
    { lat: -25.54, lon: 152.70 }, // Maryborough
    { lat: -23.38, lon: 150.51 }, // Rockhampton
  ]);
  const gympieFlood = ev({ lat: -26.20, lon: 152.65, radiusKm: 5 });
  const hit = re.polylineIntersectsEvent(route, gympieFlood);
  assert.equal(hit.hits, true);
  assert.equal(hit.pointIndex, 1);
  assert.ok(hit.nearestKm < 2, `nearest ${hit.nearestKm}`);

  const toowoombaFire = ev({ lat: -27.56, lon: 151.95, radiusKm: 10 });
  const miss = re.polylineIntersectsEvent(route, toowoombaFire);
  assert.equal(miss.hits, false);
  assert.equal(miss.pointIndex, 0); // Brisbane is the nearest vertex
  assert.ok(miss.nearestKm > 100 && miss.nearestKm < 110, `nearest ${miss.nearestKm}`);

  const empty = re.polylineIntersectsEvent("", gympieFlood);
  assert.equal(empty.hits, false);
  assert.equal(empty.pointIndex, -1);
});

test("avoidAreasParam formats bbox:west,south,east,north per event", () => {
  const one = re.avoidAreasParam([ev({ lat: -27.0, lon: 153.0, radiusKm: 11.132 })]);
  const m = one.match(/^bbox:(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)$/);
  assert.ok(m, one);
  const [west, south, east, north] = m!.slice(1).map(Number);
  assert.ok(Math.abs(north - south - 0.2) < 1e-3);   // 11.132 km = 0.1 deg lat each side
  assert.ok(west < 153 && east > 153 && south < -27 && north > -27);
  assert.ok(east - west > north - south);             // lon span widens with latitude

  const two = re.avoidAreasParam([ev(), ev({ lat: -20, lon: 147 })]);
  assert.equal(two.split("|").length, 2);
  assert.equal(re.avoidAreasParam([]), "");
});

test("avoidAreasParam caps at 20 areas", () => {
  const many = Array.from({ length: 35 }, (_, i) => ev({ id: `ev-${i}`, lat: -27 + i * 0.1 }));
  const param = re.avoidAreasParam(many);
  assert.equal(param.split("|").length, 20);
  assert.ok(param.split("|").every((p) => p.startsWith("bbox:")));
});

test("record / list / deactivate / clearScenarioEvents round-trip in SQLite", async () => {
  const { db } = await import("../../db");
  db.prepare("INSERT OR IGNORE INTO accounts (id, name, created_at) VALUES (?, ?, ?)").run("a-test", "T", Date.now());
  const made = re.recordEvent({ ...ev({ source: "scenario" }), accountId: "a-test" });
  assert.ok(made.id.startsWith("ev-"));
  assert.equal(made.active, true);
  assert.equal(re.listActiveEvents("a-test").length, 1);
  const seed = re.recordEvent({ ...ev({ source: "seed", title: "Seeded" }), accountId: "a-test" });
  assert.equal(re.clearScenarioEvents("a-test"), 1);
  assert.deepEqual(re.listActiveEvents("a-test").map((e) => e.id), [seed.id]);
  re.deactivateEvent(seed.id);
  assert.equal(re.listActiveEvents("a-test").length, 0);
  assert.deepEqual(re.affectedLoads("a-test"), []);
});
