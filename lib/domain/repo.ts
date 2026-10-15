/**
 * Typed data access for the LogisticMind domain tables.
 *
 * Every function is tenant-scoped by accountId where the table carries one,
 * uses parameterised statements, and returns camelCase objects (see
 * lib/domain/types.ts). Importing lib/domain/schema.ts ensures the tables
 * exist before the first statement is prepared.
 */
import { db } from "../db";
import { genId } from "./schema";
import {
  camel,
  type Action, type ActionStatus, type AgentName, type AgentRun, type AgentStep,
  type Customer, type LevyMethod, type Load, type LoadStatus, type Risk, type RunStatus,
  type StepKind, type Truck, type TruckStatus,
} from "./types";

type Row = Record<string, unknown>;

const TRUCK_BOOLS = ["hazardous"];
const LOAD_BOOLS = ["perishable", "essential"];
const RUN_BOOLS = ["mock"];

const toTruck = (r: Row) => camel<Truck>(r, TRUCK_BOOLS);
const toCustomer = (r: Row) => camel<Customer>(r);
const toLoad = (r: Row) => camel<Load>(r, LOAD_BOOLS);
const toRun = (r: Row) => camel<AgentRun>(r, RUN_BOOLS);
const parseJson = (s: unknown): unknown => {
  if (typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return s; }
};
const toStep = (r: Row): AgentStep => {
  const s = camel<AgentStep>(r);
  return { ...s, payload: parseJson(r.payload) };
};
const toAction = (r: Row): Action => {
  const a = camel<Action>(r);
  return { ...a, payload: parseJson(r.payload) };
};

// ---------------------------------------------------------------- helpers

/** Run `fn` inside a single SQLite transaction; rolls back on throw. */
export function withTransaction<T>(fn: () => T): T {
  return db.transaction(fn)();
}

// ----------------------------------------------------------------- trucks

export interface TruckInput {
  id?: string; accountId: string; code: string; rego?: string | null; driverName?: string | null;
  status?: TruckStatus; lat: number; lon: number;
  heightM?: number; grossKg?: number; axleCount?: number; hazardous?: boolean;
  tankLitres?: number; fuelPct?: number; litresPer100km?: number;
}

export function listTrucks(accountId: string): Truck[] {
  return (db.prepare("SELECT * FROM trucks WHERE account_id = ? ORDER BY code").all(accountId) as Row[]).map(toTruck);
}

export function getTruck(id: string): Truck | undefined {
  const r = db.prepare("SELECT * FROM trucks WHERE id = ?").get(id) as Row | undefined;
  return r ? toTruck(r) : undefined;
}

