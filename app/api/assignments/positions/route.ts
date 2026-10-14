import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { latestActivePositionsForAccount } from "@/lib/tracking";

export const runtime = "nodejs";

/**
 * GET /api/assignments/positions
 * Dispatcher polls this for live truck dots: latest position of every active
 * (accepted | in_progress) assignment in the account.
 */
export async function GET(req: NextRequest) {
  const s = await getSessionFromRequest(req);
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "dispatcher") return NextResponse.json({ error: "dispatchers only" }, { status: 403 });
  return NextResponse.json({ positions: latestActivePositionsForAccount(s.accountId) });
}
