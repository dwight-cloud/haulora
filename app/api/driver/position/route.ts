import { NextRequest, NextResponse } from "next/server";
import { requireDriverContext } from "@/lib/driver-api";
import { updateTruckPosition } from "@/lib/domain/repo";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ctx = await requireDriverContext(req);
  if ("error" in ctx) return ctx.error;
  const body = await req.json().catch(() => ({})) as { lat?: unknown; lon?: unknown };
  const lat = Number(body.lat), lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "lat and lon are required" }, { status: 400 });
  }
  return NextResponse.json({ truck: updateTruckPosition(ctx.truck.id, lat, lon) });
}
