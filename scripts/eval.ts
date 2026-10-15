/**
 * Eval runner.
 *
 *   npx tsx scripts/eval.ts [fuel_levy|disruption_triage|all] [--live]
 *
 * Two suites, 50 golden cases each (evals/*.json):
 *   fuel_levy          the fuel agent's decision per customer: levy %, propose or not, risk tier
 *   disruption_triage  the disruption agent's decision per load: reroute / hold / proceed / escalate
 *
 * Default mode scores the deterministic decision layer the agents call (the
 * engine and the rules), which is what must be right for the agent to be
 * right. --live additionally asks the pinned model to make each decision from
 * the same inputs through a single structured call, and scores that too, so
 * the report separates "the maths is right" from "the model follows the
 * rules". Results are written to eval_runs for the UI.
 */
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

interface CaseResult { id: string; pass: boolean; expected: unknown; actual: unknown; notes?: string; ms?: number }

function p95(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(0.95 * (s.length - 1)))];
}

async function main() {
  const which = process.argv[2] ?? "all";
  const live = process.argv.includes("--live");
  const { db } = await import("../lib/db");
  const { genId } = await import("../lib/domain/schema");
  const { DEFAULT_MODEL, costUsd } = await import("../lib/agents/runtime");
  const model = live ? DEFAULT_MODEL : "rules";
  const openai = live ? new (await import("openai")).default({ apiKey: process.env.OPENAI_API_KEY }) : null;
  let totalIn = 0, totalOut = 0;

  async function ask<T>(system: string, user: string): Promise<{ out: T; ms: number }> {
    const t0 = Date.now();
    const res = await openai!.chat.completions.create({
      model: DEFAULT_MODEL, messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" }, max_completion_tokens: 300,
    });
    totalIn += res.usage?.prompt_tokens ?? 0; totalOut += res.usage?.completion_tokens ?? 0;
    return { out: JSON.parse(res.choices[0].message.content ?? "{}") as T, ms: Date.now() - t0 };
  }

  const suites: Array<{ suite: string; results: CaseResult[]; latencies: number[] }> = [];

  // ---------- Suite 1: fuel levy ----------
  if (which === "all" || which === "fuel_levy") {
    const { computeLevyPct, levyDelta } = await import("../lib/au/fuel-levy");
    const { riskForWeeklyDelta, PROPOSAL_THRESHOLD_PP } = await import("../lib/agents/fuel");
    const file = JSON.parse(fs.readFileSync(path.join(process.cwd(), "evals/fuel_levy_cases.json"), "utf8"));
    const cases: Array<{ id: string; input: Record<string, never> & { customer: Record<string, never>; currentCpl: number }; expected: Record<string, unknown> }> = file.cases ?? file;
    const tol = file.tolerances?.levyPct ?? 0.05;
    const results: CaseResult[] = []; const lat: number[] = [];
    for (const c of cases) {
      const cu = c.input.customer as unknown as { levyMethod: "indexed" | "fixed" | "none"; levyBaseCpl?: number; levyFuelShare: number; levyCurrentPct: number; baseRatePerKm: number; weeklyKm: number };
      let actual: Record<string, unknown>;
      try {
        const pct = computeLevyPct({ currentCpl: c.input.currentCpl, baseCpl: cu.levyBaseCpl ?? 0, fuelShare: cu.levyFuelShare, method: cu.levyMethod, fixedPct: cu.levyMethod === "fixed" ? cu.levyCurrentPct : undefined });
        const d = levyDelta({ customer: cu, newLevyPct: pct });
        const shouldPropose = cu.levyMethod === "indexed" && Math.abs(pct - cu.levyCurrentPct) >= PROPOSAL_THRESHOLD_PP;
        actual = { levyPct: pct, shouldPropose, riskLevel: riskForWeeklyDelta(d.weeklyRevenueDeltaAud), noticeRequired: shouldPropose };
      } catch (e) {
        actual = { error: true, message: e instanceof Error ? e.message : String(e) };
      }
      const exp = c.expected;
      let pass: boolean;
      if (exp.error) pass = actual.error === true;
      else pass = !actual.error
        && Math.abs(Number(actual.levyPct) - Number(exp.levyPct)) <= tol
        && actual.shouldPropose === exp.shouldPropose
        && (!exp.shouldPropose || actual.riskLevel === exp.riskLevel)
        && actual.noticeRequired === exp.noticeRequired;
      const r: CaseResult = { id: c.id, pass, expected: exp, actual };
      if (live && openai && !exp.error) {
        const sys = `You are the fuel agent. Given a customer contract and the current diesel price, decide: levyPct (number, the indexed levy = (current-base)/base*fuelShare*100, clamped at 0; fixed → the fixed pct; none → 0), shouldPropose (true only for indexed contracts when |levyPct - levyCurrentPct| >= ${PROPOSAL_THRESHOLD_PP}), riskLevel by |weekly revenue delta| = baseRatePerKm*weeklyKm*(levyPct-levyCurrentPct)/100: low < 500, medium < 3000, else high. Reply with JSON {levyPct, shouldPropose, riskLevel}.`;
        try {
          const { out, ms } = await ask<{ levyPct: number; shouldPropose: boolean; riskLevel: string }>(sys, JSON.stringify(c.input));
          lat.push(ms);
          const livePass = Math.abs(Number(out.levyPct) - Number(exp.levyPct)) <= 0.25 && out.shouldPropose === exp.shouldPropose && (!exp.shouldPropose || out.riskLevel === exp.riskLevel);
          r.notes = `model: ${livePass ? "pass" : "FAIL"} ${JSON.stringify(out)}`; r.ms = ms;
          (r as CaseResult & { livePass?: boolean }).livePass = livePass;
        } catch (e) { r.notes = `model error: ${e instanceof Error ? e.message : String(e)}`; }
      }
      results.push(r);
    }
    suites.push({ suite: "fuel_levy", results, latencies: lat });
  }

  // ---------- Suite 2: disruption triage ----------
  if (which === "all" || which === "disruption_triage") {
    const { decide } = await import("../lib/agents/disruption");
    const file = JSON.parse(fs.readFileSync(path.join(process.cwd(), "evals/disruption_cases.json"), "utf8"));
    const cases: Array<{ id: string; input: { load: Record<string, unknown>; event: Record<string, unknown>; detourHoursIfRerouted: number | null; nowIso: string }; expected: Record<string, unknown> }> = file.cases ?? file;
    const results: CaseResult[] = []; const lat: number[] = [];
    for (const c of cases) {
      const now = Date.parse(c.input.nowIso);
      const load = c.input.load as { status: string; dueAtIso: string; essential: boolean; perishable: boolean; plannedHours: number };
      const ev = c.input.event as { severity: string; radiusKm?: number; nearestKm: number };
      const d = decide({
        load: { status: load.status as never, dueAt: Date.parse(load.dueAtIso), essential: load.essential, perishable: load.perishable, plannedHours: load.plannedHours },
        // The golden set expresses the detour as extra hours on top of the remaining trip; decide() takes the total.
        event: { severity: ev.severity as never, radiusKm: ev.radiusKm ?? 5 }, nearestKm: ev.nearestKm,
        detourHours: c.input.detourHoursIfRerouted == null ? null : load.plannedHours + c.input.detourHoursIfRerouted, now,
      });
      const actual = { decision: d.decision, customerNoticeRequired: d.decision !== "proceed" };
      const pass = actual.decision === c.expected.decision && actual.customerNoticeRequired === c.expected.customerNoticeRequired;
      const r: CaseResult = { id: c.id, pass, expected: c.expected, actual };
      if (live && openai) {
        const sys = `You are the disruption agent. Decide for one load: "proceed" if nearestKm > radiusKm or severity is minor; else "escalate" if severity is critical and status is en_route; else "reroute" if detourHoursIfRerouted is not null and <= hours until due (dueAtIso - nowIso); else "escalate" if the load is essential or perishable; else "hold". Reply JSON {decision, customerNoticeRequired (true unless proceed)}.`;
        try {
          const { out, ms } = await ask<{ decision: string; customerNoticeRequired: boolean }>(sys, JSON.stringify(c.input));
          lat.push(ms);
          const livePass = out.decision === c.expected.decision && out.customerNoticeRequired === c.expected.customerNoticeRequired;
          r.notes = `model: ${livePass ? "pass" : "FAIL"} ${JSON.stringify(out)}`; r.ms = ms;
          (r as CaseResult & { livePass?: boolean }).livePass = livePass;
        } catch (e) { r.notes = `model error: ${e instanceof Error ? e.message : String(e)}`; }
      }
      results.push(r);
    }
    suites.push({ suite: "disruption_triage", results, latencies: lat });
  }

  const cost = live ? costUsd(DEFAULT_MODEL, totalIn, totalOut) : 0;
  for (const s of suites) {
    const passed = s.results.filter((r) => r.pass).length;
    const livePassed = live ? s.results.filter((r) => (r as CaseResult & { livePass?: boolean }).livePass).length : null;
    const report = { mode: live ? "rules+model" : "rules", cases: s.results, livePassed, tokens: live ? { in: totalIn, out: totalOut } : null };
    db.prepare("INSERT INTO eval_runs (id, suite, model, total, passed, cost_usd, p95_ms, report, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(genId("eval"), s.suite, model, s.results.length, passed, cost / suites.length, p95(s.latencies), JSON.stringify(report), Date.now());
    console.log(`${s.suite}: rules ${passed}/${s.results.length}${live ? ` | model ${livePassed}/${s.results.length}, p95 ${p95(s.latencies)} ms` : ""}`);
    for (const r of s.results.filter((x) => !x.pass || (live && !(x as CaseResult & { livePass?: boolean }).livePass))) console.log(`  ${r.id}: rules ${r.pass ? "ok" : "FAIL"} ${r.notes ?? ""}`);
  }
  if (live) console.log(`model cost US$${cost.toFixed(4)} (${totalIn}+${totalOut} tokens)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
