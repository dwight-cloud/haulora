import { NextRequest, NextResponse } from "next/server";
import { getAssignment } from "@/lib/assignments";
import {
  lookupTrackingToken, latestPosition, readLiveEta,
} from "@/lib/tracking";

export const runtime = "nodejs";

/**
 * GET /api/track/:token
 * PUBLIC — no auth. Returns sanitized tracking data for a shipper:
 * route polyline, origin/destination labels, current truck position, ETA.
 * Driver name, account info, internal ids are deliberately stripped.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = lookupTrackingToken(token);
  if (!t) return NextResponse.json({ error: "link not valid" }, { status: 404 });

  const a = getAssignment(t.assignmentId);
  if (!a) return NextResponse.json({ error: "shipment not found" }, { status: 404 });

  const pos = latestPosition(a.id);
  const liveEta = readLiveEta(a.id);

  return NextResponse.json({
    shipment: {
      origin:      a.originLabel,
      destination: a.destLabel,
      originLat: a.originLat, originLon: a.originLon,
      destLat:   a.destLat,   destLon:   a.destLon,
      polyline:  a.polyline,
      status:    a.status,
      plannedDistanceMiles: a.distanceMiles,
      plannedDurationHours: a.durationHours,
    },
    live: {
      position: pos ? {
        lat: pos.lat, lon: pos.lon,
        heading: pos.heading, speedMps: pos.speedMps,
        recordedAt: pos.recordedAt,
      } : null,
      eta: liveEta ? {
        etaIso:        liveEta.etaIso,
        distanceMiles: liveEta.distanceMiles,
        durationHours: liveEta.durationHours,
        updatedAt:     liveEta.updatedAt,
      } : null,
    },
  });
}
