import { NextRequest, NextResponse } from "next/server";
import { truckRoute, type TruckProfile, type RouteSpan } from "@/lib/here";
import { decodeFlexiblePolyline, type LatLon } from "@/lib/polyline";

export const runtime = "nodejs";

/**
 * GET /api/here/route-traffic
 *   ?originLat=&originLon=&destLat=&destLon=[&weightKg=&heightMeters=&axleCount=&hazardous=]
 *
 * Re-fetches the route from HERE with traffic-aware spans, decodes the
 * polyline, and returns it pre-sliced into colored segments by jam level so
 * the iOS/web client doesn't have to do span math.
 *
 * Color levels (derived from trafficSpeed / baseSpeed ratio, or jamFactor):
 *   0 = free       (green)
 *   1 = slow       (yellow)
 *   2 = heavy      (orange)
 *   3 = blocked    (red)
 *
 * This is a fresh routing call so it reflects live traffic — not the stale
 * polyline the driver was assigned at dispatch time.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const originLat = parseFloat(searchParams.get("originLat") ?? "");
    const originLon = parseFloat(searchParams.get("originLon") ?? "");
    const destLat   = parseFloat(searchParams.get("destLat")   ?? "");
    const destLon   = parseFloat(searchParams.get("destLon")   ?? "");
    if (![originLat, originLon, destLat, destLon].every(isFinite)) {
      return NextResponse.json({ error: "origin/dest lat/lon required" }, { status: 400 });
    }

    const profile: TruckProfile = {
      heightMeters: parseFloat(searchParams.get("heightMeters") ?? "4.11") || 4.11,
      weightKg:     parseFloat(searchParams.get("weightKg")     ?? "36000") || 36000,
      axleCount:    parseInt(searchParams.get("axleCount") ?? "") || undefined,
      hazardous:    searchParams.get("hazardous") === "true",
    };

    const result = await truckRoute(
      { lat: originLat, lon: originLon },
      { lat: destLat,   lon: destLon   },
      profile
    );
    const opt = result.primary;
    const coords = decodeFlexiblePolyline(opt.polyline);
    const segments = colorSegments(coords, opt.spans);

    return NextResponse.json({
      polyline: opt.polyline,
      segments,
      // Overall stats so the driver can see "15 min lost to traffic" at a glance
      summary: summarize(opt.spans),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface ColoredSegment {
  level: 0 | 1 | 2 | 3;
  coords: Array<{ lat: number; lon: number }>;
}

function levelForSpan(span: RouteSpan): 0 | 1 | 2 | 3 {
  const d = span.dynamicSpeedInfo;
  if (!d) return 0;
  // Prefer explicit jamFactor if HERE returned it
  if (typeof d.jamFactor === "number") {
    if (d.jamFactor >= 8)    return 3;
    if (d.jamFactor >= 5)    return 2;
    if (d.jamFactor >= 2.5)  return 1;
    return 0;
  }
  // Fall back to traffic/base ratio
  if (d.baseSpeed && d.trafficSpeed != null && d.baseSpeed > 0) {
    const r = d.trafficSpeed / d.baseSpeed;
    if (r < 0.45)  return 3;
    if (r < 0.65)  return 2;
    if (r < 0.85)  return 1;
    return 0;
  }
  return 0;
}

/** Break the polyline into contiguous same-level runs (merge tiny spans). */
function colorSegments(coords: LatLon[], spans: RouteSpan[]): ColoredSegment[] {
  if (spans.length === 0 || coords.length < 2) {
    return [{ level: 0, coords: coords.map((c) => ({ lat: c.lat, lon: c.lon })) }];
  }
  const sorted = [...spans].sort((a, b) => a.offset - b.offset);
  const out: ColoredSegment[] = [];
  let cur: ColoredSegment | null = null;
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const startIdx = Math.max(0, Math.min(coords.length - 1, s.offset));
    const endIdx   = i + 1 < sorted.length
      ? Math.max(startIdx, Math.min(coords.length - 1, sorted[i + 1].offset))
      : coords.length - 1;
    if (endIdx <= startIdx) continue;
    const level = levelForSpan(s);
    if (cur && cur.level === level) {
      // extend current run
      for (let k = startIdx + 1; k <= endIdx; k++) {
        cur.coords.push({ lat: coords[k].lat, lon: coords[k].lon });
      }
    } else {
      if (cur) out.push(cur);
      const segCoords: Array<{ lat: number; lon: number }> = [];
      for (let k = startIdx; k <= endIdx; k++) {
        segCoords.push({ lat: coords[k].lat, lon: coords[k].lon });
      }
      cur = { level, coords: segCoords };
    }
  }
  if (cur) out.push(cur);
  return out;
}

function summarize(spans: RouteSpan[]) {
  let free = 0, slow = 0, heavy = 0, blocked = 0, missing = 0;
  for (const s of spans) {
    const d = s.dynamicSpeedInfo;
    if (!d) { missing++; continue; }
    const lvl = levelForSpan(s);
    if (lvl === 0) free++;
    else if (lvl === 1) slow++;
    else if (lvl === 2) heavy++;
    else blocked++;
  }
  return { free, slow, heavy, blocked, missing, total: spans.length };
}