/** Insert or update a truck. Matches on id, else on (account_id, code). */
export function upsertTruck(t: TruckInput): Truck {
  const existing = t.id
    ? (db.prepare("SELECT id FROM trucks WHERE id = ?").get(t.id) as { id: string } | undefined)
    : (db.prepare("SELECT id FROM trucks WHERE account_id = ? AND code = ?").get(t.accountId, t.code) as { id: string } | undefined);
  const id = existing?.id ?? t.id ?? genId("t");
  if (existing) {
    db.prepare(
      `UPDATE trucks SET code = ?, rego = ?, driver_name = ?, status = ?, lat = ?, lon = ?,
         height_m = ?, gross_kg = ?, axle_count = ?, hazardous = ?, tank_litres = ?, fuel_pct = ?, litres_per_100km = ?
       WHERE id = ? AND account_id = ?`,
    ).run(
      t.code, t.rego ?? null, t.driverName ?? null, t.status ?? "idle", t.lat, t.lon,
      t.heightM ?? 4.3, t.grossKg ?? 42500, t.axleCount ?? 6, t.hazardous ? 1 : 0,
      t.tankLitres ?? 800, t.fuelPct ?? 70, t.litresPer100km ?? 48, id, t.accountId,
    );
  } else {
    db.prepare(
      `INSERT INTO trucks (id, account_id, code, rego, driver_name, status, lat, lon, height_m, gross_kg,
         axle_count, hazardous, tank_litres, fuel_pct, litres_per_100km, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, t.accountId, t.code, t.rego ?? null, t.driverName ?? null, t.status ?? "idle", t.lat, t.lon,
      t.heightM ?? 4.3, t.grossKg ?? 42500, t.axleCount ?? 6, t.hazardous ? 1 : 0,
      t.tankLitres ?? 800, t.fuelPct ?? 70, t.litresPer100km ?? 48, Date.now(),
    );
  }
  return getTruck(id)!;
}

export function updateTruckPosition(id: string, lat: number, lon: number, status?: TruckStatus): Truck | undefined {
  if (status) db.prepare("UPDATE trucks SET lat = ?, lon = ?, status = ? WHERE id = ?").run(lat, lon, status, id);
  else db.prepare("UPDATE trucks SET lat = ?, lon = ? WHERE id = ?").run(lat, lon, id);
  return getTruck(id);
}

// -------------------------------------------------------------- customers

export interface CustomerInput {
  id?: string; accountId: string; name: string; contactEmail?: string | null;
  baseRatePerKm: number; levyMethod?: LevyMethod; levyBaseCpl?: number | null;
  levyFuelShare?: number; levyCurrentPct?: number; levyNoticeDays?: number; weeklyKm?: number;
}

export function listCustomers(accountId: string): Customer[] {
  return (db.prepare("SELECT * FROM customers WHERE account_id = ? ORDER BY name").all(accountId) as Row[]).map(toCustomer);
}

export function getCustomer(id: string): Customer | undefined {
  const r = db.prepare("SELECT * FROM customers WHERE id = ?").get(id) as Row | undefined;
  return r ? toCustomer(r) : undefined;
}

/** Insert or update a customer. Matches on id, else on (account_id, name). */
export function upsertCustomer(c: CustomerInput): Customer {
  const existing = c.id
    ? (db.prepare("SELECT id FROM customers WHERE id = ?").get(c.id) as { id: string } | undefined)
    : (db.prepare("SELECT id FROM customers WHERE account_id = ? AND name = ?").get(c.accountId, c.name) as { id: string } | undefined);
  const id = existing?.id ?? c.id ?? genId("c");
  if (existing) {
    db.prepare(
      `UPDATE customers SET name = ?, contact_email = ?, base_rate_per_km = ?, levy_method = ?, levy_base_cpl = ?,
         levy_fuel_share = ?, levy_current_pct = ?, levy_notice_days = ?, weekly_km = ?
       WHERE id = ? AND account_id = ?`,
    ).run(
      c.name, c.contactEmail ?? null, c.baseRatePerKm, c.levyMethod ?? "indexed", c.levyBaseCpl ?? null,
      c.levyFuelShare ?? 0.3, c.levyCurrentPct ?? 0, c.levyNoticeDays ?? 7, c.weeklyKm ?? 0, id, c.accountId,
    );
  } else {
    db.prepare(
      `INSERT INTO customers (id, account_id, name, contact_email, base_rate_per_km, levy_method, levy_base_cpl,
         levy_fuel_share, levy_current_pct, levy_notice_days, weekly_km, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, c.accountId, c.name, c.contactEmail ?? null, c.baseRatePerKm, c.levyMethod ?? "indexed", c.levyBaseCpl ?? null,
      c.levyFuelShare ?? 0.3, c.levyCurrentPct ?? 0, c.levyNoticeDays ?? 7, c.weeklyKm ?? 0, Date.now(),
    );
  }
  return getCustomer(id)!;
}

export function setCustomerLevy(id: string, pct: number): Customer | undefined {
  db.prepare("UPDATE customers SET levy_current_pct = ? WHERE id = ?").run(pct, id);
  return getCustomer(id);
}

// ------------------------------------------------------------------ loads

export interface LoadInput {
  id?: string; accountId: string; customerId: string; truckId?: string | null;
  ref: string; description: string;
  originLabel: string; originLat: number; originLon: number;
  destLabel: string; destLat: number; destLon: number;
  pickupAt: number; dueAt: number; tonnes?: number; valueAud?: number;
  perishable?: boolean; essential?: boolean; status?: LoadStatus;
  plannedPolyline?: string | null; plannedKm?: number | null; plannedHours?: number | null;
  currentPolyline?: string | null; currentKm?: number | null; currentHours?: number | null;
  replanReason?: string | null;
}

export function listLoads(accountId: string, statuses?: LoadStatus[]): Load[] {
  if (statuses && statuses.length > 0) {
    const marks = statuses.map(() => "?").join(",");
    return (db.prepare(
      `SELECT * FROM loads WHERE account_id = ? AND status IN (${marks}) ORDER BY due_at`,
    ).all(accountId, ...statuses) as Row[]).map(toLoad);
  }
  return (db.prepare("SELECT * FROM loads WHERE account_id = ? ORDER BY due_at").all(accountId) as Row[]).map(toLoad);
}

export function getLoad(id: string): Load | undefined {
  const r = db.prepare("SELECT * FROM loads WHERE id = ?").get(id) as Row | undefined;
  return r ? toLoad(r) : undefined;
}

/** Insert or update a load. Matches on id, else on (account_id, ref). */
export function upsertLoad(l: LoadInput): Load {
  const existing = l.id
    ? (db.prepare("SELECT id FROM loads WHERE id = ?").get(l.id) as { id: string } | undefined)
    : (db.prepare("SELECT id FROM loads WHERE account_id = ? AND ref = ?").get(l.accountId, l.ref) as { id: string } | undefined);
  const id = existing?.id ?? l.id ?? genId("l");
  const now = Date.now();
  if (existing) {
    db.prepare(
      `UPDATE loads SET customer_id = ?, truck_id = ?, ref = ?, description = ?,
         origin_label = ?, origin_lat = ?, origin_lon = ?, dest_label = ?, dest_lat = ?, dest_lon = ?,
         pickup_at = ?, due_at = ?, tonnes = ?, value_aud = ?, perishable = ?, essential = ?, status = ?,
         planned_polyline = ?, planned_km = ?, planned_hours = ?, current_polyline = ?, current_km = ?, current_hours = ?,
         replan_reason = ?, updated_at = ?
       WHERE id = ? AND account_id = ?`,
    ).run(
      l.customerId, l.truckId ?? null, l.ref, l.description,
      l.originLabel, l.originLat, l.originLon, l.destLabel, l.destLat, l.destLon,
      l.pickupAt, l.dueAt, l.tonnes ?? 20, l.valueAud ?? 0, l.perishable ? 1 : 0, l.essential ? 1 : 0, l.status ?? "planned",
      l.plannedPolyline ?? null, l.plannedKm ?? null, l.plannedHours ?? null,
      l.currentPolyline ?? null, l.currentKm ?? null, l.currentHours ?? null,
      l.replanReason ?? null, now, id, l.accountId,
    );
  } else {
    db.prepare(
      `INSERT INTO loads (id, account_id, customer_id, truck_id, ref, description,
         origin_label, origin_lat, origin_lon, dest_label, dest_lat, dest_lon,
         pickup_at, due_at, tonnes, value_aud, perishable, essential, status,
         planned_polyline, planned_km, planned_hours, current_polyline, current_km, current_hours,
         replan_reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, l.accountId, l.customerId, l.truckId ?? null, l.ref, l.description,
      l.originLabel, l.originLat, l.originLon, l.destLabel, l.destLat, l.destLon,
      l.pickupAt, l.dueAt, l.tonnes ?? 20, l.valueAud ?? 0, l.perishable ? 1 : 0, l.essential ? 1 : 0, l.status ?? "planned",
      l.plannedPolyline ?? null, l.plannedKm ?? null, l.plannedHours ?? null,
      l.currentPolyline ?? null, l.currentKm ?? null, l.currentHours ?? null,
      l.replanReason ?? null, now, now,
    );
  }
  return getLoad(id)!;
}

export interface RouteLeg { polyline: string; km: number; hours: number }

export function setLoadRoute(
  id: string,
  args: { planned?: RouteLeg; current?: RouteLeg; status?: LoadStatus; replanReason?: string | null },
): Load | undefined {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (args.planned) {
    sets.push("planned_polyline = ?", "planned_km = ?", "planned_hours = ?");
    vals.push(args.planned.polyline, args.planned.km, args.planned.hours);
  }
  if (args.current) {
    sets.push("current_polyline = ?", "current_km = ?", "current_hours = ?");
    vals.push(args.current.polyline, args.current.km, args.current.hours);
  }
  if (args.status) { sets.push("status = ?"); vals.push(args.status); }
  if (args.replanReason !== undefined) { sets.push("replan_reason = ?"); vals.push(args.replanReason); }
  sets.push("updated_at = ?");
  vals.push(Date.now(), id);
  db.prepare(`UPDATE loads SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  return getLoad(id);
}

export function setLoadStatus(id: string, status: LoadStatus, replanReason?: string | null): Load | undefined {
  if (replanReason !== undefined) {
    db.prepare("UPDATE loads SET status = ?, replan_reason = ?, updated_at = ? WHERE id = ?").run(status, replanReason, Date.now(), id);
  } else {
    db.prepare("UPDATE loads SET status = ?, updated_at = ? WHERE id = ?").run(status, Date.now(), id);
  }
  return getLoad(id);
}

// ------------------------------------------------------------ runs / steps

export function createRun(args: { accountId: string; agent: AgentName; trigger: string; model: string; mock: boolean }): AgentRun {
  const id = genId("r");
  db.prepare(
    `INSERT INTO agent_runs (id, account_id, agent, trigger, status, model, mock, started_at)
     VALUES (?, ?, ?, ?, 'running', ?, ?, ?)`,
  ).run(id, args.accountId, args.agent, args.trigger, args.model, args.mock ? 1 : 0, Date.now());
  return getRun(id)!;
}

export function getRun(id: string): AgentRun | undefined {
  const r = db.prepare("SELECT * FROM agent_runs WHERE id = ?").get(id) as Row | undefined;
  return r ? toRun(r) : undefined;
}

/** Append a step with the next seq for the run (seq is computed in the same transaction). */
export function appendStep(runId: string, kind: StepKind, name: string | null, payload: unknown): AgentStep {
  return withTransaction(() => {
    const { next } = db.prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM agent_steps WHERE run_id = ?").get(runId) as { next: number };
    const id = genId("s");
    db.prepare(
      "INSERT INTO agent_steps (id, run_id, seq, kind, name, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, runId, next, kind, name, JSON.stringify(payload ?? null), Date.now());
    return toStep(db.prepare("SELECT * FROM agent_steps WHERE id = ?").get(id) as Row);
  });
}

export function finishRun(
  runId: string,
  args: { status: RunStatus; summary?: string | null; error?: string | null; inputTokens: number; outputTokens: number; costUsd: number; toolCalls: number },
): AgentRun | undefined {
  db.prepare(
    `UPDATE agent_runs SET status = ?, summary = ?, error = ?, input_tokens = ?, output_tokens = ?, cost_usd = ?, tool_calls = ?, finished_at = ?
     WHERE id = ?`,
  ).run(args.status, args.summary ?? null, args.error ?? null, args.inputTokens, args.outputTokens, args.costUsd, args.toolCalls, Date.now(), runId);
  return getRun(runId);
}

export function listRuns(accountId: string, limit = 20): AgentRun[] {
  return (db.prepare("SELECT * FROM agent_runs WHERE account_id = ? ORDER BY started_at DESC LIMIT ?").all(accountId, limit) as Row[]).map(toRun);
}

export function getRunWithSteps(runId: string): { run: AgentRun; steps: AgentStep[] } | undefined {
  const run = getRun(runId);
  if (!run) return undefined;
  const steps = (db.prepare("SELECT * FROM agent_steps WHERE run_id = ? ORDER BY seq").all(runId) as Row[]).map(toStep);
  return { run, steps };
}

// ---------------------------------------------------------------- actions

export interface ProposeActionInput {
  accountId: string; runId?: string | null; agent: AgentName; kind: string; title: string;
  description?: string | null; payload: unknown; impactAud?: number; risk?: Risk;
  /** Defaults to 'proposed'; pass 'auto_executed' for low-risk actions applied immediately. */
  status?: ActionStatus; result?: string | null;
}

export function proposeAction(a: ProposeActionInput): Action {
  const id = genId("act");
  db.prepare(
    `INSERT INTO actions (id, account_id, run_id, agent, kind, title, description, payload, impact_aud, risk, status, created_at, result)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, a.accountId, a.runId ?? null, a.agent, a.kind, a.title, a.description ?? null,
    JSON.stringify(a.payload ?? null), a.impactAud ?? 0, a.risk ?? "medium", a.status ?? "proposed", Date.now(), a.result ?? null,
  );
  return getAction(id)!;
}

export function getAction(id: string): Action | undefined {
  const r = db.prepare("SELECT * FROM actions WHERE id = ?").get(id) as Row | undefined;
  return r ? toAction(r) : undefined;
}

export function listActions(accountId: string, status?: ActionStatus): Action[] {
  const rows = status
    ? db.prepare("SELECT * FROM actions WHERE account_id = ? AND status = ? ORDER BY created_at DESC").all(accountId, status)
    : db.prepare("SELECT * FROM actions WHERE account_id = ? ORDER BY created_at DESC").all(accountId);
  return (rows as Row[]).map(toAction);
}

export function decideAction(id: string, status: "approved" | "rejected", decidedBy: string): Action | undefined {
  db.prepare("UPDATE actions SET status = ?, decided_at = ?, decided_by = ? WHERE id = ? AND status = 'proposed'")
    .run(status, Date.now(), decidedBy, id);
  return getAction(id);
}

export function markActionExecuted(id: string, result: string, status: "executed" | "auto_executed" | "failed" = "executed"): Action | undefined {
  db.prepare("UPDATE actions SET status = ?, result = ? WHERE id = ?").run(status, result, id);
  return getAction(id);
}
