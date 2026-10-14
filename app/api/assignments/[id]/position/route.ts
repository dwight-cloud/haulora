import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getAssignment } from "@/lib/assignments";
import {
  recordPosition, latestPosition, saveLiveEta,
} from "@/lib/tracking";
import { truckRoute } from "@/lib/here";

export const runtime = "nodejs";

/**
 * POST /api/assignments/:id/position
 * Driver pushes a position fix while on this assignment. Body:
 *   { lat, lon, heading?, speedMps?, accuracyM?, recordedAt? }
 *
 * On every push we ALSO recompute the live ETA via HERE so the dispatcher
 * sees a fresh arrival time without a separate cron job. HERE call is
 * fire-and-forget so the driver never waits on it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionFromRequest(req);
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "driver") return NextResponse.json({ error: "drivers only" }, { status: 403 });

  const { id } = await params;
  const a = getAssignment(id);
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (a.driverId !== s.sub) return NextResponse.json({ error: "not your assignment" }, { status: 403 });

  const body = await req.json().catch(() => null) as {
    lat?: number; lon?: number; heading?: number; speedMps?: number;
    accuracyM?: number; recordedAt?: number;
  } | null;
  if (!body || typeof body.lat !== "number" || typeof body.lon !== "number") {
    return NextResponse.json({ error: "lat & lon required" }, { status: 400 });
  }

  recordPosition({
    assignmentId: id,
    driverId: s.sub,
    position: {
      lat: body.lat, lon: body.lon,
      heading: body.heading,
      speedMps: body.speedMps,
      accuracyM: body.accuracyM,
      recordedAt: body.recordedAt ?? Date.now(),
    },
  });

  // Async ETA recompute — only re-route every ~5 min per assignment to cap
  // HERE usage. We use the truck's current pos → original destination.
  recomputeLiveEtaIfStale(id, body.lat, body.lon, a).catch((e) => {
    console.warn("[live-eta] recompute failed:", e instanceof Error ? e.message : e);
  });

  return NextResponse.json({ ok: true });
}

/**
 * GET /api/assignments/:id/position
 * Latest position fix for this assignment. Dispatcher polls this.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionFromRequest(req);
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const a = getAssignment(id);
  if (!a || a.accountId !== s.accountId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const p = latestPosition(id);
  return NextResponse.json({ position: p });
}

// ---- helpers ----

const RECOMPUTE_INTERVAL_MS = 5 * 60 * 1000;
const lastRecomputeAt = new Map<string, number>();

async function recomputeLiveEtaIfStale(
  assignmentId: string,
  fromLat: number, fromLon: number,
  a: { destLat: number; destLon: number; heightMeters?: number; weightKg?: number; axleCount?: number; hazardous: boolean },
) {
  const last = lastRecomputeAt.get(assignmentId) ?? 0;
  if (Date.now() - last < RECOMPUTE_INTERVAL_MS) return;
  lastRecomputeAt.set(assignmentId, Date.now());

  const result = await truckRoute(
    { lat: fromLat, lon: fromLon },
    { lat: a.destLat, lon: a.destLon },
    {
      heightMeters: a.heightMeters ?? 4.11,
      weightKg:     a.weightKg     ?? 36000,
      axleCount:    a.axleCount,
      hazardous:    a.hazardous,
    },
  );
  const opt = result.primary;
  const etaMs = Date.now() + opt.durationSeconds * 1000;
  saveLiveEta(assignmentId, {
    etaIso:        new Date(etaMs).toISOString(),
    distanceMiles: opt.distanceMeters / 1609.344,
    durationHours: opt.durationSeconds / 3600,
    updatedAt:     Date.now(),
  });
}
