import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({
    user: { id: s.sub, email: s.email, role: s.role, name: s.name,
            accountId: s.accountId, accountName: s.accountName },
  });
}
