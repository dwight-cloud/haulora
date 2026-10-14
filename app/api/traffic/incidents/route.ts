import { NextRequest, NextResponse } from "next/server";
import { fetchIncidentsNear } from "@/lib/traffic511";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  const radius = Number(sp.get("radiusKm") ?? "100");
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "lat,lon required" }, { status: 400 });
  }
  const incidents = await fetchIncidentsNear(lat, lon, radius);
  return NextResponse.json({ incidents });
}
