import { db } from "./db";

export const REPORT_KINDS = [
  "parking_full", "parking_open", "checkpoint", "accident", "scale_open", "scale_closed",
  "hazard", "fuel_out", "low_bridge", "construction",
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export interface CommunityReport {
  id: string;
  kind: ReportKind;
  lat: number;
  lon: number;
  note: string | null;
  upvotes: number;
  createdAt: number;
  expiresAt: number;
}

/** Default TTL per report kind (ms). */
function ttlFor(kind: ReportKind): number {
  switch (kind) {
    case "parking_full":
    case "parking_open":
    case "checkpoint":
    case "scale_open":
    case "scale_closed":
      return 4 * 3600_000; // 4h
    case "accident":
    case "hazard":
    case "fuel_out":
    case "construction":
      return 8 * 3600_000; // 8h
    case "low_bridge":
      return 90 * 86400_000; // 90d (permanent-ish)
  }
}

export function createReport(args: {
  kind: ReportKind; lat: number; lon: number; note?: string | null;
}): CommunityReport {
  const id = `cr-${crypto.randomUUID()}`;
  const now = Date.now();
  const expires = now + ttlFor(args.kind);
  db.prepare(
    `INSERT INTO community_reports (id, kind, lat, lon, note, upvotes, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(id, args.kind, args.lat, args.lon, args.note ?? null, now, expires);
  return {
    id, kind: args.kind, lat: args.lat, lon: args.lon,
    note: args.note ?? null, upvotes: 0, createdAt: now, expiresAt: expires,
  };
}

export function listReportsNear(lat: number, lon: number, radiusKm = 50, kinds?: ReportKind[]): CommunityReport[] {
  // Rough bounding box (1° lat ≈ 111km). lon scaling by cos.
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const params: Array<string | number> = [lat - dLat, lat + dLat, lon - dLon, lon + dLon, Date.now()];
  let sql =
    `SELECT id, kind, lat, lon, note, upvotes, created_at AS createdAt, expires_at AS expiresAt
     FROM community_reports
     WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND expires_at > ?`;
  if (kinds && kinds.length) {
    sql += ` AND kind IN (${kinds.map(() => "?").join(",")})`;
    params.push(...kinds);
  }
  sql += ` ORDER BY created_at DESC LIMIT 200`;
  return db.prepare(sql).all(...params) as CommunityReport[];
}

export function upvoteReport(id: string): boolean {
  const r = db.prepare(`UPDATE community_reports SET upvotes = upvotes + 1 WHERE id = ? AND expires_at > ?`)
    .run(id, Date.now());
  return r.changes > 0;
}

/** Purge expired rows — call periodically. Safe to run on every request. */
export function purgeExpiredReports() {
  db.prepare(`DELETE FROM community_reports WHERE expires_at < ?`).run(Date.now() - 86400_000);
}
