import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logTripPoint, listTripPoints } from "@/lib/ifta";
import { reverseState } from "@/lib/here";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sinceHrs = Number(req.nextUrl.searchParams.get("sinceHours") ?? "24");
  const since = Date.now() - sinceHrs * 3600_000;
  return NextResponse.json({ points: listTripPoints(s.sub, since) });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const pts: Array<{ lat: number; lon: number; stateCode?: string; odometer?: number; timestamp?: number }> =
    Array.isArray(body?.points) ? body.points
      : (typeof body?.lat === "number" ? [body] : []);
  if (!pts.length) return NextResponse.json({ error: "no points" }, { status: 400 });

  // Only look up state for the most recent point (HERE rate) if not provided.
  let inferredState: string | undefined;
  if (pts.length && !pts[pts.length - 1].stateCode) {
    try {
      const r = await reverseState({ lat: pts[pts.length - 1].lat, lon: pts[pts.length - 1].lon });
      inferredState = r.stateCode;
    } catch { /* ignore */ }
  }

  const saved = pts.map((p, i) =>
    logTripPoint({
      userId: s.sub, lat: p.lat, lon: p.lon,
      stateCode: p.stateCode ?? (i === pts.length - 1 ? inferredState : undefined),
      odometer: p.odometer ?? null,
      timestamp: p.timestamp,
    }),
  );
  return NextResponse.json({ saved: saved.length });
}
