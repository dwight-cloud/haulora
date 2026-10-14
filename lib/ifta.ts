import { db } from "./db";

export interface TripPoint {
  id: string;
  userId: string;
  lat: number;
  lon: number;
  stateCode: string | null;
  odometer: number | null;
  timestamp: number;
}

export function logTripPoint(args: {
  userId: string;
  lat: number;
  lon: number;
  stateCode?: string | null;
  odometer?: number | null;
  timestamp?: number;
}): TripPoint {
  const id = `tp-${crypto.randomUUID()}`;
  const ts = args.timestamp ?? Date.now();
  db.prepare(
    `INSERT INTO trip_points (id, user_id, lat, lon, state_code, odometer, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, args.userId, args.lat, args.lon, args.stateCode ?? null, args.odometer ?? null, ts);
  return {
    id, userId: args.userId, lat: args.lat, lon: args.lon,
    stateCode: args.stateCode ?? null, odometer: args.odometer ?? null, timestamp: ts,
  };
}

export function listTripPoints(userId: string, sinceMs: number): TripPoint[] {
  const rows = db.prepare(
    `SELECT id, user_id AS userId, lat, lon, state_code AS stateCode, odometer, timestamp
     FROM trip_points WHERE user_id = ? AND timestamp >= ? ORDER BY timestamp ASC`,
  ).all(userId, sinceMs) as TripPoint[];
  return rows;
}

/** Great-circle distance between two coords in miles. */
function haversineMiles(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat), la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface IftaQuarterReport {
  quarter: string;
  totalMiles: number;
  byState: Array<{ state: string; miles: number }>;
  segments: number;
}

export function iftaReport(userId: string, fromMs: number, toMs: number, quarter: string): IftaQuarterReport {
  const rows = db.prepare(
    `SELECT lat, lon, state_code AS stateCode, timestamp
     FROM trip_points WHERE user_id = ? AND timestamp BETWEEN ? AND ? ORDER BY timestamp ASC`,
  ).all(userId, fromMs, toMs) as Array<{ lat: number; lon: number; stateCode: string | null; timestamp: number }>;
  const byState = new Map<string, number>();
  let total = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    const d = haversineMiles(a, b);
    // Skip GPS jumps (>120mi between two points with <30min gap = bad fix)
    if (d > 120 && b.timestamp - a.timestamp < 30 * 60_000) continue;
    total += d;
    const st = b.stateCode ?? a.stateCode ?? "??";
    byState.set(st, (byState.get(st) ?? 0) + d);
  }
  return {
    quarter,
    totalMiles: Math.round(total * 10) / 10,
    segments: Math.max(0, rows.length - 1),
    byState: [...byState.entries()]
      .map(([state, miles]) => ({ state, miles: Math.round(miles * 10) / 10 }))
      .sort((a, b) => b.miles - a.miles),
  };
}
