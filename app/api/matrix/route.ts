import { NextRequest, NextResponse } from "next/server";
import { matrixRoute, type LatLon, type TruckProfile } from "@/lib/here";

export const runtime = "nodejs";

/**
 * POST /api/matrix
 * Body: { origins: LatLon[], destinations: LatLon[], profile?: TruckProfile }
 * Returns: { travelTimes, numOrigins, numDestinations } where
 *   travelTimes[i*numDestinations + j] = seconds from origins[i] to destinations[j].
 *
 * Used by the dispatcher "best truck for this load" picker.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const origins: LatLon[] = body?.origins ?? [];
    const destinations: LatLon[] = body?.destinations ?? [];
    if (!Array.isArray(origins) || origins.length === 0) {
      return NextResponse.json({ error: "origins required" }, { status: 400 });
    }
    if (!Array.isArray(destinations) || destinations.length === 0) {
      return NextResponse.json({ error: "destinations required" }, { status: 400 });
    }
    const profile: TruckProfile | undefined = body?.profile;
    const m = await matrixRoute(origins, destinations, profile);
    return NextResponse.json(m);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
