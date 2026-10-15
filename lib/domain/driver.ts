/**
 * Driver-side helpers.
 *
 * Trucks only carry a free-text driver_name, so the driver app keeps its own
 * small mapping from a signed-in user to the truck they are in today. The
 * table is created on import (same pattern as lib/domain/schema.ts).
 */
import { db } from "../db";
import { getTruck, listTrucks, listLoads, getCustomer, listActions } from "./repo";
import type { Action, Load, Truck } from "./types";
import type { SessionClaims } from "../auth-core";

db.exec(`
  CREATE TABLE IF NOT EXISTS driver_trucks (
    user_id  TEXT PRIMARY KEY,
    truck_id TEXT NOT NULL
  );
`);

export function getDriverTruck(userId: string): Truck | undefined {
  const row = db.prepare("SELECT truck_id FROM driver_trucks WHERE user_id = ?").get(userId) as { truck_id: string } | undefined;
  return row ? getTruck(row.truck_id) : undefined;
}

export function setDriverTruck(userId: string, truckId: string): void {
  db.prepare("INSERT INTO driver_trucks (user_id, truck_id) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET truck_id = excluded.truck_id")
    .run(userId, truckId);
}

/**
 * The truck for this session, scoped to the account. On a first visit the
 * first truck that is on the road is picked and remembered.
 */
export function resolveDriverTruck(session: SessionClaims): Truck | undefined {
  const t = getDriverTruck(session.sub);
  if (t && t.accountId === session.accountId) return t;
  const trucks = listTrucks(session.accountId);
  const pick = trucks.find((x) => x.status === "moving") ?? trucks[0];
  if (pick) setDriverTruck(session.sub, pick.id);
  return pick;
}

export const DRIVER_JOB_STATUSES = ["planned", "en_route", "delayed", "rerouted", "held"] as const;

export type DriverJob = Load & { customerName: string; customerEmail: string | null };

/** In-flight jobs on the truck, soonest pickup first, with the customer name attached. */
export function listDriverJobs(accountId: string, truckId: string): DriverJob[] {
  return listLoads(accountId, [...DRIVER_JOB_STATUSES])
    .filter((l) => l.truckId === truckId)
    .sort((a, b) => a.pickupAt - b.pickupAt)
    .map((l) => {
      const c = getCustomer(l.customerId);
      return { ...l, customerName: c?.name ?? "Customer", customerEmail: c?.contactEmail ?? null };
    });
}

export interface DriverUpdate {
  id: string; loadId: string; ref: string; kind: string; status: Action["status"];
  decided: boolean; text: string; at: number;
}

const fmtKm = (n: unknown) => (typeof n === "number" ? `${Math.round(n)} km` : null);
const fmtH = (n: unknown) => (typeof n === "number" ? `${n.toFixed(1)} h` : null);

/** Dispatch decisions from the last 24 h that touch the driver's jobs, in plain words. */
export function listDriverUpdates(accountId: string, jobs: Load[]): DriverUpdate[] {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const since = Date.now() - 24 * 3600_000;
  const out: DriverUpdate[] = [];
  for (const a of listActions(accountId)) {
    if (a.createdAt < since) break; // listActions is newest first
    if (!["replan_load", "hold_load", "flag_for_review"].includes(a.kind)) continue;
    const p = a.payload as { data?: { loadId?: string; km?: number; hours?: number; reason?: string } } | null;
    const loadId = p?.data?.loadId;
    if (!loadId || !byId.has(loadId)) continue;
    if (!["proposed", "executed", "auto_executed"].includes(a.status)) continue;
    const job = byId.get(loadId)!;
    const decided = a.status !== "proposed";
    let text: string;
    if (!decided) {
      text = `Dispatch is looking at a change for ${job.ref}.`;
    } else if (a.kind === "replan_load") {
      const bits = [fmtKm(p?.data?.km), fmtH(p?.data?.hours)].filter(Boolean).join(", ");
      text = `Dispatch changed your route for ${job.ref}: new route around the road problem${bits ? `, ${bits}` : ""}.`;
    } else if (a.kind === "hold_load") {
      text = `Dispatch is holding ${job.ref} at the depot until the road clears.`;
    } else {
      text = `Dispatch is checking ${job.ref} by hand and will call you if anything changes.`;
    }
    out.push({ id: a.id, loadId, ref: job.ref, kind: a.kind, status: a.status, decided, text, at: a.createdAt });
  }
  return out;
}
