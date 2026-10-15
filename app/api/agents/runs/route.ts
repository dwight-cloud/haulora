import { NextRequest, NextResponse } from "next/server";
import { requireDispatcher } from "@/lib/api-helpers";
import { listRuns } from "@/lib/domain/repo";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 20);
  return NextResponse.json({ runs: listRuns(auth.session.accountId, Math.min(limit, 100)) });
}
