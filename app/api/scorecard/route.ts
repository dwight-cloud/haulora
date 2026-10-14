import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { EVENT_KINDS, logScoreEvent, summarize, type EventKind } from "@/lib/scorecard";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const days = Number(req.nextUrl.searchParams.get("days") ?? "7");
  return NextResponse.json(summarize(s.sub, Date.now() - days * 86400_000));
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const events: Array<{
    kind: EventKind; severity?: number; lat?: number; lon?: number; payload?: unknown; timestamp?: number;
  }> = Array.isArray(body?.events) ? body.events
    : (body?.kind ? [body] : []);
  const valid = events.filter((e) => (EVENT_KINDS as readonly string[]).includes(e.kind));
  if (!valid.length) return NextResponse.json({ error: "no valid events" }, { status: 400 });
  for (const e of valid) {
    logScoreEvent({ userId: s.sub, ...e });
  }
  return NextResponse.json({ saved: valid.length });
}
