import { NextRequest, NextResponse } from "next/server";
import { lookupById } from "@/lib/here";

export const runtime = "nodejs";

/** GET /api/here/lookup?id=<HERE_PLACE_ID> — full place record + gate-entry coords */
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const result = await lookupById(id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
