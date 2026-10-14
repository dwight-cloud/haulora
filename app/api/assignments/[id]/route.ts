import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getAssignment, updateAssignmentStatus, type AssignmentStatus } from "@/lib/assignments";

const VALID: AssignmentStatus[] = ["assigned", "accepted", "in_progress", "completed", "cancelled"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionFromRequest(req);
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const a = getAssignment(id);
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (a.accountId !== s.accountId) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ assignment: a });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionFromRequest(req);
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const a = getAssignment(id);
  if (!a || a.accountId !== s.accountId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null) as { status?: AssignmentStatus } | null;
  if (!body?.status || !VALID.includes(body.status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  // Authorization: drivers can only progress their own run; dispatchers can cancel.
  if (s.role === "driver") {
    if (a.driverId !== s.sub) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!["accepted", "in_progress", "completed"].includes(body.status)) {
      return NextResponse.json({ error: "drivers can't set that status" }, { status: 403 });
    }
  }
  try {
    const updated = updateAssignmentStatus(id, body.status);
    return NextResponse.json({ assignment: updated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "bad transition" }, { status: 400 });
  }
}
