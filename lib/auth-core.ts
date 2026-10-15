import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "haulio_session";
const ALG = "HS256";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET must be set (≥16 chars)");
  return new TextEncoder().encode(s);
}

export interface SessionClaims {
  sub: string;
  email: string;
  role: "dispatcher" | "driver";
  name: string;
  accountId: string;
  accountName: string;
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return await new SignJWT(claims as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionClaims;
  } catch { return null; }
}
