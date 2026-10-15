import { NextRequest, NextResponse } from "next/server";
import { requireDriverContext } from "@/lib/driver-api";
import { listDriverJobs, listDriverUpdates } from "@/lib/domain/driver";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await requireDriverContext(req);
  if ("error" in ctx) return ctx.error;
  const jobs = listDriverJobs(ctx.session.accountId, ctx.truck.id);
  return NextResponse.json({ updates: listDriverUpdates(ctx.session.accountId, jobs) });
}
