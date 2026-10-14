import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getAssignment } from "@/lib/assignments";
import {
  createTrackingToken, listTrackingTokens, revokeTrackingToken,
} from "@/lib/tracking";

export const runtime = "nodejs";

/** GET — list active share tokens for this assignment (dispatcher only). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionFromRequest(req);
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "dispatcher") return NextResponse.json({ error: "dispatchers only" }, { status: 403 });
  const { id } = await params;
  const a = getAssignment(id);
  if (!a || a.accountId !== s.accountId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ tokens: listTrackingTokens(id) });
}

/** POST — create a share token. Body: { expiresInHours?: number } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionFromRequest(req);
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "dispatcher") return NextResponse.json({ error: "dispatchers only" }, { status: 403 });
  const { id } = await params;
  const a = getAssignment(id);
  if (!a || a.accountId !== s.accountId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({})) as { expiresInHours?: number };
  const t = createTrackingToken({
    assignmentId: id,
    createdBy: s.sub,
    expiresInHours: typeof body.expiresInHours === "number" ? body.expiresInHours : 72, // 3-day default
  });
  const url = new URL(req.url);
  return NextResponse.json({
    token: t.token,
    url:   `${url.protocol}//${url.host}/track/${t.token}`,
    expiresAt: t.expiresAt,
  });
}

/** DELETE — revoke a token. ?token=... */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionFromRequest(req);
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "dispatcher") return NextResponse.json({ error: "dispatchers only" }, { status: 403 });
  const { id } = await params;
  const a = getAssignment(id);
  if (!a || a.accountId !== s.accountId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
  revokeTrackingToken(token);
  return NextResponse.json({ ok: true });
}
