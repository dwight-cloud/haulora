import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { findAccountById, findUserByEmail } from "@/lib/db";
import { signSession, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ error: "email and password required" }, { status: 400 });
  }
  const user = findUserByEmail(String(email));
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }
  const account = findAccountById(user.account_id);
  if (!account) return NextResponse.json({ error: "account missing" }, { status: 500 });

  const token = await signSession({
    sub: user.id, email: user.email, role: user.role, name: user.name,
    accountId: account.id, accountName: account.name,
  });
  await setSessionCookie(token);
  return NextResponse.json({
    token,
    user: { id: user.id, email: user.email, role: user.role, name: user.name,
            accountId: account.id, accountName: account.name },
  });
}
