import { NextRequest, NextResponse } from "next/server";
import { evCharging } from "@/lib/here";

export const runtime = "nodejs";

/** GET /api/here/ev-charging?lat=&lon=[&limit=] */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = parseFloat(searchParams.get("lat") ?? "");
    const lon = parseFloat(searchParams.get("lon") ?? "");
    if (!isFinite(lat) || !isFinite(lon)) {
      return NextResponse.json({ error: "lat & lon required" }, { status: 400 });
    }
    const limit = Math.max(1, Math.min(80, parseInt(searchParams.get("limit") ?? "20")));
    const items = await evCharging({ lat, lon }, limit);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
