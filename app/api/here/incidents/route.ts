import { NextRequest, NextResponse } from "next/server";
import { trafficIncidents, type TrafficIncident } from "@/lib/here";
import { decodeFlexiblePolyline } from "@/lib/polyline";

export const runtime = "nodejs";

/**
 * GET /api/here/incidents
 *   ?polyline=<flex-polyline>         → HERE incidents in the route's bbox, filtered to corridor
 *   OR ?west=&south=&east=&north=     → explicit bbox
 *
 * Separate from /api/traffic/incidents (511) — this is HERE's global feed.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const poly = searchParams.get("polyline");
    const corridorKm = Math.max(1, parseFloat(searchParams.get("corridorKm") ?? "8"));

    let bbox: { west: number; south: number; east: number; north: number };
    let filter: ((inc: TrafficIncident) => boolean) | null = null;

    if (poly) {
      const coords = decodeFlexiblePolyline(poly);
      if (coords.length < 2) {
        return NextResponse.json({ error: "empty polyline" }, { status: 400 });
      }
      let w = coords[0].lon, e = coords[0].lon, s = coords[0].lat, n = coords[0].lat;
      for (const c of coords) {
        if (c.lon < w) w = c.lon;
        if (c.lon > e) e = c.lon;
        if (c.lat < s) s = c.lat;
        if (c.lat > n) n = c.lat;
      }
      bbox = { west: w - 0.1, east: e + 0.1, south: s - 0.1, north: n + 0.1 };
      filter = (inc) => coords.some((c) => haversineKm(c, inc.position) <= corridorKm);
    } else {
      const w = parseFloat(searchParams.get("west")  ?? "");
      const e = parseFloat(searchParams.get("east")  ?? "");
      const s = parseFloat(searchParams.get("south") ?? "");
      const n = parseFloat(searchParams.get("north") ?? "");
      if (![w, e, s, n].every(isFinite)) {
        return NextResponse.json({ error: "polyline or bbox required" }, { status: 400 });
      }
      bbox = { west: w, east: e, south: s, north: n };
    }

    let incidents = await trafficIncidents(bbox);
    if (filter) incidents = incidents.filter(filter);
    incidents.sort((a, b) => (b.criticality - a.criticality) ||
      (Date.parse(a.startTime ?? "") - Date.parse(b.startTime ?? "")));
    return NextResponse.json({ incidents });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
