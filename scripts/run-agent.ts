/** CLI: npx tsx scripts/run-agent.ts <fuel|disruption|capacity|scenario:diesel_spike|scenario:bruce_cut|scenario:drivers_sick|scenario:reset> */
import fs from "node:fs";
import path from "node:path";
function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("="); if (eq < 0) continue;
    const k = line.slice(0, eq).trim(); const v = line.slice(eq + 1).trim();
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
loadEnvLocal();
async function main() {
  const what = process.argv[2] ?? "fuel";
  const { db } = await import("../lib/db");
  const acc = db.prepare("SELECT id FROM accounts WHERE name = ?").get("Brisbane Demo Fleet") as { id: string };
  const t0 = Date.now();
  let run;
  if (what.startsWith("scenario:")) {
    const { runScenario } = await import("../lib/scenarios");
    const res = await runScenario(what.slice(9) as never, acc.id);
    console.log("detail:", res.detail); run = res.run;
  } else {
    const { runAgent } = await import("../lib/agents/runtime");
    const { fuelAgent, fuelTriggerMessage } = await import("../lib/agents/fuel");
    const { disruptionAgent } = await import("../lib/agents/disruption");
    const { capacityAgent, capacityTriggerMessage } = await import("../lib/agents/capacity");
    const { latestDieselPrice } = await import("../lib/au/fuel-prices");
    if (what === "fuel") { const p = latestDieselPrice(acc.id); run = await runAgent(fuelAgent, { accountId: acc.id, trigger: "cli", userMessage: fuelTriggerMessage({ currentCpl: p?.dieselCpl ?? 281, region: "QLD", source: p?.source ?? "seed" }) }); }
    else if (what === "disruption") run = await runAgent(disruptionAgent, { accountId: acc.id, trigger: "cli", userMessage: `Review all active disruptions against in-flight loads. Now is ${new Date().toISOString()}.` });
    else run = await runAgent(capacityAgent, { accountId: acc.id, trigger: "cli", userMessage: capacityTriggerMessage([]), model: "rules-only" });
  }
  if (!run) return;
  for (const s of run.steps) {
    const p = typeof s.payload === "string" ? s.payload : JSON.stringify(s.payload);
    console.log(`${String(s.seq).padStart(2)} ${s.kind.padEnd(11)} ${(s.name ?? "").padEnd(26)} ${p.slice(0, 220)}`);
  }
  const r = run.run;
  console.log(`\nSTATUS ${r.status} | model ${r.model} | mock ${r.mock} | tools ${r.toolCalls} | tokens ${r.inputTokens}+${r.outputTokens} | cost US$${r.costUsd.toFixed(4)} | ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("SUMMARY:", r.summary); if (r.error) console.log("ERROR:", r.error);
}
main().catch((e) => { console.error(e); process.exit(1); });
