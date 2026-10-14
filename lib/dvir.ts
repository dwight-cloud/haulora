import { db } from "./db";

export interface Defect { item: string; severity: "minor" | "major"; note?: string }
export interface DvirReport {
  id: string;
  userId: string;
  truckId: string;
  kind: "pre" | "post";
  defects: Defect[];
  odometer: number | null;
  signature: string | null;
  createdAt: number;
}

export const DVIR_CHECKLIST = [
  "Service brakes", "Parking brake", "Steering", "Tires", "Wheels & rims",
  "Lights & reflectors", "Coupling devices", "Horn", "Windshield wipers",
  "Rear-view mirrors", "Fuel/air leaks", "Emergency equipment", "Trailer brakes", "Trailer lights",
];

export function createDvir(args: {
  userId: string; truckId: string; kind: "pre" | "post";
  defects: Defect[]; odometer?: number | null; signature?: string | null;
}): DvirReport {
  const id = `dvir-${crypto.randomUUID()}`;
  db.prepare(
    `INSERT INTO dvir_reports (id, user_id, truck_id, kind, defects, odometer, signature, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, args.userId, args.truckId, args.kind, JSON.stringify(args.defects ?? []),
        args.odometer ?? null, args.signature ?? null, Date.now());
  return listDvirs(args.userId).find((r) => r.id === id)!;
}

export function listDvirs(userId: string, limit = 50): DvirReport[] {
  const rows = db.prepare(
    `SELECT id, user_id AS userId, truck_id AS truckId, kind, defects, odometer, signature,
            created_at AS createdAt
     FROM dvir_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
  ).all(userId, limit) as Array<Omit<DvirReport, "defects"> & { defects: string }>;
  return rows.map((r) => ({ ...r, defects: safeJson<Defect[]>(r.defects, []) }));
}

function safeJson<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
