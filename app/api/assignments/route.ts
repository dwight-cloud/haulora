import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { findUserById } from "@/lib/db";
import {
  createAssignment,
  listAssignmentsForAccount,
  listAssignmentsForDriver,
} from "@/lib/assignments";

export async function GET(req: NextRequest) {
  const s = await getSessionFromRequest(req);
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const mine = req.nextUrl.searchParams.get("mine") === "1";
  if (s.role === "driver" || mine) {
    return NextResponse.json({ assignments: listAssignmentsForDriver(s.sub) });
  }
  return NextResponse.json({ assignments: listAssignmentsForAccount(s.accountId) });
}

export async function POST(req: NextRequest) {
  const s = await getSessionFromRequest(req);
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "dispatcher") {
    return NextResponse.json({ error: "only dispatchers can assign routes" }, { status: 403 });
  }
  const body = await req.json().catch(() => null) as {
    driverId?: string;
    originLabel?: string; destLabel?: string;
    originLat?: number; originLon?: number; destLat?: number; destLon?: number;
    polyline?: string;
    distanceMiles?: number; durationHours?: number; riskScore?: number;
    heightMeters?: number; weightKg?: number; axleCount?: number;
    hazardous?: boolean; note?: string;
  } | null;
  if (!body?.driverId || !body.polyline || !body.originLabel || !body.destLabel) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  // Verify driver belongs to dispatcher's account
  const driver = findUserById(body.driverId);
  if (!driver || driver.account_id !== s.accountId || driver.role !== "driver") {
    return NextResponse.json({ error: "driver not found in your account" }, { status: 404 });
  }
  const a = createAssignment({
    accountId: s.accountId,
    driverId: body.driverId,
    createdBy: s.sub,
    originLabel: body.originLabel,
    destLabel: body.destLabel,
    originLat: body.originLat ?? 0,
    originLon: body.originLon ?? 0,
    destLat: body.destLat ?? 0,
    destLon: body.destLon ?? 0,
    polyline: body.polyline,
    distanceMiles: body.distanceMiles ?? 0,
    durationHours: body.durationHours ?? 0,
    riskScore: body.riskScore ?? 0,
    heightMeters: body.heightMeters,
    weightKg: body.weightKg,
    axleCount: body.axleCount,
    hazardous: body.hazardous,
    note: body.note,
  });
  return NextResponse.json({ assignment: a }, { status: 201 });
}
