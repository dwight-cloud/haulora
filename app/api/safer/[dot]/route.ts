import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { lookupCarrier } from "@/lib/safer";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ dot: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { dot } = await ctx.params;
  const n = Number(dot);
  if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: "bad dot" }, { status: 400 });
  const carrier = await lookupCarrier(n);
  if (!carrier) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ carrier });
}
