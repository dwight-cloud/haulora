import { NextRequest, NextResponse } from "next/server";
import { geocode } from "@/lib/here";

export const runtime = "nodejs";

// GET /api/geocode?q=Dallas, TX
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
  try {
    const pos = await geocode(q);
    return NextResponse.json({ query: q, ...pos });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  }
}
