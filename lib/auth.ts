import "server-only";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, verifySession, type SessionClaims } from "./auth-core";

export { signSession, verifySession, SESSION_COOKIE } from "./auth-core";
export type { SessionClaims } from "./auth-core";

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Only mark Secure when we know TLS is in front of the app. Over plain HTTP
    // (IP-only VPS deploy, local dev), Secure cookies silently vanish.
    secure: process.env.COOKIE_SECURE === "1",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function getSessionFromRequest(req: NextRequest): Promise<SessionClaims | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
    ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  return verifySession(token);
}
