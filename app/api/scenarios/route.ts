import { NextRequest, NextResponse } from "next/server";
import { requireDispatcher, rateLimit } from "@/lib/api-helpers";
import { runScenario, SCENARIOS, type ScenarioId } from "@/lib/scenarios";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  return NextResponse.json({ scenarios: Object.entries(SCENARIOS).map(([id, s]) => ({ id, ...s })) });
}

export async function POST(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;
  const limited = rateLimit(req, "scenario", 12, 10 * 60_000);
  if (limited) return limited;
  const { scenario } = await req.json().catch(() => ({}));
  if (!(scenario in SCENARIOS)) return NextResponse.json({ error: "Unknown scenario" }, { status: 400 });
  const result = await runScenario(scenario as ScenarioId, auth.session.accountId);
  return NextResponse.json(result);
}
