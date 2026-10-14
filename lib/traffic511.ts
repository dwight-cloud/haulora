/**
 * State 511 incident feeds. Each state publishes its own format; most now
 * expose a WZDx-compatible JSON feed (federal Work Zone Data Exchange spec).
 * We pull a small, known-free subset here. Failures are swallowed so the
 * caller always gets a list.
 */

const UA = "OverdriveNav/0.1 (ops@overdrive.app)";

export interface TrafficIncident {
  id: string;
  source: string;         // "IA-511", "TX-511", etc.
  severity: "info" | "minor" | "major";
  kind: string;           // "construction", "crash", "closure", "weather", "other"
  description: string;
  lat: number;
  lon: number;
  startTime?: string;
  endTime?: string;
}

const FEEDS: Array<{
  id: string;
  url: string;
  kind: "wzdx" | "ia511";
}> = [
  // Iowa 511 publishes a WZDx feed publicly
  { id: "IA-511", url: "https://data.iowadot.gov/datasets/iowadot::roadway-notifications.geojson", kind: "ia511" },
  // Texas 511 WZDx
  { id: "TX-511", url: "https://its.txdot.gov/ITS_WEB/FrontEnd/default.html?feature=wzdx", kind: "wzdx" },
];

interface WzdxFeature {
  id?: string;
  properties?: Record<string, unknown>;
  geometry?: { coordinates?: number[] | number[][] };
}

export async function fetchIncidentsNear(lat: number, lon: number, radiusKm = 100): Promise<TrafficIncident[]> {
  const results = await Promise.all(
    FEEDS.map(async (feed) => {
      try {
        const r = await fetch(feed.url, {
          headers: { "User-Agent": UA, Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        });
        if (!r.ok) return [];
        const data = (await r.json()) as { features?: WzdxFeature[] };
        if (!data?.features) return [];
        return data.features
          .map((f) => toIncident(feed.id, f))
          .filter((x): x is TrafficIncident => !!x)
          .filter((inc) => within(inc, lat, lon, radiusKm));
      } catch {
        return [];
      }
    }),
  );
  return results.flat();
}

function toIncident(source: string, f: WzdxFeature): TrafficIncident | null {
  const coord = firstCoord(f.geometry?.coordinates);
  if (!coord) return null;
  const p = f.properties ?? {};
  const description = String(p.description ?? p.event_description ?? p.notes ?? "Incident");
  const sev = classifySeverity(String(p.event_type ?? p.category ?? ""));
  return {
    id: String(f.id ?? p.id ?? `${source}-${coord[0]},${coord[1]}`),
    source,
    severity: sev.severity,
    kind: sev.kind,
    description,
    lat: coord[1],
    lon: coord[0],
    startTime: typeof p.start_date === "string" ? p.start_date : undefined,
    endTime: typeof p.end_date === "string" ? p.end_date : undefined,
  };
}

function firstCoord(c: number[] | number[][] | undefined): [number, number] | null {
  if (!c) return null;
  if (typeof c[0] === "number" && typeof c[1] === "number") return [c[0] as number, c[1] as number];
  if (Array.isArray(c[0])) return firstCoord(c[0] as number[]);
  return null;
}

function classifySeverity(kind: string): { severity: "info" | "minor" | "major"; kind: string } {
  const k = kind.toLowerCase();
  if (k.includes("closure") || k.includes("crash") || k.includes("accident")) return { severity: "major", kind: "closure" };
  if (k.includes("work") || k.includes("construction")) return { severity: "minor", kind: "construction" };
  if (k.includes("weather")) return { severity: "minor", kind: "weather" };
  return { severity: "info", kind: "other" };
}

function within(inc: TrafficIncident, lat: number, lon: number, km: number): boolean {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(inc.lat - lat);
  const dLon = toRad(inc.lon - lon);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat)) * Math.cos(toRad(inc.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))) <= km;
}
