import { NextRequest, NextResponse } from "next/server";
import { discover, geocode } from "@/lib/here";

export const runtime = "nodejs";

// GET /api/places/search?q=truck+stop&near=32.7,-96.8
// OR    ?q=Dallas, TX   (no `near` → uses geocode to center search on US centroid)
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
  const near = req.nextUrl.searchParams.get("near");
  try {
    let atLat = 39.5, atLon = -98.35;
    if (near) {
      const [lat, lon] = near.split(",").map((n) => parseFloat(n));
      if (!isNaN(lat) && !isNaN(lon)) { atLat = lat; atLon = lon; }
    } else {
      // Seed the discover centre with a geocode hit to bias results near the query
      try {
        const hit = await geocode(q);
        atLat = hit.lat; atLon = hit.lon;
      } catch { /* fall back to US centroid */ }
    }
    const results = await discover(q, { lat: atLat, lon: atLon });
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}
