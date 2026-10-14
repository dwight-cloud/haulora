import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { iftaReport } from "@/lib/ifta";

export const runtime = "nodejs";

function quarterRange(quarter: string): { fromMs: number; toMs: number } | null {
  // Format: "2026-Q1"
  const m = /^(\d{4})-Q([1-4])$/.exec(quarter);
  if (!m) return null;
  const y = Number(m[1]);
  const q = Number(m[2]);
  const fromMonth = (q - 1) * 3;
  const from = new Date(Date.UTC(y, fromMonth, 1, 0, 0, 0));
  const to = new Date(Date.UTC(y, fromMonth + 3, 1, 0, 0, 0));
  return { fromMs: from.getTime(), toMs: to.getTime() - 1 };
}

function currentQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const quarter = req.nextUrl.searchParams.get("quarter") ?? currentQuarter();
  const range = quarterRange(quarter);
  if (!range) return NextResponse.json({ error: "bad quarter" }, { status: 400 });
  return NextResponse.json(iftaReport(s.sub, range.fromMs, range.toMs, quarter));
}
