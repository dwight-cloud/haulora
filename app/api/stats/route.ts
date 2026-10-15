import { NextRequest, NextResponse } from "next/server";
import { requireDispatcher } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { latestDieselPrice, priceHistory } from "@/lib/au/fuel-prices";
import { listActiveEvents } from "@/lib/au/road-events";
import { CAPS, DEFAULT_MODEL, isMockMode, spendLast24h } from "@/lib/agents/runtime";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;
  const a = auth.session.accountId;
  const q = <T,>(sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as T;
  const loads = q<{ n: number }>("SELECT COUNT(*) n FROM loads WHERE account_id=? AND status IN ('planned','en_route','delayed','rerouted','held')", a).n;
  const trucks = q<{ n: number; moving: number }>("SELECT COUNT(*) n, SUM(status='moving') moving FROM trucks WHERE account_id=?", a);
  const pending = q<{ n: number; impact: number }>("SELECT COUNT(*) n, COALESCE(SUM(impact_aud),0) impact FROM actions WHERE account_id=? AND status='proposed'", a);
  const executed = q<{ n: number; impact: number }>("SELECT COUNT(*) n, COALESCE(SUM(impact_aud),0) impact FROM actions WHERE account_id=? AND status IN ('executed','auto_executed')", a);
  const runs = q<{ n: number; cost: number; tokens: number }>("SELECT COUNT(*) n, COALESCE(SUM(cost_usd),0) cost, COALESCE(SUM(input_tokens+output_tokens),0) tokens FROM agent_runs WHERE account_id=?", a);
  const latestEval = db.prepare("SELECT suite, model, total, passed, cost_usd, p95_ms, created_at FROM eval_runs ORDER BY created_at DESC").all() as unknown[];
  return NextResponse.json({
    loadsInFlight: loads, trucks: trucks.n, trucksMoving: trucks.moving ?? 0,
    pendingActions: pending.n, pendingImpactAud: pending.impact,
    executedActions: executed.n, executedImpactAud: executed.impact,
    runs: runs.n, totalCostUsd: runs.cost, totalTokens: runs.tokens,
    spend24hUsd: spendLast24h(), caps: CAPS, model: DEFAULT_MODEL, mock: isMockMode(),
    diesel: latestDieselPrice(a), dieselHistory: priceHistory(a, 12),
    activeEvents: listActiveEvents(a).length,
    evals: latestEval,
  });
}
