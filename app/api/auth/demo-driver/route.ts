import { NextResponse } from "next/server";
import { findUserByEmail, findAccountById } from "@/lib/db";
import { signSession, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

/** One-click demo sign-in as the seeded driver. */
export async function POST() {
  const user = findUserByEmail("driver@demo.local");
  const account = user && findAccountById(user.account_id);
  if (!user || !account) return NextResponse.json({ error: "Demo driver missing" }, { status: 500 });
  const token = await signSession({ sub: user.id, email: user.email, role: user.role, name: user.name, accountId: account.id, accountName: account.name });
  await setSessionCookie(token);
  return NextResponse.json({ ok: true });
}
