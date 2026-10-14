import { NextRequest, NextResponse } from "next/server";
import { decodeFlexiblePolyline } from "@/lib/polyline";
import { weatherAlong } from "@/lib/weather";

export const runtime = "nodejs";

// POST { polyline, durationHours } -> { samples: WeatherSample[] }
export async function POST(req: NextRequest) {
  try {
    const { polyline, durationHours, samples } = await req.json();
    if (typeof polyline !== "string") {
      return NextResponse.json({ error: "polyline required" }, { status: 400 });
    }
    const coords = decodeFlexiblePolyline(polyline);
    const n = Math.min(8, Math.max(3, Number(samples) || 5));
    const results = await weatherAlong(coords, n, Number(durationHours) || 4);
    return NextResponse.json({ samples: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
