import { NextRequest, NextResponse } from "next/server";
import {
  createAccount, createUser, findAccountById, findInvite,
  findUserByEmail, consumeInvite,
} from "@/lib/db";
import { signSession, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { email, password, name, mode, companyName, inviteCode } = body ?? {};

  if (!email || !password || !name) {
    return NextResponse.json({ error: "email, password, name required" }, { status: 400 });
  }
  if (String(password).length < 8) {
    return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
  }
  if (findUserByEmail(String(email))) {
    return NextResponse.json({ error: "email already registered" }, { status: 409 });
  }

  let accountId: string;
  let role: "dispatcher" | "driver";

  if (mode === "create") {
    // Create a new fleet account; creator becomes the dispatcher/owner.
    if (!companyName) {
      return NextResponse.json({ error: "companyName required" }, { status: 400 });
    }
    const acc = createAccount(String(companyName));
    accountId = acc.id;
    role = "dispatcher";
  } else if (mode === "invite") {
    if (!inviteCode) {
      return NextResponse.json({ error: "inviteCode required" }, { status: 400 });
    }
    const invite = findInvite(String(inviteCode));
    if (!invite) return NextResponse.json({ error: "invalid invite code" }, { status: 400 });
    if (invite.used_by) return NextResponse.json({ error: "invite already used" }, { status: 400 });
    if (invite.expires_at < Date.now()) return NextResponse.json({ error: "invite expired" }, { status: 400 });
    accountId = invite.account_id;
    role = invite.role;
  } else {
    return NextResponse.json({ error: "mode must be 'create' or 'invite'" }, { status: 400 });
  }

  const user = createUser({ accountId, email: String(email), password: String(password), name: String(name), role });

  if (mode === "invite") consumeInvite(String(inviteCode), user.id);

  const account = findAccountById(accountId)!;
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
