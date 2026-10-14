import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { disconnect, getConnection, saveConnection } from "@/lib/samsara";

export const runtime = "nodejs";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const conn = getConnection(s.accountId);
  if (!conn) return NextResponse.json({ connected: false });
  // Don't leak the token
  return NextResponse.json({
    connected: true,
    sandbox: conn.sandbox,
    orgName: conn.orgName,
    connectedAt: conn.connectedAt,
  });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "dispatcher") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" && body.token.trim().length > 0 ? body.token.trim() : "SANDBOX_TOKEN";
  const orgName = typeof body?.orgName === "string" ? body.orgName : undefined;
  const conn = saveConnection(s.accountId, token, orgName);
  return NextResponse.json({ connected: true, sandbox: conn.sandbox, orgName: conn.orgName });
}

export async function DELETE() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "dispatcher") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  disconnect(s.accountId);
  return NextResponse.json({ ok: true });
}
