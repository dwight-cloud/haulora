/** Shared TypeScript shapes mirroring lib/domain/schema.ts. Keep in sync. */

export type TruckStatus = "moving" | "idle" | "off_duty" | "out_of_service";
export interface Truck {
  id: string; accountId: string; code: string; rego: string | null; driverName: string | null;
  status: TruckStatus; lat: number; lon: number;
  heightM: number; grossKg: number; axleCount: number; hazardous: boolean;
  tankLitres: number; fuelPct: number; litresPer100km: number; createdAt: number;
}

export type LevyMethod = "indexed" | "fixed" | "none";
export interface Customer {
  id: string; accountId: string; name: string; contactEmail: string | null;
  baseRatePerKm: number; levyMethod: LevyMethod; levyBaseCpl: number | null;
  levyFuelShare: number; levyCurrentPct: number; levyNoticeDays: number;
  weeklyKm: number; createdAt: number;
}

export type LoadStatus = "planned" | "en_route" | "delayed" | "rerouted" | "held" | "delivered" | "cancelled";
export interface Load {
  id: string; accountId: string; customerId: string; truckId: string | null;
  ref: string; description: string;
  originLabel: string; originLat: number; originLon: number;
  destLabel: string; destLat: number; destLon: number;
  pickupAt: number; dueAt: number; tonnes: number; valueAud: number;
  perishable: boolean; essential: boolean; status: LoadStatus;
  plannedPolyline: string | null; plannedKm: number | null; plannedHours: number | null;
  currentPolyline: string | null; currentKm: number | null; currentHours: number | null;
  replanReason: string | null; createdAt: number; updatedAt: number;
}

export interface FuelPrice {
  id: string; accountId: string; capturedAt: number; region: string; dieselCpl: number; source: string;
}

export type RoadEventKind = "closure" | "flood" | "fire" | "crash" | "restriction" | "weather";
export type Severity = "minor" | "moderate" | "major" | "critical";
export interface RoadEvent {
  id: string; accountId: string; source: string; kind: RoadEventKind; road: string | null;
  title: string; description: string | null; lat: number; lon: number; radiusKm: number;
  severity: Severity; startsAt: number; endsAt: number | null; active: boolean; createdAt: number;
}

export type AgentName = "fuel" | "disruption" | "capacity";
export type RunStatus = "running" | "completed" | "failed" | "budget_exceeded";
export interface AgentRun {
  id: string; accountId: string; agent: AgentName; trigger: string; status: RunStatus;
  model: string; mock: boolean; inputTokens: number; outputTokens: number; costUsd: number;
  toolCalls: number; summary: string | null; error: string | null; startedAt: number; finishedAt: number | null;
}

export type StepKind = "system" | "thought" | "tool_call" | "tool_result" | "guardrail" | "proposal" | "final" | "error";
export interface AgentStep {
  id: string; runId: string; seq: number; kind: StepKind; name: string | null; payload: unknown; createdAt: number;
}

export type ActionStatus = "proposed" | "approved" | "rejected" | "executed" | "auto_executed" | "failed";
export type Risk = "low" | "medium" | "high";
export interface Action {
  id: string; accountId: string; runId: string | null; agent: AgentName; kind: string;
  title: string; description: string | null; payload: unknown; impactAud: number; risk: Risk;
  status: ActionStatus; createdAt: number; decidedAt: number | null; decidedBy: string | null; result: string | null;
}

/** snake_case row → camelCase object, with 0/1 → boolean for listed keys. */
export function camel<T>(row: Record<string, unknown>, boolKeys: string[] = []): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const ck = k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
    out[ck] = boolKeys.includes(k) ? Boolean(v) : v;
  }
  return out as T;
}
