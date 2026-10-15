import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, type SessionClaims } from "./auth";

/** Dispatcher session or a 401/403 response. */
export async function requireDispatcher(req: NextRequest): Promise<{ session: SessionClaims } | { error: NextResponse }> {
  const session = await getSessionFromRequest(req);
  if (!session) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  if (session.role !== "dispatcher") return { error: NextResponse.json({ error: "Dispatcher role required" }, { status: 403 }) };
  return { session };
}

// ---------- Per-visitor rate limit (in-memory, fine for a single-box demo) ----------

const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Returns null when allowed, or a 429 response. */
export function rateLimit(req: NextRequest, scope: string, limit: number, windowMs: number): NextResponse | null {
  const key = `${scope}:${clientKey(req)}`;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (b.count >= limit) {
    const retry = Math.ceil((b.resetAt - now) / 1000);
    return NextResponse.json({ error: `Rate limit: ${limit} per ${Math.round(windowMs / 60000)} min. Try again in ${retry}s.` }, { status: 429, headers: { "Retry-After": String(retry) } });
  }
  b.count += 1;
  return null;
}
