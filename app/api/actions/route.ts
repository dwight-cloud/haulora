import { NextRequest, NextResponse } from "next/server";
import { requireDispatcher } from "@/lib/api-helpers";
import { listActions } from "@/lib/domain/repo";
import type { ActionStatus } from "@/lib/domain/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;
  const status = req.nextUrl.searchParams.get("status") as ActionStatus | null;
  return NextResponse.json({ actions: listActions(auth.session.accountId, status ?? undefined) });
}
