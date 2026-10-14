import { NextResponse } from "next/server";
import { upvoteReport } from "@/lib/reports";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ok = upvoteReport(id);
  return NextResponse.json({ ok });
}
