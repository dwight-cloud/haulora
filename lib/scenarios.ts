/**
 * Demo scenarios. Each one changes the world in a way the real feeds would,
 * then wakes the agent that owns that signal. Everything a scenario writes is
 * tagged source "scenario" so reset can undo it without touching seed data.
 */
import { applyScenarioPriceShock, latestDieselPrice } from "./au/fuel-prices";
import { clearScenarioEvents, recordEvent } from "./au/road-events";
import { db } from "./db";
import { seedBrisbaneFleet } from "./seed-brisbane";
import { capacityAgent, capacityTriggerMessage, markDriversUnavailable } from "./agents/capacity";
import { disruptionAgent, disruptionTriggerMessage } from "./agents/disruption";
import { fuelAgent, fuelTriggerMessage } from "./agents/fuel";
import { runAgent, type RunResult } from "./agents/runtime";

export type ScenarioId = "diesel_spike" | "bruce_cut" | "drivers_sick" | "reset";

export const SCENARIOS: Record<ScenarioId, { title: string; blurb: string; agent: "fuel" | "disruption" | "capacity" | null }> = {
  diesel_spike: { title: "Diesel jumps 40 c/L", blurb: "A Hormuz-style shock lands on the ACCC weekly price. The fuel agent reviews every contract.", agent: "fuel" },
  bruce_cut: { title: "Bruce Highway cut at Ingham", blurb: "Flooding closes the Bruce Highway south of Ingham. The disruption agent re-plans every affected load.", agent: "disruption" },
  drivers_sick: { title: "Two drivers call in sick", blurb: "Phase 2 design: the capacity agent finds uncovered loads and proposes fatigue-legal reassignments using rules only.", agent: "capacity" },
  reset: { title: "Reset the demo", blurb: "Clears scenario events and prices, reseeds the Brisbane fleet, keeps routes and run history.", agent: null },
};

export async function runScenario(id: ScenarioId, accountId: string): Promise<{ scenario: ScenarioId; run?: RunResult; detail: string }> {
  switch (id) {
    case "diesel_spike": {
      const before = latestDieselPrice(accountId)?.dieselCpl;
      const after = applyScenarioPriceShock({ accountId, deltaCpl: 40, region: "QLD" });
      const run = await runAgent(fuelAgent, {
        accountId, trigger: `scenario:diesel_spike (+40 c/L to ${after.dieselCpl.toFixed(1)})`,
        userMessage: fuelTriggerMessage({ previousCpl: before, currentCpl: after.dieselCpl, region: "QLD", source: "scenario" }),
      });
      return { scenario: id, run, detail: `Diesel ${before?.toFixed(1) ?? "?"} → ${after.dieselCpl.toFixed(1)} c/L` };
    }
    case "bruce_cut": {
      const now = Date.now();
      const ev = recordEvent({
        accountId, source: "scenario", kind: "flood", road: "Bruce Highway",
        title: "Bruce Highway closed at Ingham (flooding)",
        description: "Herbert River flooding has closed the Bruce Highway between Ingham and Cardwell in both directions. Water over road; no heavy vehicle access.",
        lat: -18.65, lon: 146.16, radiusKm: 15, severity: "critical", startsAt: now, endsAt: now + 36 * 3600_000, active: true,
      });
      const run = await runAgent(disruptionAgent, {
        accountId, trigger: `scenario:bruce_cut (${ev.title})`, userMessage: disruptionTriggerMessage(ev),
      });
      return { scenario: id, run, detail: ev.title };
    }
    case "drivers_sick": {
      markDriversUnavailable(accountId, ["BNE-02", "BNE-05"]);
      const run = await runAgent(capacityAgent, {
        accountId, trigger: "scenario:drivers_sick (designed, rules-only)", userMessage: capacityTriggerMessage(["BNE-02", "BNE-05"]),
        model: "rules-only",
      });
      return { scenario: id, run, detail: "Capacity agent is a Phase 2 design; this run uses deterministic rules, not a model." };
    }
    case "reset": {
      const cleared = clearScenarioEvents(accountId);
      db.prepare("DELETE FROM fuel_prices WHERE account_id = ? AND source = 'scenario'").run(accountId);
      db.prepare("DELETE FROM actions WHERE account_id = ? AND status = 'proposed'").run(accountId);
      // Restore seed loads/customers without losing the HERE routes already warmed.
      const routes = db.prepare("SELECT ref, planned_polyline, planned_km, planned_hours FROM loads WHERE account_id = ? AND planned_polyline IS NOT NULL").all(accountId) as Array<{ ref: string; planned_polyline: string; planned_km: number; planned_hours: number }>;
      seedBrisbaneFleet(accountId, { force: true });
      const upd = db.prepare("UPDATE loads SET planned_polyline = ?, planned_km = ?, planned_hours = ?, current_polyline = ?, current_km = ?, current_hours = ? WHERE account_id = ? AND ref = ?");
      for (const r of routes) upd.run(r.planned_polyline, r.planned_km, r.planned_hours, r.planned_polyline, r.planned_km, r.planned_hours, accountId, r.ref);
      return { scenario: id, detail: `Reset: ${cleared} scenario events cleared, fleet reseeded, ${routes.length} routes kept.` };
    }
  }
}
