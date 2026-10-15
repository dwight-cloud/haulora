/**
 * QLDTraffic open data adapter (Transport and Main Roads, Queensland).
 *
 * Feed: https://api.qldtraffic.qld.gov.au/v2/events?apikey=KEY (GeoJSON
 * FeatureCollection). Spec: "QLDTraffic website API specification" v1.10,
 * linked from https://qldtraffic.qld.gov.au/more/Developers-and-Data/.
 *
 * Section 2.1.1.1 of that spec publishes a public key for developers who do
 * not register: 3e83add325cbb69ac4d8e5bf433d770b, globally limited to
 * 100 requests/minute across all unregistered users. We use it as the fallback
 * when QLDTRAFFIC_API_KEY is not set. For anything beyond a demo, register a
 * key by emailing qldtraffic@tmr.qld.gov.au.
 */
import { db } from "../db";
import { listActiveEvents, recordEvent } from "./road-events";
import type { RoadEvent, RoadEventKind, Severity } from "../domain/types";

const QLDTRAFFIC_PUBLIC_KEY = "3e83add325cbb69ac4d8e5bf433d770b";
const EVENTS_URL = "https://api.qldtraffic.qld.gov.au/v2/events";
const TIMEOUT_MS = 8000;
const UA = "Haulio/0.1 (demo)";

export type QldTrafficEvent = Omit<RoadEvent, "id" | "createdAt" | "accountId">;

function apiKey(): string {
  return process.env.QLDTRAFFIC_API_KEY?.trim() || QLDTRAFFIC_PUBLIC_KEY;
}

// ---- GeoJSON shapes we rely on (only the parts we read) ----
interface Geometry {
  type: string;
  coordinates?: unknown;
  geometries?: Geometry[];
}
interface Feature {
  type: "Feature";
  geometry?: Geometry | null;
  properties?: {
    id?: number;
    status?: string;
    event_type?: string;
    event_subtype?: string;
    event_due_to?: string;
    event_priority?: string;
    description?: string;
    information?: string;
    advice?: string;
    impact?: { impact_type?: string; impact_subtype?: string; delay?: string };
    duration?: { start?: string; end?: string };
    road_summary?: { road_name?: string; locality?: string };
    /** Some feeds carry a Major/Minor flag; honoured when present. */
    severity?: string;
  };
}

/** First [lon, lat] found in the geometry (points, lines, or collections). */
export function firstCoordinate(g: Geometry | null | undefined): { lat: number; lon: number } | null {
  if (!g) return null;
  if (g.type === "GeometryCollection" && Array.isArray(g.geometries)) {
    for (const sub of g.geometries) {
      const c = firstCoordinate(sub);
      if (c) return c;
    }
    return null;
  }
  let c: unknown = g.coordinates;
  // Drill down through nested arrays until we reach a [lon, lat] pair.
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
  if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
    return { lon: c[0], lat: c[1] };
  }
  return null;
}

/** True when the geometry is a single point (vs a line/collection of lines). */
function isPointGeometry(g: Geometry | null | undefined): boolean {
  if (!g) return true;
  if (g.type === "Point") return true;
  if (g.type === "GeometryCollection") return (g.geometries ?? []).every(isPointGeometry);
  return false;
}

export function mapKind(p: NonNullable<Feature["properties"]>): RoadEventKind {
  const impactType = (p.impact?.impact_type ?? "").toLowerCase();
  const impactSub = (p.impact?.impact_subtype ?? "").toLowerCase();
  if (impactType.includes("closure") || impactSub.includes("road closed")) return "closure";

  const type = (p.event_type ?? "").toLowerCase();
  const sub = (p.event_subtype ?? "").toLowerCase();
  const due = (p.event_due_to ?? "").toLowerCase();
  if (type === "flooding" || sub.includes("flooding") || due.includes("water over road")) return "flood";
  if (sub === "fire" || due.includes("bushfire") || due.includes("smoke")) return "fire";
  if (type === "crash") return "crash";
  if (type === "hazard" && (due.includes("heavy rain") || due.includes("high winds") || due.includes("fog") || due.includes("dust"))) return "weather";
  // Roadworks, Hazard, Congestion, Special event
  return "restriction";
}

