import { NextRequest, NextResponse } from "next/server";
import { requireDispatcher } from "@/lib/api-helpers";
import { getRunWithSteps } from "@/lib/domain/repo";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const full = getRunWithSteps(id);
  if (!full || full.run.accountId !== auth.session.accountId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(full);
}
