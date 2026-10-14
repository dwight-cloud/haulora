import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { computeHosState } from "@/lib/hos";
import { geocode, truckRoute, browseTruckPois } from "@/lib/here";
import { decodeFlexiblePolyline } from "@/lib/polyline";

export const runtime = "nodejs";

// Given origin/destination + driver HOS, return where they'll run out of the 11h driving
// or 14h window clock and a set of truck parking / rest areas near that point.
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { origin, destination } = body ?? {};
  if (!origin || !destination) {
    return NextResponse.json({ error: "origin and destination required" }, { status: 400 });
  }

  const state = computeHosState(s.sub);
  const [o, d] = await Promise.all([geocode(origin), geocode(destination)]);
  const r = await truckRoute(o, d, {
    heightMeters: Number(body?.heightMeters) || 4.11,
    weightKg: Number(body?.weightKg) || 36000,
    hazardous: !!body?.hazardous,
    trailerCount: Number(body?.trailerCount) || 1,
  });

  const coords = decodeFlexiblePolyline(r.primary.polyline);
  const durationSec = r.primary.durationSeconds;

  // Effective remaining drive budget this duty window is the smaller of 11h-clock and 14h-window
  const budgetHours = Math.max(0, Math.min(state.drivingRemainingHours, state.windowRemainingHours));
  const needsStop = durationSec / 3600 > budgetHours;
  const stopAtFraction = budgetHours / (durationSec / 3600);

  const stopPoint = needsStop
    ? coords[Math.min(coords.length - 1, Math.floor(coords.length * stopAtFraction))]
    : null;

  const stops = stopPoint
    ? await browseTruckPois(["parking", "rest", "stop"], stopPoint, 10)
    : [];

  return NextResponse.json({
    hos: state,
    distanceMiles: r.primary.distanceMeters / 1609.344,
    durationHours: durationSec / 3600,
    budgetHours,
    needsStop,
    stopPoint,
    stops,
    polyline: r.primary.polyline,
    origin: { query: origin, ...o },
    destination: { query: destination, ...d },
  });
}
