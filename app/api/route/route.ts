import { NextRequest, NextResponse } from "next/server";
import { geocode, truckRoute, type TruckRouteOption } from "@/lib/here";
import { computeRisk } from "@/lib/risk";

export const runtime = "nodejs";

function serializeOption(opt: TruckRouteOption) {
  // Top-posted truck speed (m/s → mph) for quick timeline
  const topTruckMph = opt.spans
    .map((s) => s.truckSpeedLimit ?? s.speedLimit ?? 0)
    .filter((v) => v > 0)
    .reduce((a, v) => Math.max(a, v), 0) * 2.23694;
  return {
    polyline: opt.polyline,
    distanceMiles: opt.distanceMeters / 1609.344,
    durationHours: opt.durationSeconds / 3600,
    notices: opt.notices,
    tolls: opt.tolls,
    topTruckSpeedMph: topTruckMph > 0 ? topTruckMph : undefined,
    spanSummary: summarizeSpans(opt.spans),
    truckSpeedWarnings: truckSpeedWarnings(opt.spans),
    risk: computeRisk(opt),
  };
}

/**
 * Segments of the route where the posted TRUCK speed limit is strictly lower
 * than the general speed limit — i.e. the driver must slow down.
 * Returns counts, total distance ratio, and the lowest truck-specific limit.
 */
function truckSpeedWarnings(spans: { offset: number; speedLimit?: number; truckSpeedLimit?: number }[]) {
  let restrictedSegments = 0;
  let minTruckMph = Infinity;
  for (const s of spans) {
    const tk = s.truckSpeedLimit ?? 0;
    const gen = s.speedLimit ?? 0;
    if (tk > 0 && gen > tk) {
      restrictedSegments++;
      const mph = tk * 2.23694;
      if (mph < minTruckMph) minTruckMph = mph;
    }
  }
  if (restrictedSegments === 0) return undefined;
  return {
    restrictedSegments,
    minTruckMph: Math.round(minTruckMph),
    totalSegments: spans.length,
  };
}

function summarizeSpans(spans: { truckSpeedLimit?: number; speedLimit?: number }[]) {
  if (!spans.length) return undefined;
  const speeds = spans
    .map((s) => (s.truckSpeedLimit ?? s.speedLimit ?? 0) * 2.23694)
    .filter((v) => v > 0);
  if (!speeds.length) return undefined;
  const min = Math.min(...speeds), max = Math.max(...speeds);
  const avg = speeds.reduce((a, v) => a + v, 0) / speeds.length;
  return { minMph: Math.round(min), maxMph: Math.round(max), avgMph: Math.round(avg) };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      origin, destination,
      heightMeters, weightKg, widthMeters, lengthMeters, axleCount,
      hazardous, trailerCount,
    } = body ?? {};
    if (!origin || !destination) {
      return NextResponse.json({ error: "origin and destination required" }, { status: 400 });
    }

    const [o, d] = await Promise.all([geocode(origin), geocode(destination)]);
    const result = await truckRoute(o, d, {
      heightMeters: Number(heightMeters) || 4.11,
      weightKg: Number(weightKg) || 36000,
      widthMeters: widthMeters ? Number(widthMeters) : undefined,
      lengthMeters: lengthMeters ? Number(lengthMeters) : undefined,
      axleCount: axleCount ? Number(axleCount) : undefined,
      hazardous: !!hazardous,
      trailerCount: Number(trailerCount) || 1,
    });

    const primary = serializeOption(result.primary);
    const alternates = result.alternates.map(serializeOption);

    // Back-compat: flatten primary fields onto top level so existing iOS/web clients keep working
    return NextResponse.json({
      origin: { query: origin, ...o },
      destination: { query: destination, ...d },
      ...primary,
      alternates,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
