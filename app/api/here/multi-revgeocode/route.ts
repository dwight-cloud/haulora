import { NextRequest, NextResponse } from "next/server";
import { multiReverseGeocode, type LatLon } from "@/lib/here";

export const runtime = "nodejs";

/**
 * POST /api/here/multi-revgeocode
 * Body: { points: [{lat, lon}, ...] }
 * Returns: { items: [{lat, lon, label, stateCode, countryCode}, ...] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const points: LatLon[] = Array.isArray(body?.points) ? body.points : [];
    if (points.length === 0) return NextResponse.json({ error: "points required" }, { status: 400 });
    // Cap batches to avoid abusing the endpoint.
    if (points.length > 200) return NextResponse.json({ error: "max 200 points" }, { status: 400 });
    const items = await multiReverseGeocode(points);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
