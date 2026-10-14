import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createInvite, listInvitesForAccount, revokeInvite } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "dispatcher") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const invites = listInvitesForAccount(s.accountId).map((i) => ({
    code: i.code, role: i.role, createdAt: i.created_at, expiresAt: i.expires_at,
    usedBy: i.used_by, usedAt: i.used_at,
  }));
  return NextResponse.json({ invites });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "dispatcher") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { role } = await req.json().catch(() => ({ role: "driver" }));
  const r: "dispatcher" | "driver" = role === "dispatcher" ? "dispatcher" : "driver";
  const invite = createInvite({ accountId: s.accountId, role: r, createdBy: s.sub });
  return NextResponse.json({ invite: { code: invite.code, role: invite.role, expiresAt: invite.expires_at } });
}

export async function DELETE(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "dispatcher") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { code } = await req.json().catch(() => ({}));
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  const ok = revokeInvite(String(code), s.accountId);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
