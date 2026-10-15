/**
 * Capacity agent (Phase 2, designed; rules-only in this POC).
 *
 * Trigger: a driver or truck becomes unavailable, or a load has no truck.
 * Job: find uncovered loads and propose fatigue-legal reassignments from the
 * idle fleet, cutting empty kilometres where it can. In this POC the agent
 * runs its scripted plan against deterministic rules so the UI, trace and
 * approval flow are real, but no model is called. The tool surface is the one
 * the Phase 2 build would expose to a model.
 *
 * Fatigue rule encoded: Heavy Vehicle National Law standard hours for a solo
 * driver, 12 h work in any 24 h with 7 h continuous rest, and a 15 min break
 * after 5.5 h. The amended HVNL (1 Aug 2026) adds templated ACA-F hour tables
 * up to 15.5 h work per 24 h for accredited operators; those tables are a
 * configuration item for the pilot, not a rule the POC guesses at.
 */
import { haversineKm } from "../au/road-events";
import { getLoad, listLoads, listTrucks, updateTruckPosition } from "../domain/repo";
import { propose } from "./executor";
import type { AgentSpec, RunContext, ToolDef } from "./runtime";
import type { Load, Truck } from "../domain/types";

export const FATIGUE = { maxWorkHoursPer24: 12, minContinuousRestHours: 7, breakAfterWorkHours: 5.5, breakMinutes: 15 };

/** Hours a driver can still legally work today. Demo: derived from truck status, since no ELD/EWD feed exists yet. */
export function hoursAvailableToday(t: Truck): number {
  if (t.status === "out_of_service" || t.status === "off_duty") return 0;
  if (t.status === "moving") return 4; // already part-way through a shift
  return FATIGUE.maxWorkHoursPer24; // idle at depot, rested
}

export function legalWithinShift(hoursNeeded: number, hoursAvailable: number): { legal: boolean; breaksRequired: number; reason: string } {
  const breaks = Math.floor(hoursNeeded / FATIGUE.breakAfterWorkHours);
  const total = hoursNeeded + (breaks * FATIGUE.breakMinutes) / 60;
  if (total <= hoursAvailable) return { legal: true, breaksRequired: breaks, reason: `${total.toFixed(1)} h incl. ${breaks} break(s) fits ${hoursAvailable} h available.` };
  return { legal: false, breaksRequired: breaks, reason: `${total.toFixed(1)} h incl. breaks exceeds ${hoursAvailable} h available today; needs a two-up driver, a changeover, or a next-day start.` };
}

// ---------- Tools ----------

const listFleet: ToolDef<Record<string, never>> = {
  name: "list_fleet_availability",
  risk: "read",
  description: "Every truck with status, position, profile and the hours its driver can still legally work today.",
  parameters: { type: "object", properties: {} },
  handler: (_a, ctx) => listTrucks(ctx.accountId).map((t) => ({
    truckId: t.id, code: t.code, driver: t.driverName, status: t.status, lat: t.lat, lon: t.lon,
    grossKg: t.grossKg, axleCount: t.axleCount, hoursAvailableToday: hoursAvailableToday(t),
  })),
};

const listUncovered: ToolDef<Record<string, never>> = {
  name: "list_uncovered_loads",
  risk: "read",
  description: "In-flight loads with no truck, or whose truck is off duty or out of service.",
  parameters: { type: "object", properties: {} },
  handler: (_a, ctx) => {
    const trucks = new Map(listTrucks(ctx.accountId).map((t) => [t.id, t]));
    return listLoads(ctx.accountId, ["planned", "delayed", "held"]).filter((l) => {
      const t = l.truckId ? trucks.get(l.truckId) : undefined;
      return !t || t.status === "off_duty" || t.status === "out_of_service";
    }).map((l) => ({
      loadId: l.id, ref: l.ref, origin: l.originLabel, destination: l.destLabel, pickupAtIso: new Date(l.pickupAt).toISOString(),
      dueAtIso: new Date(l.dueAt).toISOString(), plannedHours: l.plannedHours, plannedKm: l.plannedKm, tonnes: l.tonnes,
      essential: l.essential, perishable: l.perishable, originLat: l.originLat, originLon: l.originLon,
    }));
  },
};

const fatigueCheck: ToolDef<{ truckId: string; hoursNeeded: number }> = {
  name: "fatigue_check",
  risk: "read",
  description: "Is the trip legal for this driver today under HVNL standard hours? Returns breaks required and the reason.",
  parameters: { type: "object", properties: { truckId: { type: "string" }, hoursNeeded: { type: "number" } }, required: ["truckId", "hoursNeeded"] },
  handler: ({ truckId, hoursNeeded }, ctx) => {
    const t = listTrucks(ctx.accountId).find((x) => x.id === truckId);
    if (!t) return { error: "Truck not found" };
    return legalWithinShift(hoursNeeded, hoursAvailableToday(t));
  },
};

