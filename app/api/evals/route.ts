import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Latest eval run per suite, with per-case detail. Public: it is a proof artefact. */
export async function GET() {
  const rows = db.prepare("SELECT * FROM eval_runs ORDER BY created_at DESC").all() as Array<Record<string, unknown>>;
  const latest = new Map<string, Record<string, unknown>>();
  for (const r of rows) if (!latest.has(String(r.suite))) latest.set(String(r.suite), { ...r, report: JSON.parse(String(r.report)) });
  return NextResponse.json({ suites: [...latest.values()] });
}
