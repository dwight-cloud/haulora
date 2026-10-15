import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, type SessionClaims } from "./auth";
import { resolveDriverTruck } from "./domain/driver";
import type { Truck } from "./domain/types";

/**
 * Any signed-in session may use the driver API (a dispatcher clicking through
 * the driver app on the same box should not have to sign out). Everything is
 * still scoped to the session's account.
 */
export async function requireDriverContext(req: NextRequest): Promise<{ session: SessionClaims; truck: Truck } | { error: NextResponse }> {
  const session = await getSessionFromRequest(req);
  if (!session) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  const truck = resolveDriverTruck(session);
  if (!truck) return { error: NextResponse.json({ error: "No trucks in this account yet" }, { status: 404 }) };
  return { session, truck };
}
