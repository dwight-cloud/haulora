/**
 * Live tracking: driver position pings + tokenized public share links.
 * Tables are additive, safe to evolve with ALTER TABLE ADD COLUMN.
 */

import crypto from "crypto";
import { db } from "./db";

db.exec(`
  CREATE TABLE IF NOT EXISTS truck_positions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    driver_id     TEXT NOT NULL,
    lat           REAL NOT NULL,
    lon           REAL NOT NULL,
    heading       REAL,
    speed_mps     REAL,
    accuracy_m    REAL,
    recorded_at   INTEGER NOT NULL,
    received_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pos_assign ON truck_positions(assignment_id, recorded_at DESC);
  CREATE INDEX IF NOT EXISTS idx_pos_driver ON truck_positions(driver_id, recorded_at DESC);

  CREATE TABLE IF NOT EXISTS tracking_tokens (
    token         TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    created_by    TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    expires_at    INTEGER,
    revoked_at    INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_token_assign ON tracking_tokens(assignment_id);
`);

// Additive migrations for live-ETA cache on assignment rows
for (const alter of [
  `ALTER TABLE assignments ADD COLUMN live_eta_iso        TEXT`,
  `ALTER TABLE assignments ADD COLUMN live_distance_miles REAL`,
  `ALTER TABLE assignments ADD COLUMN live_duration_hours REAL`,
  `ALTER TABLE assignments ADD COLUMN live_updated_at     INTEGER`,
]) { try { db.exec(alter); } catch { /* already added */ } }

// ---------- Positions ----------

export interface Position {
  lat: number;
  lon: number;
  heading?: number;
  speedMps?: number;
  accuracyM?: number;
  recordedAt: number;
}

export function recordPosition(params: {
  assignmentId: string;
  driverId: string;
  position: Position;
}): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO truck_positions (assignment_id, driver_id, lat, lon, heading, speed_mps, accuracy_m, recorded_at, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.assignmentId,
    params.driverId,
    params.position.lat,
    params.position.lon,
    params.position.heading ?? null,
    params.position.speedMps ?? null,
    params.position.accuracyM ?? null,
    params.position.recordedAt,
    now,
  );
  // Prune: keep last 500 positions per assignment to cap DB growth
  db.prepare(`
    DELETE FROM truck_positions
     WHERE assignment_id = ?
       AND id NOT IN (
         SELECT id FROM truck_positions
          WHERE assignment_id = ?
          ORDER BY recorded_at DESC
          LIMIT 500
       )
  `).run(params.assignmentId, params.assignmentId);
}

export interface PositionRow extends Position {
  assignmentId: string;
  driverId: string;
}

export function latestPosition(assignmentId: string): PositionRow | null {
  const r = db.prepare(`
    SELECT assignment_id, driver_id, lat, lon, heading, speed_mps, accuracy_m, recorded_at
      FROM truck_positions
     WHERE assignment_id = ?
     ORDER BY recorded_at DESC
     LIMIT 1
  `).get(assignmentId) as {
    assignment_id: string; driver_id: string;
    lat: number; lon: number; heading: number | null;
    speed_mps: number | null; accuracy_m: number | null; recorded_at: number;
  } | undefined;
  if (!r) return null;
  return {
    assignmentId: r.assignment_id,
    driverId:     r.driver_id,
    lat: r.lat, lon: r.lon,
    heading:   r.heading   ?? undefined,
    speedMps:  r.speed_mps ?? undefined,
    accuracyM: r.accuracy_m ?? undefined,
    recordedAt: r.recorded_at,
  };
}

/** For dispatcher map: latest position of every in-progress assignment for an account. */
export function latestActivePositionsForAccount(accountId: string): Array<PositionRow & { status: string; originLabel: string; destLabel: string }> {
  const rows = db.prepare(`
    SELECT a.id AS aid, a.driver_id, a.status, a.origin_label, a.dest_label,
           p.lat, p.lon, p.heading, p.speed_mps, p.accuracy_m, p.recorded_at
      FROM assignments a
      JOIN (
        SELECT assignment_id, MAX(recorded_at) AS max_rec
          FROM truck_positions
         GROUP BY assignment_id
      ) latest ON latest.assignment_id = a.id
      JOIN truck_positions p
        ON p.assignment_id = latest.assignment_id
       AND p.recorded_at = latest.max_rec
     WHERE a.account_id = ?
       AND a.status IN ('accepted','in_progress')
  `).all(accountId) as Array<{
    aid: string; driver_id: string; status: string;
    origin_label: string; dest_label: string;
    lat: number; lon: number; heading: number | null;
    speed_mps: number | null; accuracy_m: number | null; recorded_at: number;
  }>;
  return rows.map((r) => ({
    assignmentId: r.aid,
    driverId:     r.driver_id,
    status:       r.status,
    originLabel:  r.origin_label,
    destLabel:    r.dest_label,
    lat: r.lat, lon: r.lon,
    heading:   r.heading   ?? undefined,
    speedMps:  r.speed_mps ?? undefined,
    accuracyM: r.accuracy_m ?? undefined,
    recordedAt: r.recorded_at,
  }));
}

