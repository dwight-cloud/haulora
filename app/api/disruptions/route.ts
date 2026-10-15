import { NextRequest, NextResponse } from "next/server";
import { requireDispatcher } from "@/lib/api-helpers";
import { affectedLoads, listActiveEvents } from "@/lib/au/road-events";

export const runtime = "nodejs";

/**
 * Read-only: active road events plus, for each, the in-flight loads whose
 * route passes within the event radius. Uses the same matcher the
 * disruption agent uses (lib/au/road-events affectedLoads).
 */
export async function GET(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;
  const a = auth.session.accountId;
  const events = listActiveEvents(a);
  const hits = affectedLoads(a, events);
  const byEvent: Record<string, Array<{ loadId: string; ref: string; status: string; nearestKm: number }>> = {};
  for (const h of hits) {
    (byEvent[h.event.id] ??= []).push({ loadId: h.load.id, ref: h.load.ref, status: h.load.status, nearestKm: Math.round(h.nearestKm * 10) / 10 });
  }
  return NextResponse.json({ events, affected: byEvent });
}
