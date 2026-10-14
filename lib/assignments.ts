import { db } from "./db";

db.exec(`
  CREATE TABLE IF NOT EXISTS assignments (
    id             TEXT PRIMARY KEY,
    account_id     TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    driver_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    origin_label   TEXT NOT NULL,
    dest_label     TEXT NOT NULL,
    origin_lat     REAL NOT NULL,
    origin_lon     REAL NOT NULL,
    dest_lat       REAL NOT NULL,
    dest_lon       REAL NOT NULL,
    polyline       TEXT NOT NULL,
    distance_miles REAL NOT NULL,
    duration_hours REAL NOT NULL,
    risk_score     INTEGER NOT NULL,
    height_meters  REAL,
    weight_kg      INTEGER,
    axle_count     INTEGER,
    hazardous      INTEGER NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'assigned'
                   CHECK (status IN ('assigned','accepted','in_progress','completed','cancelled')),
    note           TEXT,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_assign_driver ON assignments(driver_id, status);
  CREATE INDEX IF NOT EXISTS idx_assign_account ON assignments(account_id, created_at);
`);

export type AssignmentStatus = "assigned" | "accepted" | "in_progress" | "completed" | "cancelled";

export interface Assignment {
  id: string;
  accountId: string;
  driverId: string;
  driverName?: string;
  createdBy: string;
  originLabel: string;
  destLabel: string;
  originLat: number; originLon: number;
  destLat: number; destLon: number;
  polyline: string;
  distanceMiles: number;
  durationHours: number;
  riskScore: number;
  heightMeters?: number;
  weightKg?: number;
  axleCount?: number;
  hazardous: boolean;
  status: AssignmentStatus;
  note?: string;
  createdAt: number;
  updatedAt: number;
  // Live-tracking cache (populated by /api/assignments/:id/position recompute).
  // Null until the driver streams a position and HERE re-routes.
  liveEtaIso?: string | null;
  liveDistanceMiles?: number | null;
  liveDurationHours?: number | null;
  liveUpdatedAt?: number | null;
}

interface Row {
  id: string; account_id: string; driver_id: string; created_by: string;
  origin_label: string; dest_label: string;
  origin_lat: number; origin_lon: number; dest_lat: number; dest_lon: number;
  polyline: string; distance_miles: number; duration_hours: number;
  risk_score: number;
  height_meters: number | null; weight_kg: number | null; axle_count: number | null;
  hazardous: number; status: AssignmentStatus; note: string | null;
  created_at: number; updated_at: number;
  driver_name?: string;
  live_eta_iso?: string | null; live_distance_miles?: number | null;
  live_duration_hours?: number | null; live_updated_at?: number | null;
}

function toAssignment(r: Row): Assignment {
  return {
    id: r.id, accountId: r.account_id, driverId: r.driver_id, createdBy: r.created_by,
    driverName: r.driver_name,
    originLabel: r.origin_label, destLabel: r.dest_label,
    originLat: r.origin_lat, originLon: r.origin_lon, destLat: r.dest_lat, destLon: r.dest_lon,
    polyline: r.polyline, distanceMiles: r.distance_miles, durationHours: r.duration_hours,
    riskScore: r.risk_score,
    heightMeters: r.height_meters ?? undefined,
    weightKg: r.weight_kg ?? undefined,
    axleCount: r.axle_count ?? undefined,
    hazardous: !!r.hazardous,
    status: r.status, note: r.note ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
    liveEtaIso:        r.live_eta_iso        ?? null,
    liveDistanceMiles: r.live_distance_miles ?? null,
    liveDurationHours: r.live_duration_hours ?? null,
    liveUpdatedAt:     r.live_updated_at     ?? null,
  };
}

export interface CreateAssignmentInput {
  accountId: string;
  driverId: string;
  createdBy: string;
  originLabel: string; destLabel: string;
  originLat: number; originLon: number; destLat: number; destLon: number;
  polyline: string;
  distanceMiles: number; durationHours: number; riskScore: number;
  heightMeters?: number; weightKg?: number; axleCount?: number;
  hazardous?: boolean;
  note?: string;
}

export function createAssignment(a: CreateAssignmentInput): Assignment {
  const id = `asg-${crypto.randomUUID()}`;
  const now = Date.now();
  db.prepare(`
    INSERT INTO assignments (
      id, account_id, driver_id, created_by,
      origin_label, dest_label,
      origin_lat, origin_lon, dest_lat, dest_lon,
      polyline, distance_miles, duration_hours, risk_score,
      height_meters, weight_kg, axle_count, hazardous,
      status, note, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'assigned', ?, ?, ?
    )
  `).run(
    id, a.accountId, a.driverId, a.createdBy,
    a.originLabel, a.destLabel,
    a.originLat, a.originLon, a.destLat, a.destLon,
    a.polyline, a.distanceMiles, a.durationHours, a.riskScore,
    a.heightMeters ?? null, a.weightKg ?? null, a.axleCount ?? null,
    a.hazardous ? 1 : 0,
    a.note ?? null, now, now,
  );
  return getAssignment(id)!;
}

export function getAssignment(id: string): Assignment | undefined {
  const r = db.prepare(`
    SELECT a.*, u.name AS driver_name
    FROM assignments a LEFT JOIN users u ON u.id = a.driver_id
    WHERE a.id = ?
  `).get(id) as Row | undefined;
  return r ? toAssignment(r) : undefined;
}

export function listAssignmentsForAccount(accountId: string, limit = 100): Assignment[] {
  const rows = db.prepare(`
    SELECT a.*, u.name AS driver_name
    FROM assignments a LEFT JOIN users u ON u.id = a.driver_id
    WHERE a.account_id = ?
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(accountId, limit) as Row[];
  return rows.map(toAssignment);
}

export function listAssignmentsForDriver(driverId: string, includeCompleted = false): Assignment[] {
  const rows = db.prepare(`
    SELECT a.*, u.name AS driver_name
    FROM assignments a LEFT JOIN users u ON u.id = a.driver_id
    WHERE a.driver_id = ? ${includeCompleted ? "" : "AND a.status NOT IN ('completed','cancelled')"}
    ORDER BY a.created_at DESC
    LIMIT 50
  `).all(driverId) as Row[];
  return rows.map(toAssignment);
}

const ALLOWED_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  assigned:    ["accepted", "cancelled"],
  accepted:    ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed:   [],
  cancelled:   [],
};

export function updateAssignmentStatus(id: string, next: AssignmentStatus): Assignment | undefined {
  const cur = getAssignment(id);
  if (!cur) return undefined;
  if (!ALLOWED_TRANSITIONS[cur.status].includes(next)) {
    throw new Error(`invalid transition ${cur.status} → ${next}`);
  }
  db.prepare("UPDATE assignments SET status = ?, updated_at = ? WHERE id = ?")
    .run(next, Date.now(), id);
  return getAssignment(id);
}