// ---------- Live ETA cache on the assignment row ----------

export interface LiveEta {
  etaIso: string;
  distanceMiles: number;
  durationHours: number;
  updatedAt: number;
}

export function saveLiveEta(assignmentId: string, eta: LiveEta): void {
  db.prepare(`
    UPDATE assignments
       SET live_eta_iso = ?, live_distance_miles = ?, live_duration_hours = ?, live_updated_at = ?
     WHERE id = ?
  `).run(eta.etaIso, eta.distanceMiles, eta.durationHours, eta.updatedAt, assignmentId);
}

export function readLiveEta(assignmentId: string): LiveEta | null {
  const r = db.prepare(`
    SELECT live_eta_iso, live_distance_miles, live_duration_hours, live_updated_at
      FROM assignments
     WHERE id = ?
  `).get(assignmentId) as {
    live_eta_iso: string | null; live_distance_miles: number | null;
    live_duration_hours: number | null; live_updated_at: number | null;
  } | undefined;
  if (!r || !r.live_eta_iso || r.live_updated_at == null) return null;
  return {
    etaIso:         r.live_eta_iso,
    distanceMiles:  r.live_distance_miles ?? 0,
    durationHours:  r.live_duration_hours ?? 0,
    updatedAt:      r.live_updated_at,
  };
}

// ---------- Tracking tokens (shipper share) ----------

export interface TrackingToken {
  token: string;
  assignmentId: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
}

export function createTrackingToken(params: {
  assignmentId: string;
  createdBy: string;
  expiresInHours?: number;
}): TrackingToken {
  const token = crypto.randomBytes(24).toString("base64url");
  const now = Date.now();
  const expiresAt = params.expiresInHours
    ? now + params.expiresInHours * 3_600_000
    : null;
  db.prepare(`
    INSERT INTO tracking_tokens (token, assignment_id, created_by, created_at, expires_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, NULL)
  `).run(token, params.assignmentId, params.createdBy, now, expiresAt);
  return {
    token,
    assignmentId: params.assignmentId,
    createdBy: params.createdBy,
    createdAt: now,
    expiresAt,
    revokedAt: null,
  };
}

export function lookupTrackingToken(token: string): TrackingToken | null {
  const r = db.prepare(`
    SELECT token, assignment_id, created_by, created_at, expires_at, revoked_at
      FROM tracking_tokens
     WHERE token = ?
  `).get(token) as {
    token: string; assignment_id: string; created_by: string;
    created_at: number; expires_at: number | null; revoked_at: number | null;
  } | undefined;
  if (!r) return null;
  const now = Date.now();
  if (r.revoked_at) return null;
  if (r.expires_at && r.expires_at < now) return null;
  return {
    token: r.token,
    assignmentId: r.assignment_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
  };
}

export function revokeTrackingToken(token: string): void {
  db.prepare(`UPDATE tracking_tokens SET revoked_at = ? WHERE token = ?`).run(Date.now(), token);
}

export function listTrackingTokens(assignmentId: string): TrackingToken[] {
  const rows = db.prepare(`
    SELECT token, assignment_id, created_by, created_at, expires_at, revoked_at
      FROM tracking_tokens
     WHERE assignment_id = ?
     ORDER BY created_at DESC
  `).all(assignmentId) as Array<{
    token: string; assignment_id: string; created_by: string;
    created_at: number; expires_at: number | null; revoked_at: number | null;
  }>;
  return rows.map((r) => ({
    token: r.token, assignmentId: r.assignment_id, createdBy: r.created_by,
    createdAt: r.created_at, expiresAt: r.expires_at, revokedAt: r.revoked_at,
  }));
}
