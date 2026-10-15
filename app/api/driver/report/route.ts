import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/api-helpers";
import { requireDriverContext } from "@/lib/driver-api";
import { recordEvent } from "@/lib/au/road-events";
import { disruptionAgent, disruptionTriggerMessage } from "@/lib/agents/disruption";
import { runAgent } from "@/lib/agents/runtime";
import type { RoadEventKind, Severity } from "@/lib/domain/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const KINDS: RoadEventKind[] = ["flood", "closure", "crash", "fire", "weather", "restriction"];
const SEVERITIES: Severity[] = ["moderate", "major", "critical"];
const KIND_WORD: Record<RoadEventKind, string> = {
  flood: "flooding", closure: "road closed", crash: "a crash", fire: "fire", weather: "bad weather", restriction: "a truck restriction",
};

/**
 * A driver reports a road problem from the cab. The event is recorded with
 * source "driver" and the road AI helper is run straight away, exactly as it
 * is for a scenario on the dispatcher side.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "driver-report", 5, 10 * 60_000);
  if (limited) return limited;
  const ctx = await requireDriverContext(req);
  if ("error" in ctx) return ctx.error;

  const body = await req.json().catch(() => ({})) as {
    kind?: string; road?: string; note?: string; severity?: string; lat?: unknown; lon?: unknown; loadRef?: string;
  };
  const kind = KINDS.find((k) => k === body.kind);
  const severity = SEVERITIES.find((s) => s === body.severity);
  const note = (body.note ?? "").toString().trim().slice(0, 600);
  const road = (body.road ?? "").toString().trim().slice(0, 80) || null;
  if (!kind) return NextResponse.json({ error: "Pick what kind of problem it is" }, { status: 400 });
  if (!severity) return NextResponse.json({ error: "Pick how bad it is" }, { status: 400 });
  if (!note) return NextResponse.json({ error: "Add a short note so dispatch knows what you can see" }, { status: 400 });

  let lat = Number(body.lat), lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) { lat = ctx.truck.lat; lon = ctx.truck.lon; }

  const now = Date.now();
  const title = `Driver report: ${KIND_WORD[kind]}${road ? ` on ${road}` : ""}${body.loadRef ? ` (${String(body.loadRef).slice(0, 20)})` : ""}`;
  const event = recordEvent({
    accountId: ctx.session.accountId, source: "driver", kind, road, title,
    description: `${note} (reported by ${ctx.session.name} from ${ctx.truck.code})`,
    lat, lon, radiusKm: 10, severity, startsAt: now, endsAt: null, active: true,
  });
  const run = await runAgent(disruptionAgent, {
    accountId: ctx.session.accountId,
    trigger: `driver:${ctx.truck.code} (${event.title})`,
    userMessage: disruptionTriggerMessage(event),
  });
  return NextResponse.json({ event, run });
}