const proposeReassignment: ToolDef<{ loadId: string; truckId: string; rationale: string; emptyKm: number }> = {
  name: "propose_reassignment",
  risk: "propose",
  description: "Propose moving a load onto another truck. Medium risk; the dispatcher decides. Include the empty km the truck must run to the pickup.",
  parameters: {
    type: "object",
    properties: { loadId: { type: "string" }, truckId: { type: "string" }, rationale: { type: "string" }, emptyKm: { type: "number" } },
    required: ["loadId", "truckId", "rationale", "emptyKm"],
  },
  handler: ({ loadId, truckId, rationale, emptyKm }, ctx) => {
    const l = getLoad(loadId);
    const t = listTrucks(ctx.accountId).find((x) => x.id === truckId);
    if (!l || !t) return { error: "Load or truck not found" };
    const action = propose({
      accountId: ctx.accountId, runId: ctx.runId, agent: "capacity",
      title: `${l.ref}: reassign to ${t.code} (${t.driverName ?? "driver"}), ${emptyKm.toFixed(0)} km empty to pickup`,
      description: rationale, impactAud: l.valueAud, risk: "medium",
      payload: { kind: "flag_for_review", data: { subject: `Reassign ${l.ref} to ${t.code}`, detail: rationale, loadId } },
    });
    ctx.notes.push(`Proposed ${l.ref} → ${t.code}.`);
    return { actionId: action.id, status: action.status };
  },
};

const escalateUncovered: ToolDef<{ loadId: string; detail: string }> = {
  name: "escalate_uncovered",
  risk: "propose",
  description: "No legal reassignment exists today. Hand the load to a human with the options (subcontract, two-up, next-day).",
  parameters: { type: "object", properties: { loadId: { type: "string" }, detail: { type: "string" } }, required: ["loadId", "detail"] },
  handler: ({ loadId, detail }, ctx) => {
    const l = getLoad(loadId);
    if (!l) return { error: "Load not found" };
    const action = propose({
      accountId: ctx.accountId, runId: ctx.runId, agent: "capacity", title: `${l.ref}: no legal cover today`, description: detail,
      impactAud: l.valueAud, risk: "high", payload: { kind: "flag_for_review", data: { subject: "Uncovered load", detail, loadId } },
    });
    ctx.notes.push(`Escalated ${l.ref}: uncovered.`);
    return { actionId: action.id, status: action.status };
  },
};

// ---------- Rules-only plan ----------

async function mockPlan(ctx: RunContext) {
  const steps: { tool: string; args: Record<string, unknown>; thought?: string }[] = [
    { tool: "list_fleet_availability", args: {}, thought: "Who can still drive today, and from where?" },
    { tool: "list_uncovered_loads", args: {} },
  ];
  const trucks = listTrucks(ctx.accountId);
  const truckById = new Map(trucks.map((t) => [t.id, t]));
  const uncovered: Load[] = listLoads(ctx.accountId, ["planned", "delayed", "held"]).filter((l) => {
    const t = l.truckId ? truckById.get(l.truckId) : undefined;
    return !t || t.status === "off_duty" || t.status === "out_of_service";
  });
  const taken = new Set<string>();
  let proposals = 0, escalations = 0;
  // Essential and perishable first, then earliest pickup.
  uncovered.sort((a, b) => Number(b.essential || b.perishable) - Number(a.essential || a.perishable) || a.pickupAt - b.pickupAt);
  for (const l of uncovered) {
    const hoursNeeded = l.plannedHours ?? 8;
    const candidates = trucks
      .filter((t) => !taken.has(t.id) && t.status === "idle" && t.grossKg >= 22500)
      .map((t) => ({ t, emptyKm: haversineKm({ lat: t.lat, lon: t.lon }, { lat: l.originLat, lon: l.originLon }) }))
      .sort((a, b) => a.emptyKm - b.emptyKm);
    let placed = false;
    for (const { t, emptyKm } of candidates) {
      steps.push({ tool: "fatigue_check", args: { truckId: t.id, hoursNeeded: hoursNeeded + emptyKm / 80 } });
      const check = legalWithinShift(hoursNeeded + emptyKm / 80, hoursAvailableToday(t));
      if (check.legal) {
        taken.add(t.id);
        steps.push({ tool: "propose_reassignment", args: { loadId: l.id, truckId: t.id, emptyKm, rationale: `${t.code} is idle ${emptyKm.toFixed(0)} km from the pickup with ${hoursAvailableToday(t)} h available. ${check.reason}` } });
        proposals += 1; placed = true; break;
      }
    }
    if (!placed) {
      steps.push({ tool: "escalate_uncovered", args: { loadId: l.id, detail: `No idle truck can legally cover ${l.ref} (${hoursNeeded.toFixed(1)} h) today. Options: subcontract, two-up crew, or next-day departure${l.essential ? "; essential freight, so a subcontractor is the usual call" : ""}.` } });
      escalations += 1;
    }
  }
  return { steps, summary: `Rules-only run: ${uncovered.length} uncovered loads, ${proposals} reassignments proposed, ${escalations} escalated. Phase 2 adds a model for trade-offs the rules cannot rank (customer priority, backhaul value, subcontractor cost).` };
}

export const capacityAgent: AgentSpec = {
  name: "capacity",
  system: "Capacity agent. Designed for Phase 2; this POC runs rules only.",
  tools: [listFleet, listUncovered, fatigueCheck, proposeReassignment, escalateUncovered],
  maxSteps: 30,
  forceMock: true,
  mockPlan,
};

/** Scenario helper: take drivers off the road, then describe the trigger. */
export function capacityTriggerMessage(truckCodes: string[]): string {
  return `Drivers of ${truckCodes.join(" and ")} are unavailable today. Find uncovered loads and propose legal cover.`;
}

export function markDriversUnavailable(accountId: string, truckCodes: string[]): number {
  let n = 0;
  for (const t of listTrucks(accountId)) {
    if (truckCodes.includes(t.code)) { updateTruckPosition(t.id, t.lat, t.lon, "off_duty"); n += 1; }
  }
  return n;
}
