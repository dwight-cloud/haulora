/**
 * Populate a realistic day of activity so a first-time reviewer sees a working
 * fleet, not an empty queue.
 *
 *   npx tsx scripts/demo-activity.ts
 *
 * Runs the three AI helpers on the live model (about US$0.50 total), accepts
 * and declines a few suggestions as the dispatcher, files one driver road
 * report, then tidies the end state: diesel back to the reference price,
 * scenario road events cleared, trucks back on duty, a few suggestions left
 * waiting. History (checks, decisions, notices) is kept.
 */
import fs from "node:fs";
import path from "node:path";
for (const raw of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const l = raw.trim(); if (!l || l.startsWith("#")) continue;
  const i = l.indexOf("="); if (i > 0 && process.env[l.slice(0, i)] === undefined) process.env[l.slice(0, i)] = l.slice(i + 1);
}

async function main() {
  const { db } = await import("../lib/db");
  const { runScenario } = await import("../lib/scenarios");
  const { listActions, decideAction, listTrucks, updateTruckPosition } = await import("../lib/domain/repo");
  const { execute } = await import("../lib/agents/executor");
  const { recordEvent, deactivateEvent } = await import("../lib/au/road-events");
  const { runAgent } = await import("../lib/agents/runtime");
  const { disruptionAgent, disruptionTriggerMessage } = await import("../lib/agents/disruption");
  const { seedBrisbaneFleet } = await import("../lib/seed-brisbane");

  const acc = db.prepare("SELECT id FROM accounts WHERE name = ?").get("Brisbane Demo Fleet") as { id: string };
  const A = acc.id;
  const by = "dispatch@demo.local";
  const log = (m: string) => console.log(`• ${m}`);

  // Start from the seed but keep warmed routes.
  const routes = db.prepare("SELECT ref, planned_polyline, planned_km, planned_hours FROM loads WHERE account_id = ? AND planned_polyline IS NOT NULL").all(A) as Array<{ ref: string; planned_polyline: string; planned_km: number; planned_hours: number }>;
  seedBrisbaneFleet(A, { force: true });
  const upd = db.prepare("UPDATE loads SET planned_polyline=?, planned_km=?, planned_hours=?, current_polyline=?, current_km=?, current_hours=? WHERE account_id=? AND ref=?");
  for (const r of routes) upd.run(r.planned_polyline, r.planned_km, r.planned_hours, r.planned_polyline, r.planned_km, r.planned_hours, A, r.ref);
  log(`fleet reseeded, ${routes.length} routes kept`);

  // 1. Yesterday: diesel moved, fuel helper ran, dispatcher accepted two, declined one, left one.
  let r = await runScenario("diesel_spike", A);
  log(`fuel check: ${r.run?.run.status}, US$${r.run?.run.costUsd.toFixed(3)}`);
  let pending = listActions(A, "proposed").filter((a) => a.agent === "fuel" && a.kind === "rate_card_update");
  pending.sort((a, b) => b.impactAud - a.impactAud);
  for (const a of pending.slice(0, 2)) { decideAction(a.id, "approved", by); execute(a.id, by); log(`accepted: ${a.title}`); }
  if (pending[2]) { decideAction(pending[2].id, "rejected", by); log(`declined: ${pending[2].title}`); }
  log(`left waiting: ${pending.slice(3).map((a) => a.title).join("; ") || "none"}`);

  // 2. This morning: flood at Ingham, disruption helper ran.
  r = await runScenario("bruce_cut", A);
  log(`road-problem check: ${r.run?.run.status}, US$${r.run?.run.costUsd.toFixed(3)}`);

  // 3. A driver reports water over the road on the Warrego near Gatton; helper checks every job on it.
  const trucks = listTrucks(A);
  const ev = recordEvent({ accountId: A, source: "driver", kind: "flood", road: "Warrego Highway", title: "Driver report: water over the road on the Warrego Highway near Gatton", description: "Reported from the cab of BNE-03: water across both lanes, cars turning back.", lat: -27.56, lon: 152.28, radiusKm: 10, severity: "major", startsAt: Date.now() - 2 * 3600_000, endsAt: Date.now() + 6 * 3600_000, active: true });
  const dr = await runAgent(disruptionAgent, { accountId: A, trigger: `driver report by ${trucks[2]?.driverName ?? "driver"} (${trucks[2]?.code ?? "BNE-03"})`, userMessage: disruptionTriggerMessage(ev) });
  log(`driver report check: ${dr.run.status}, US$${dr.run.costUsd.toFixed(3)}`);
  // Dispatcher accepted the first re-route that came out of it, if any.
  const replans = listActions(A, "proposed").filter((a) => a.kind === "replan_load");
  if (replans[0]) { decideAction(replans[0].id, "approved", by); execute(replans[0].id, by); log(`accepted: ${replans[0].title}`); }

  // 4. Two drivers called in sick; driver-cover helper ran (rules only).
  r = await runScenario("drivers_sick", A);
  log(`driver-cover check: ${r.run?.run.status}`);

  // ---- Tidy the end state so the scenario buttons still tell a clean story ----
  db.prepare("DELETE FROM fuel_prices WHERE account_id = ? AND source = 'scenario'").run(A);
  for (const e of db.prepare("SELECT id FROM road_events WHERE account_id = ? AND source IN ('scenario','driver') AND active = 1").all(A) as Array<{ id: string }>) deactivateEvent(e.id);
  for (const t of listTrucks(A)) if (t.status === "off_duty" && t.code !== "BNE-08") updateTruckPosition(t.id, t.lat, t.lon, "idle");
  // Leave at most 3 suggestions waiting: the newest capacity ones beyond that are declined as "covered by phone".
  const waiting = listActions(A, "proposed");
  for (const a of waiting.slice(3)) decideAction(a.id, "rejected", by);
  const stats = {
    runs: (db.prepare("SELECT COUNT(*) n FROM agent_runs WHERE account_id=?").get(A) as { n: number }).n,
    executed: (db.prepare("SELECT COUNT(*) n FROM actions WHERE account_id=? AND status IN ('executed','auto_executed')").get(A) as { n: number }).n,
    rejected: (db.prepare("SELECT COUNT(*) n FROM actions WHERE account_id=? AND status='rejected'").get(A) as { n: number }).n,
    waiting: (db.prepare("SELECT COUNT(*) n FROM actions WHERE account_id=? AND status='proposed'").get(A) as { n: number }).n,
    diesel: (db.prepare("SELECT diesel_cpl FROM fuel_prices WHERE account_id=? ORDER BY captured_at DESC LIMIT 1").get(A) as { diesel_cpl: number }).diesel_cpl,
    activeEvents: (db.prepare("SELECT COUNT(*) n FROM road_events WHERE account_id=? AND active=1").get(A) as { n: number }).n,
    spendUsd: (db.prepare("SELECT COALESCE(SUM(cost_usd),0) c FROM agent_runs WHERE account_id=?").get(A) as { c: number }).c,
  };
  console.log(stats);
}
main().catch((e) => { console.error(e); process.exit(1); });
