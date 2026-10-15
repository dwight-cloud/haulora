import { NextRequest, NextResponse } from "next/server";
import { requireDispatcher, rateLimit } from "@/lib/api-helpers";
import { runAgent } from "@/lib/agents/runtime";
import { fuelAgent, fuelTriggerMessage } from "@/lib/agents/fuel";
import { disruptionAgent } from "@/lib/agents/disruption";
import { capacityAgent, capacityTriggerMessage } from "@/lib/agents/capacity";
import { latestDieselPrice } from "@/lib/au/fuel-prices";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Run an agent on the current state without a scenario change. */
export async function POST(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;
  const limited = rateLimit(req, "agent-run", 10, 10 * 60_000);
  if (limited) return limited;
  const { agent } = await req.json().catch(() => ({}));
  const accountId = auth.session.accountId;
  if (agent === "fuel") {
    const p = latestDieselPrice(accountId);
    const run = await runAgent(fuelAgent, { accountId, trigger: "manual", userMessage: fuelTriggerMessage({ currentCpl: p?.dieselCpl ?? 281, region: p?.region ?? "QLD", source: p?.source ?? "seed" }) });
    return NextResponse.json(run);
  }
  if (agent === "disruption") {
    const run = await runAgent(disruptionAgent, { accountId, trigger: "manual", userMessage: `Review all active disruptions against in-flight loads and propose what to do. Now is ${new Date().toISOString()}.` });
    return NextResponse.json(run);
  }
  if (agent === "capacity") {
    const run = await runAgent(capacityAgent, { accountId, trigger: "manual (rules-only)", userMessage: capacityTriggerMessage([]), model: "rules-only" });
    return NextResponse.json(run);
  }
  return NextResponse.json({ error: "agent must be fuel, disruption or capacity" }, { status: 400 });
}
