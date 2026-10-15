import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import "@/lib/domain/schema";
import { seedBrisbaneFleet, warmRoutes } from "@/lib/seed-brisbane";

export const runtime = "nodejs";

async function requireDispatcher() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  if (session.role !== "dispatcher") return { error: NextResponse.json({ error: "Dispatcher role required" }, { status: 403 }) };
  return { session };
}

function counts(accountId: string) {
  const n = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE account_id = ?`).get(accountId) as { n: number }).n;
  return { trucks: n("trucks"), customers: n("customers"), loads: n("loads"), events: n("road_events") };
}

/** Current seed-relevant row counts for the session's account. */
export async function GET() {
  const { session, error } = await requireDispatcher();
  if (error) return error;
  return NextResponse.json(counts(session.accountId));
}

/** Seed the Brisbane demo fleet. `?force=1` reseeds; `?warm=1` also routes loads via HERE. */
export async function POST(req: Request) {
  const { session, error } = await requireDispatcher();
  if (error) return error;
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const warm = url.searchParams.get("warm") === "1";
  try {
    const seeded = seedBrisbaneFleet(session.accountId, { force });
    const warmed = warm ? await warmRoutes(session.accountId) : undefined;
    return NextResponse.json({ seeded, warmed, counts: counts(session.accountId) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
