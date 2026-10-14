import { NextRequest, NextResponse } from "next/server";
import { autosuggest } from "@/lib/here";

export const runtime = "nodejs";

/** GET /api/here/autosuggest?q=&lat=&lon=&limit= */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? "";
    if (q.trim().length < 2) return NextResponse.json({ items: [] });
    const lat = parseFloat(searchParams.get("lat") ?? "");
    const lon = parseFloat(searchParams.get("lon") ?? "");
    const biasAt = isFinite(lat) && isFinite(lon) ? { lat, lon } : undefined;
    const limit = Math.max(1, Math.min(12, parseInt(searchParams.get("limit") ?? "6")));
    const items = await autosuggest(q, biasAt, limit);
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