export function mapSeverity(p: NonNullable<Feature["properties"]>): Severity {
  const impactType = (p.impact?.impact_type ?? "").toLowerCase();
  const impactSub = (p.impact?.impact_subtype ?? "").toLowerCase();
  const priority = (p.event_priority ?? "").toLowerCase();
  const flag = (p.severity ?? "").toLowerCase();

  if (priority === "red alert") return "critical";
  if (impactSub.includes("closed to all traffic")) return "critical";
  if (impactType.includes("closure") || flag === "major" || priority === "high") return "major";
  if (impactType.includes("lanes blocked") || impactType.includes("road restricted") || priority === "medium") return "moderate";
  if (impactType.includes("lanes affected")) return "moderate";
  if (flag === "minor" || priority === "low" || impactType.includes("no blockage") || impactType === "n/a") return "minor";
  return "moderate";
}

function toMs(iso?: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Converts a QLDTraffic GeoJSON feature to our event shape (null if unusable). */
export function mapFeature(f: Feature, now = Date.now()): QldTrafficEvent | null {
  const p = f.properties ?? {};
  const pos = firstCoordinate(f.geometry);
  if (!pos) return null;

  const road = p.road_summary?.road_name?.trim() || null;
  const locality = p.road_summary?.locality?.trim();
  const headline = [p.event_type, p.event_subtype].filter(Boolean).join(": ");
  const title = (p.description?.trim() || headline || "Road event").slice(0, 200);
  const descParts = [p.information, p.advice, p.impact?.delay, locality ? `Locality: ${locality}` : null]
    .filter((s): s is string => Boolean(s && s.trim()));

  const startsAt = toMs(p.duration?.start) ?? now;
  const endsAt = toMs(p.duration?.end);

  return {
    source: "qldtraffic",
    kind: mapKind(p),
    road,
    title,
    description: descParts.length ? descParts.join(" | ") : null,
    lat: pos.lat,
    lon: pos.lon,
    radiusKm: isPointGeometry(f.geometry) ? 3 : 5,
    severity: mapSeverity(p),
    startsAt,
    endsAt,
    active: true,
  };
}

/** Fetches the live feed and maps it. Returns [] on any failure. */
export async function fetchQldTrafficEvents(): Promise<QldTrafficEvent[]> {
  const key = apiKey();
  if (!key) return [];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${EVENTS_URL}?apikey=${encodeURIComponent(key)}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctl.signal,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: Feature[] };
    const now = Date.now();
    const out: QldTrafficEvent[] = [];
    for (const f of data.features ?? []) {
      const ev = mapFeature(f, now);
      if (ev && (ev.endsAt === null || ev.endsAt > now)) out.push(ev);
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pulls the live feed into road_events for the account. An incoming event is
 * skipped when an active row with the same title and road already exists.
 */
export async function syncQldTraffic(accountId: string): Promise<{ inserted: number; skipped: number }> {
  const incoming = await fetchQldTrafficEvents();
  if (incoming.length === 0) return { inserted: 0, skipped: 0 };

  const existing = new Set(
    listActiveEvents(accountId).map((e) => `${e.title}\u0000${e.road ?? ""}`),
  );
  let inserted = 0;
  let skipped = 0;
  const run = db.transaction(() => {
    for (const ev of incoming) {
      const k = `${ev.title}\u0000${ev.road ?? ""}`;
      if (existing.has(k)) { skipped++; continue; }
      recordEvent({ ...ev, accountId });
      existing.add(k);
      inserted++;
    }
  });
  run();
  return { inserted, skipped };
}
