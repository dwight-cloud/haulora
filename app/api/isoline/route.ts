import { NextRequest, NextResponse } from "next/server";
import { isoline, type TruckProfile } from "@/lib/here";

export const runtime = "nodejs";

/**
 * GET /api/isoline?lat=&lon=&rangesHours=1,2,4[&heightMeters=&weightKg=&axleCount=&hazardous=]
 * Returns truck-aware drive-time polygons from (lat,lon) for each range.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = parseFloat(searchParams.get("lat") ?? "");
    const lon = parseFloat(searchParams.get("lon") ?? "");
    if (!isFinite(lat) || !isFinite(lon)) {
      return NextResponse.json({ error: "lat & lon required" }, { status: 400 });
    }
    const rangesHours = (searchParams.get("rangesHours") ?? "1,2,4")
      .split(",")
      .map((s) => parseFloat(s))
      .filter((v) => isFinite(v) && v > 0);
    if (rangesHours.length === 0) {
      return NextResponse.json({ error: "rangesHours required" }, { status: 400 });
    }
    const profile: TruckProfile = {
      heightMeters: parseFloat(searchParams.get("heightMeters") ?? "4.11") || 4.11,
      weightKg:     parseFloat(searchParams.get("weightKg")     ?? "36000") || 36000,
      axleCount:    parseInt(searchParams.get("axleCount") ?? "") || undefined,
      hazardous:    searchParams.get("hazardous") === "true",
    };
    const rangeSeconds = rangesHours.map((h) => Math.round(h * 3600));
    const ranges = await isoline({ lat, lon }, rangeSeconds, profile);
    return NextResponse.json({ ranges });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
