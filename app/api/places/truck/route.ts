import { NextRequest, NextResponse } from "next/server";
import { browseTruckPois, type TruckPoiKind } from "@/lib/here";

export const runtime = "nodejs";

const VALID: TruckPoiKind[] = ["parking", "stop", "rest", "weigh"];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = parseFloat(searchParams.get("lat") ?? "");
    const lon = parseFloat(searchParams.get("lon") ?? "");
    if (!isFinite(lat) || !isFinite(lon)) {
      return NextResponse.json({ error: "lat & lon required" }, { status: 400 });
    }
    const kindsParam = (searchParams.get("kinds") ?? "parking,stop,rest,weigh")
      .split(",").map((s) => s.trim()) as TruckPoiKind[];
    const kinds = kindsParam.filter((k) => VALID.includes(k));
    const limit = Math.min(80, parseInt(searchParams.get("limit") ?? "30"));
    const places = await browseTruckPois(kinds, { lat, lon }, limit);
    return NextResponse.json({ items: places });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
