/**
 * Disruption agent.
 *
 * Trigger: a new road or weather event (state traffic feed, BoM warning, or a
 * scenario). Job: find every in-flight load whose route crosses the event,
 * plan a truck-legal detour around it with HERE, and decide per load whether
 * to re-route, hold, proceed, or escalate to a human. Essential and perishable
 * freight gets priority. Every route change and every hold is a proposal.
 *
 * Decision rules (the same ones the eval set encodes):
 *   proceed   nearest point of the route is outside the event radius, or severity is minor
 *   reroute   a detour exists and still meets the load's due time
 *   hold      no detour, or the detour misses the due time, and the load is not essential or perishable
 *   escalate  essential or perishable freight that would miss its due time, or a critical event
 *             with the truck already en route inside the zone
 */
import { affectedLoads, avoidAreasParam, listActiveEvents, polylineIntersectsEvent } from "../au/road-events";
import { weatherAlongPolyline } from "../au/weather";
import { truckRoute } from "../here";
import { getCustomer, getLoad, getTruck, listLoads } from "../domain/repo";
import { propose } from "./executor";
import type { AgentSpec, RunContext, ToolDef } from "./runtime";
import type { Load, RoadEvent } from "../domain/types";

export type Decision = "reroute" | "hold" | "proceed" | "escalate";

/** Detours planned during a run, keyed by `${runId}:${loadId}`, so the model never has to carry a polyline. */
const detourCache = new Map<string, { polyline: string; km: number; hours: number; deltaKm: number; deltaHours: number; eventIds: string[] }>();

const DEFAULT_PROFILE = { heightMeters: 4.3, weightKg: 62500, axleCount: 9 };

/** Minor events (roadworks, lane restrictions) never trigger action; the rules say proceed. */
export function actionableEvents(accountId: string): RoadEvent[] {
  return listActiveEvents(accountId).filter((e) => e.severity !== "minor");
}

function hoursUntil(ms: number, now: number): number { return (ms - now) / 3600_000; }

export function decide(args: {
  load: Pick<Load, "status" | "dueAt" | "essential" | "perishable" | "plannedHours">;
  event: Pick<RoadEvent, "severity" | "radiusKm">;
  nearestKm: number;
  detourHours: number | null; // total hours for the detour route, null when none
  now: number;
}): { decision: Decision; reason: string } {
  const { load, event, nearestKm, detourHours, now } = args;
  if (nearestKm > event.radiusKm || event.severity === "minor") {
    return { decision: "proceed", reason: "Route clears the event or the impact is minor." };
  }
  const priority = load.essential || load.perishable;
  const remaining = hoursUntil(load.dueAt, now);
  if (event.severity === "critical" && load.status === "en_route" && nearestKm <= event.radiusKm) {
    return { decision: "escalate", reason: "Critical event with the truck already inside the affected zone." };
  }
  if (detourHours !== null && detourHours <= remaining) {
    return { decision: "reroute", reason: `Detour of ${detourHours.toFixed(1)} h fits inside the ${remaining.toFixed(1)} h left before the due time.` };
  }
  if (priority) {
    return { decision: "escalate", reason: `${load.essential ? "Essential" : "Perishable"} freight would miss its due time; a human needs to choose between a late delivery and a different plan.` };
  }
  return { decision: "hold", reason: detourHours === null ? "No truck-legal detour available." : `Detour of ${detourHours.toFixed(1)} h misses the due time.` };
}

// ---------- Tools ----------

const listDisruptions: ToolDef<Record<string, never>> = {
  name: "list_active_disruptions",
  risk: "read",
  description: "Active road and weather events of moderate severity or worse: kind, road, severity, centre, radius, start and expected end. Minor events are filtered out because the rule for them is always proceed.",
  parameters: { type: "object", properties: {} },
  handler: (_a, ctx) => actionableEvents(ctx.accountId),
};

const findAffected: ToolDef<Record<string, never>> = {
  name: "find_affected_loads",
  risk: "read",
  description: "Every in-flight load whose planned or current route passes through an active event, with the load's due time, cargo value, essential and perishable flags, and how close the route comes to the event centre.",
  parameters: { type: "object", properties: {} },
  handler: (_a, ctx) =>
    affectedLoads(ctx.accountId, actionableEvents(ctx.accountId)).map(({ load, event, nearestKm }) => ({
      loadId: load.id, ref: load.ref, status: load.status, customerId: load.customerId,
      origin: load.originLabel, destination: load.destLabel, dueAtIso: new Date(load.dueAt).toISOString(),
      hoursUntilDue: Number(hoursUntil(load.dueAt, ctx.now).toFixed(1)),
      plannedHours: load.plannedHours, plannedKm: load.plannedKm,
      tonnes: load.tonnes, valueAud: load.valueAud, essential: load.essential, perishable: load.perishable,
      eventId: event.id, eventKind: event.kind, eventTitle: event.title, eventSeverity: event.severity,
      eventRadiusKm: event.radiusKm, nearestKm: Number(nearestKm.toFixed(1)),
    })),
};

