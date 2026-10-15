/**
 * Road and weather disruption storage plus route geometry helpers.
 *
 * Events live in the road_events table (lib/domain/schema.ts). Geometry is
 * deliberately simple: an event is a centre point with a radius in km, and a
 * route "hits" an event when any polyline vertex falls inside that radius.
 */
import { db } from "../db";
import { genId } from "../domain/schema";
import { camel, type Load, type RoadEvent } from "../domain/types";
import { decodeFlexiblePolyline } from "../polyline";

const EARTH_RADIUS_KM = 6371.0088;
const DEG = Math.PI / 180;

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h = s1 * s1 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * s2 * s2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ---------- Storage ----------

const EVENT_BOOLS = ["active"];

function rowToEvent(row: Record<string, unknown>): RoadEvent {
  return camel<RoadEvent>(row, EVENT_BOOLS);
}

export function listActiveEvents(accountId: string): RoadEvent[] {
  const rows = db
    .prepare(
      `SELECT * FROM road_events
       WHERE account_id = ? AND active = 1
         AND (ends_at IS NULL OR ends_at > ?)
       ORDER BY starts_at DESC`,
    )
    .all(accountId, Date.now()) as Record<string, unknown>[];
  return rows.map(rowToEvent);
}

export function recordEvent(
  args: Omit<RoadEvent, "id" | "createdAt" | "accountId"> & { accountId: string },
): RoadEvent {
  const id = genId("ev");
  const now = Date.now();
  db.prepare(
    `INSERT INTO road_events
       (id, account_id, source, kind, road, title, description, lat, lon, radius_km,
        severity, starts_at, ends_at, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, args.accountId, args.source, args.kind, args.road ?? null, args.title,
    args.description ?? null, args.lat, args.lon, args.radiusKm, args.severity,
    args.startsAt, args.endsAt ?? null, args.active ? 1 : 0, now,
  );
  const row = db.prepare("SELECT * FROM road_events WHERE id = ?").get(id) as Record<string, unknown>;
  return rowToEvent(row);
}

export function deactivateEvent(id: string): void {
  db.prepare("UPDATE road_events SET active = 0 WHERE id = ?").run(id);
}

/** Deactivates every scenario-injected event for the account; returns the count. */
export function clearScenarioEvents(accountId: string): number {
  const r = db
    .prepare("UPDATE road_events SET active = 0 WHERE account_id = ? AND source = 'scenario' AND active = 1")
    .run(accountId);
  return r.changes;
}

// ---------- Geometry ----------

/**
 * Tests a HERE flexible polyline against an event circle. Every vertex is
 * sampled (routes can carry thousands); the loop inlines the haversine maths
 * and precomputes the event-side trig so it stays cheap.
 */
export function polylineIntersectsEvent(
  polyline: string,
  ev: RoadEvent,
): { hits: boolean; nearestKm: number; pointIndex: number } {
  const pts = decodeFlexiblePolyline(polyline);
  if (pts.length === 0) return { hits: false, nearestKm: Infinity, pointIndex: -1 };

  const evLat = ev.lat * DEG;
  const evLon = ev.lon * DEG;
  const cosEv = Math.cos(evLat);
  let best = Infinity;
  let bestIdx = -1;

  for (let i = 0; i < pts.length; i++) {
    const lat = pts[i].lat * DEG;
    const lon = pts[i].lon * DEG;
    const s1 = Math.sin((lat - evLat) / 2);
    const s2 = Math.sin((lon - evLon) / 2);
    const h = s1 * s1 + cosEv * Math.cos(lat) * s2 * s2;
    if (h < best) { best = h; bestIdx = i; }
  }

  const nearestKm = 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(best)));
  return { hits: nearestKm <= ev.radiusKm, nearestKm, pointIndex: bestIdx };
}

const ROUTE_STATUSES = ["planned", "en_route", "delayed", "rerouted"] as const;

/**
 * Every in-flight load whose current (or planned) route passes through an
 * active event. One entry per (load, event) pair that hits.
 */
export function affectedLoads(
  accountId: string,
  events?: RoadEvent[],
): Array<{ load: Load; event: RoadEvent; nearestKm: number }> {
  const evs = events ?? listActiveEvents(accountId);
  if (evs.length === 0) return [];

  const placeholders = ROUTE_STATUSES.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT * FROM loads
       WHERE account_id = ? AND status IN (${placeholders})
         AND (current_polyline IS NOT NULL OR planned_polyline IS NOT NULL)`,
    )
    .all(accountId, ...ROUTE_STATUSES) as Record<string, unknown>[];

  const out: Array<{ load: Load; event: RoadEvent; nearestKm: number }> = [];
  for (const row of rows) {
    const load = camel<Load>(row, ["perishable", "essential"]);
    const polyline = load.currentPolyline ?? load.plannedPolyline;
    if (!polyline) continue;
    for (const ev of evs) {
      let res: ReturnType<typeof polylineIntersectsEvent>;
      try {
        res = polylineIntersectsEvent(polyline, ev);
      } catch {
        continue; // malformed polyline: skip rather than fail the whole scan
      }
      if (res.hits) out.push({ load, event: ev, nearestKm: res.nearestKm });
    }
  }
  return out;
}

// ---------- HERE avoid[areas] ----------

const MAX_AVOID_AREAS = 20;

/**
 * Builds the HERE Routing v8 `avoid[areas]` value: one `bbox:west,south,east,north`
 * per event, sized to its radius, joined by `|`. Capped at 20 areas (HERE's limit).
 */
export function avoidAreasParam(events: RoadEvent[]): string {
  const parts: string[] = [];
  for (const ev of events.slice(0, MAX_AVOID_AREAS)) {
    const dLat = ev.radiusKm / 111.32;
    const cos = Math.max(0.01, Math.cos(ev.lat * DEG));
    const dLon = ev.radiusKm / (111.32 * cos);
    const west = (ev.lon - dLon).toFixed(5);
    const south = (ev.lat - dLat).toFixed(5);
    const east = (ev.lon + dLon).toFixed(5);
    const north = (ev.lat + dLat).toFixed(5);
    parts.push(`bbox:${west},${south},${east},${north}`);
  }
  return parts.join("|");
}
