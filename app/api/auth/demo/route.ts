import { NextResponse } from "next/server";
import { findUserByEmail, findAccountById } from "@/lib/db";
import { signSession, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

/** One-click demo sign-in as the seeded dispatcher. */
export async function POST() {
  const user = findUserByEmail("dispatch@demo.local");
  const account = user && findAccountById(user.account_id);
  if (!user || !account) return NextResponse.json({ error: "Demo account missing" }, { status: 500 });
  const token = await signSession({ sub: user.id, email: user.email, role: user.role, name: user.name, accountId: account.id, accountName: account.name });
  await setSessionCookie(token);
  return NextResponse.json({ ok: true });
}
