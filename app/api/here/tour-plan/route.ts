import { NextRequest, NextResponse } from "next/server";
import { geocode, tourPlan, type LatLon, type VrpJob, type VrpVehicleType } from "@/lib/here";

export const runtime = "nodejs";

/**
 * POST /api/here/tour-plan
 * Body:
 *   {
 *     types: [{
 *       id: "box-truck",
 *       amount: 3,
 *       capacity: [5000],           // e.g. kg. Array = multi-dim.
 *       shiftStart: { iso, location: {lat,lon} | label },
 *       shiftEnd:   { iso, location: {lat,lon} | label },
 *       costs?: { fixed, distance, time }
 *     }, ...],
 *     jobs: [{
 *       id: "j1",
 *       location: {lat,lon} | label,
 *       demand: [1000],             // matches capacity dim
 *       serviceDurationSec?: 900,
 *       timeWindows?: [[iso, iso]]
 *     }, ...]
 *   }
 *
 * If a location is a `label` string instead of coords, we geocode it first.
 */
async function resolveLoc(loc: LatLon | { label: string } | undefined): Promise<LatLon> {
  if (!loc) throw new Error("location required");
  if ("lat" in loc && "lon" in loc) return loc;
  if ("label" in loc && loc.label) return geocode(loc.label);
  throw new Error("location must be {lat,lon} or {label}");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!Array.isArray(body?.types) || body.types.length === 0) {
      return NextResponse.json({ error: "types[] required" }, { status: 400 });
    }
    if (!Array.isArray(body?.jobs) || body.jobs.length === 0) {
      return NextResponse.json({ error: "jobs[] required" }, { status: 400 });
    }

    // Resolve labels to coords in parallel — same trick as /api/here/sequence
    const types: VrpVehicleType[] = await Promise.all(
      (body.types as Array<{
        id: string; amount?: number; capacity?: number[];
        shiftStart: { iso: string; location: LatLon | { label: string } };
        shiftEnd:   { iso: string; location: LatLon | { label: string } };
        costs?: { fixed?: number; distance?: number; time?: number };
      }>).map(async (t) => ({
        id:         String(t.id ?? "vehicle").replace(/[^A-Za-z0-9-_]/g, "-"),
        profile:    "truck",
        amount:     Math.max(1, Number(t.amount ?? 1)),
        capacity:   Array.isArray(t.capacity) && t.capacity.length ? t.capacity : [5000],
        shiftStart: { iso: t.shiftStart.iso, location: await resolveLoc(t.shiftStart.location) },
        shiftEnd:   { iso: t.shiftEnd.iso,   location: await resolveLoc(t.shiftEnd.location) },
        costs:      t.costs,
      }))
    );

    const jobs: VrpJob[] = await Promise.all(
      (body.jobs as Array<{
        id?: string; location: LatLon | { label: string };
        demand?: number[]; serviceDurationSec?: number;
        timeWindows?: Array<[string, string]>;
      }>).map(async (j, i) => ({
        id: String(j.id ?? `j${i + 1}`).replace(/[^A-Za-z0-9-_]/g, "-"),
        location: await resolveLoc(j.location),
        demand:   Array.isArray(j.demand) && j.demand.length ? j.demand : [1],
        serviceDurationSec: j.serviceDurationSec,
        timeWindows: j.timeWindows,
      }))
    );

    const solution = await tourPlan({ types, jobs });

    return NextResponse.json({
      ...solution,
      // convenience rollups
      totalMiles:  solution.statistic.distanceMeters / 1609.344,
      totalHours:  solution.statistic.durationSeconds / 3600,
      tourCount:   solution.tours.length,
      stopCount:   solution.tours.reduce((a, t) => a + t.stops.length, 0),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
