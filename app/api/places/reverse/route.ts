import { NextRequest, NextResponse } from "next/server";
import { reverseGeocode } from "@/lib/here";

export const runtime = "nodejs";

// GET /api/places/reverse?at=32.7767,-96.797
export async function GET(req: NextRequest) {
  const at = req.nextUrl.searchParams.get("at");
  if (!at) return NextResponse.json({ error: "at required (lat,lon)" }, { status: 400 });
  const [lat, lon] = at.split(",").map((n) => parseFloat(n));
  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: "at must be lat,lon" }, { status: 400 });
  }
  try {
    const label = await reverseGeocode({ lat, lon });
    return NextResponse.json({ label, position: { lat, lon } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}