const weatherForLoad: ToolDef<{ loadId: string }> = {
  name: "weather_along_route",
  risk: "read",
  description: "Live forecast samples along a load's route (rain, wind gusts, derived warnings) from Open-Meteo. Use when an event is weather-related or you need to judge flood risk ahead.",
  parameters: { type: "object", properties: { loadId: { type: "string" } }, required: ["loadId"] },
  handler: async ({ loadId }, ctx) => {
    const l = getLoad(loadId);
    if (!l || l.accountId !== ctx.accountId) return { error: "Load not found" };
    const poly = l.currentPolyline ?? l.plannedPolyline;
    if (!poly) return { error: "Load has no route yet" };
    try {
      const samples = await weatherAlongPolyline(poly, 5);
      return samples.map((s) => ({ lat: s.lat, lon: s.lon, precipitationMm: s.precipitationMm, windGustKmh: s.windGustKmh, warnings: s.warnings }));
    } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  },
};

const planDetour: ToolDef<{ loadId: string }> = {
  name: "plan_detour",
  risk: "read",
  description: "Plan a truck-legal route for the load that avoids every active event, using the assigned truck's height and mass. Returns the detour's km and hours and the change versus the planned route. The route itself is kept server-side for propose_replan.",
  parameters: { type: "object", properties: { loadId: { type: "string" } }, required: ["loadId"] },
  handler: async ({ loadId }, ctx) => {
    const l = getLoad(loadId);
    if (!l || l.accountId !== ctx.accountId) return { error: "Load not found" };
    const events = actionableEvents(ctx.accountId);
    const truck = l.truckId ? getTruck(l.truckId) : undefined;
    const profile = truck ? { heightMeters: truck.heightM, weightKg: truck.grossKg, axleCount: truck.axleCount, hazardous: truck.hazardous } : DEFAULT_PROFILE;
    // From the truck's live position when it is already rolling, else from origin.
    const origin = truck && l.status === "en_route" ? { lat: truck.lat, lon: truck.lon } : { lat: l.originLat, lon: l.originLon };
    try {
      const r = await truckRoute(origin, { lat: l.destLat, lon: l.destLon }, profile, { avoidAreas: avoidAreasParam(events) });
      // Verify the detour really clears the events; HERE treats avoid areas as soft in some cases.
      const stillHit = events.filter((ev) => polylineIntersectsEvent(r.primary.polyline, ev).hits).map((ev) => ev.id);
      const km = r.primary.distanceMeters / 1000, hours = r.primary.durationSeconds / 3600;
      // Delta versus plan only makes sense from the origin. From a live position
      // the planned figures cover ground already driven, so we report totals only.
      const fromOrigin = !(truck && l.status === "en_route");
      const deltaKm = fromOrigin && l.plannedKm != null ? km - l.plannedKm : 0;
      const deltaHours = fromOrigin && l.plannedHours != null ? hours - l.plannedHours : 0;
      const entry = { polyline: r.primary.polyline, km, hours, deltaKm, deltaHours, eventIds: events.map((e) => e.id) };
      detourCache.set(`${ctx.runId}:${loadId}`, entry);
      return {
        found: stillHit.length === 0, stillCrossesEvents: stillHit, measuredFrom: fromOrigin ? "origin" : "truck's current position",
        detourKm: Number(km.toFixed(0)), detourHours: Number(hours.toFixed(1)),
        deltaKm: fromOrigin ? Number(deltaKm.toFixed(0)) : null, deltaHours: fromOrigin ? Number(deltaHours.toFixed(1)) : null,
        hoursUntilDue: Number(hoursUntil(l.dueAt, ctx.now).toFixed(1)),
        notices: r.primary.notices.slice(0, 5), tollsAud: r.primary.tolls?.total ?? null,
      };
    } catch (e) {
      return { found: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

const proposeReplan: ToolDef<{ loadId: string; reason: string }> = {
  name: "propose_replan",
  risk: "propose",
  description: "Propose switching the load to the detour planned by plan_detour. Goes to the approval queue; medium risk normally, high when the detour adds more than 3 hours or the cargo is worth more than A$100,000.",
  parameters: { type: "object", properties: { loadId: { type: "string" }, reason: { type: "string" } }, required: ["loadId", "reason"] },
  handler: ({ loadId, reason }, ctx) => {
    const l = getLoad(loadId);
    if (!l || l.accountId !== ctx.accountId) return { error: "Load not found" };
    const d = detourCache.get(`${ctx.runId}:${loadId}`);
    if (!d) return { error: "Call plan_detour for this load first" };
    const risk = d.deltaHours > 3 || l.valueAud > 100_000 ? "high" : "medium";
    const action = propose({
      accountId: ctx.accountId, runId: ctx.runId, agent: "disruption",
      title: `${l.ref}: re-route around disruption (${d.km.toFixed(0)} km, ${d.hours.toFixed(1)} h${d.deltaHours ? `, ${d.deltaHours > 0 ? "+" : ""}${d.deltaHours.toFixed(1)} h vs plan` : ""})`,
      description: reason, impactAud: l.valueAud, risk,
      payload: { kind: "replan_load", data: { loadId, polyline: d.polyline, km: d.km, hours: d.hours, reason, eventId: d.eventIds[0] } },
    });
    ctx.notes.push(`Proposed re-route for ${l.ref} (${d.hours.toFixed(1)} h via detour).`);
    return { actionId: action.id, status: action.status, risk };
  },
};

const proposeHold: ToolDef<{ loadId: string; reason: string }> = {
  name: "propose_hold",
  risk: "propose",
  description: "Propose holding the load at its origin until the event clears. Medium risk; the dispatcher decides.",
  parameters: { type: "object", properties: { loadId: { type: "string" }, reason: { type: "string" } }, required: ["loadId", "reason"] },
  handler: ({ loadId, reason }, ctx) => {
    const l = getLoad(loadId);
    if (!l || l.accountId !== ctx.accountId) return { error: "Load not found" };
    const action = propose({
      accountId: ctx.accountId, runId: ctx.runId, agent: "disruption",
      title: `${l.ref}: hold at ${l.originLabel}`, description: reason, impactAud: 0, risk: "medium",
      payload: { kind: "hold_load", data: { loadId, reason } },
    });
    ctx.notes.push(`Proposed hold for ${l.ref}.`);
    return { actionId: action.id, status: action.status };
  },
};

const escalate: ToolDef<{ loadId: string; subject: string; detail: string }> = {
  name: "escalate",
  risk: "propose",
  description: "Hand a load to a human with a clear statement of the choice they need to make. Use for essential or perishable freight that cannot meet its due time, and for critical events with a truck inside the zone.",
  parameters: { type: "object", properties: { loadId: { type: "string" }, subject: { type: "string" }, detail: { type: "string" } }, required: ["loadId", "subject", "detail"] },
  handler: ({ loadId, subject, detail }, ctx) => {
    const l = getLoad(loadId);
    if (!l || l.accountId !== ctx.accountId) return { error: "Load not found" };
    const action = propose({
      accountId: ctx.accountId, runId: ctx.runId, agent: "disruption", title: `${l.ref}: ${subject}`, description: detail,
      impactAud: l.valueAud, risk: "high", payload: { kind: "flag_for_review", data: { subject, detail, loadId } },
    });
    ctx.notes.push(`Escalated ${l.ref}: ${subject}`);
    return { actionId: action.id, status: action.status };
  },
};

const draftNotice: ToolDef<{ loadId: string; summary: string }> = {
  name: "draft_customer_notice",
  risk: "propose",
  description: "Record a short delay or re-route notice to the load's customer. Low risk: it is logged for the dispatcher to send, not sent.",
  parameters: { type: "object", properties: { loadId: { type: "string" }, summary: { type: "string", description: "two plain sentences: what happened and the new expectation" } }, required: ["loadId", "summary"] },
  handler: ({ loadId, summary }, ctx) => {
    const l = getLoad(loadId);
    if (!l || l.accountId !== ctx.accountId) return { error: "Load not found" };
    const c = getCustomer(l.customerId);
    const action = propose({
      accountId: ctx.accountId, runId: ctx.runId, agent: "disruption", title: `Notice to ${c?.name ?? "customer"} re ${l.ref}`,
      description: summary, risk: "low",
      payload: { kind: "customer_notice", data: { customerId: l.customerId, subject: `Update on consignment ${l.ref}`, body: summary, channel: "email" } },
    });
    return { actionId: action.id, status: action.status };
  },
};

// ---------- Spec ----------

const SYSTEM = `You are the disruption agent for a small Queensland road freight operator. Floods, fires, crashes and closures cut the Bruce, Warrego and Flinders highways every season, and a truck sent into a closure wastes a day and risks the cargo.

How to work:
1. List active disruptions, then find the affected loads.
2. For each affected load, call plan_detour. Use weather_along_route when the event is flood or weather related and the detour matters.
3. Decide per load using these rules, in order: proceed if the route clears the event or severity is minor; escalate if the event is critical and the truck is already en route inside the zone; reroute if a detour exists and its hours fit within the hours until due; escalate if the load is essential or perishable and would miss its due time; otherwise hold.
4. Propose the matching action (propose_replan, propose_hold, escalate). For every load that is not "proceed", also draft_customer_notice.
5. Finish with a short plain-English summary: the event, loads affected, what you proposed for each, cargo value protected, and anything a human must decide now. Australian English, AUD, no marketing language. In the summary say "delivery job" rather than "load", "new route" rather than "reroute", "needs your call" rather than "escalate", "urgent goods" rather than "essential", and "goods that spoil" rather than "perishable".

Rules: you can read and propose. You cannot change a route or a status yourself. Do not invent road names or hours; use tool outputs.`;

async function mockPlan(ctx: RunContext) {
  const steps: { tool: string; args: Record<string, unknown>; thought?: string }[] = [
    { tool: "list_active_disruptions", args: {}, thought: "What is cut right now?" },
    { tool: "find_affected_loads", args: {} },
  ];
  const affected = affectedLoads(ctx.accountId, actionableEvents(ctx.accountId));
  const seen = new Set<string>();
  let n = 0;
  for (const { load, event, nearestKm } of affected) {
    if (seen.has(load.id)) continue;
    seen.add(load.id);
    // Pre-plan to pick the decision for the script; the real tool call is recorded as a step too.
    steps.push({ tool: "plan_detour", args: { loadId: load.id }, thought: `${load.ref} runs within ${nearestKm.toFixed(0)} km of ${event.title}.` });
    let detourHours: number | null = null;
    try {
      const res = (await planDetour.handler({ loadId: load.id }, ctx)) as { found?: boolean; detourHours?: number };
      detourHours = res.found ? res.detourHours ?? null : null;
    } catch { detourHours = null; }
    const { decision, reason } = decide({ load, event, nearestKm, detourHours, now: ctx.now });
    if (decision === "reroute") steps.push({ tool: "propose_replan", args: { loadId: load.id, reason } });
    else if (decision === "hold") steps.push({ tool: "propose_hold", args: { loadId: load.id, reason } });
    else if (decision === "escalate") steps.push({ tool: "escalate", args: { loadId: load.id, subject: "needs a human decision", detail: reason } });
    if (decision !== "proceed") {
      steps.push({ tool: "draft_customer_notice", args: { loadId: load.id, summary: `${event.title} is affecting ${load.ref} between ${load.originLabel} and ${load.destLabel}. ${decision === "reroute" ? "We are re-routing and will confirm the new arrival time." : "We will confirm a revised plan shortly."}` } });
      n += 1;
    }
  }
  return { steps, summary: `Mock run: ${actionableEvents(ctx.accountId).length} actionable events, ${seen.size} loads affected, ${n} proposals raised.` };
}

export const disruptionAgent: AgentSpec = {
  name: "disruption",
  system: SYSTEM,
  tools: [listDisruptions, findAffected, weatherForLoad, planDetour, proposeReplan, proposeHold, escalate, draftNotice],
  maxSteps: 24,
  maxCostUsd: 0.5,
  mockPlan,
};

export function disruptionTriggerMessage(ev: Pick<RoadEvent, "kind" | "title" | "road" | "severity" | "endsAt">): string {
  const ends = ev.endsAt ? `expected to clear ${new Date(ev.endsAt).toISOString()}` : "no clearance time known";
  return `New ${ev.severity} ${ev.kind} event: ${ev.title}${ev.road ? ` on ${ev.road}` : ""}, ${ends}. Work through every affected load and propose what to do. Now is ${new Date().toISOString()}.`;
}

/** Convenience for the dashboard: how many in-flight loads exist right now. */
export function inFlightCount(accountId: string): number {
  return listLoads(accountId, ["planned", "en_route", "delayed", "rerouted"]).length;
}
