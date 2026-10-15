import { NextRequest, NextResponse } from "next/server";
import { requireDispatcher } from "@/lib/api-helpers";
import { decideAction, getAction } from "@/lib/domain/repo";
import { execute } from "@/lib/agents/executor";

export const runtime = "nodejs";

/** Approve (and execute) or reject a proposed action. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const { decision } = await req.json().catch(() => ({}));
  const action = getAction(id);
  if (!action || action.accountId !== auth.session.accountId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (action.status !== "proposed") return NextResponse.json({ error: `Already ${action.status}` }, { status: 409 });
  if (decision === "reject") return NextResponse.json({ action: decideAction(id, "rejected", auth.session.email) });
  if (decision === "approve") {
    decideAction(id, "approved", auth.session.email);
    return NextResponse.json({ action: execute(id, auth.session.email) });
  }
  return NextResponse.json({ error: "decision must be approve or reject" }, { status: 400 });
}
