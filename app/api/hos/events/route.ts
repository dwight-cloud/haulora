import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logHosEvent, listHosEvents, computeHosState, type HosStatus } from "@/lib/hos";

export const runtime = "nodejs";

const VALID: HosStatus[] = ["driving", "on_duty", "sleeper", "off_duty"];

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const since = Date.now() - 8 * 24 * 3600_000;
  const events = listHosEvents(s.sub, since);
  const state = computeHosState(s.sub);
  return NextResponse.json({ events, state });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const status = body?.status as HosStatus;
  if (!VALID.includes(status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
  const ev = logHosEvent({
    userId: s.sub, status,
    lat: typeof body?.lat === "number" ? body.lat : null,
    lon: typeof body?.lon === "number" ? body.lon : null,
    source: typeof body?.source === "string" ? body.source : "manual",
  });
  const state = computeHosState(s.sub);
  return NextResponse.json({ event: ev, state });
}
