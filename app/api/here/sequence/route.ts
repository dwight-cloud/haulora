import { NextRequest, NextResponse } from "next/server";
import { sequenceStops, geocode } from "@/lib/here";

export const runtime = "nodejs";

/**
 * POST /api/here/sequence
 * Body:
 *   { start: {label, lat?, lon?},
 *     end?:  {label, lat?, lon?},
 *     stops: [{id?, label?, lat?, lon?}, ...],
 *     improveFor?: "time" | "distance" }
 *
 * If a point has only a `label`, we geocode it. Returns the HERE-optimized visit order.
 */
interface PointIn { id?: string; label?: string; lat?: number; lon?: number }

async function resolve(p: PointIn, fallbackId: string): Promise<{ id: string; label: string; lat: number; lon: number }> {
  const id = (p.id ?? fallbackId).replace(/[^A-Za-z0-9-]/g, "-");
  if (typeof p.lat === "number" && typeof p.lon === "number") {
    return { id, label: p.label ?? `${p.lat},${p.lon}`, lat: p.lat, lon: p.lon };
  }
  if (!p.label) throw new Error(`point ${id} missing label or coords`);
  const g = await geocode(p.label);
  return { id, label: p.label, lat: g.lat, lon: g.lon };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const startIn: PointIn | undefined = body?.start;
    const endIn:   PointIn | undefined = body?.end;
    const stopsIn: PointIn[] = Array.isArray(body?.stops) ? body.stops : [];
    if (!startIn) return NextResponse.json({ error: "start required" }, { status: 400 });
    if (stopsIn.length === 0) return NextResponse.json({ error: "at least 1 stop required" }, { status: 400 });

    const start = await resolve(startIn, "start");
    const end   = endIn ? await resolve(endIn, "end") : undefined;
    const middle = await Promise.all(stopsIn.map((p, i) => resolve(p, `stop${i + 1}`)));

    const ordered = await sequenceStops({
      start,
      end,
      middle: middle.map(({ id, lat, lon }) => ({ id, lat, lon })),
      improveFor: body?.improveFor === "distance" ? "distance" : "time",
    });

    // Map ordered ids back to labeled points (include start/end for easy client rendering)
    const byId = new Map<string, { label: string; lat: number; lon: number }>();
    byId.set(start.id, { label: start.label, lat: start.lat, lon: start.lon });
    if (end) byId.set(end.id, { label: end.label, lat: end.lat, lon: end.lon });
    for (const m of middle) byId.set(m.id, { label: m.label, lat: m.lat, lon: m.lon });

    const sequence = ordered.orderedIds.map((id, i) => ({
      id,
      sequenceIndex: i,
      ...(byId.get(id) ?? { label: id, lat: 0, lon: 0 }),
    }));

    return NextResponse.json({
      sequence,
      distanceMiles: ordered.distanceMeters / 1609.344,
      durationHours: ordered.durationSeconds / 3600,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
