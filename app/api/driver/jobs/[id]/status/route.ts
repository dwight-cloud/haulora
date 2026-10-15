import { NextRequest, NextResponse } from "next/server";
import { requireDriverContext } from "@/lib/driver-api";
import { getLoad, setLoadStatus, updateTruckPosition } from "@/lib/domain/repo";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireDriverContext(req);
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { status?: string };
  if (body.status !== "en_route" && body.status !== "delivered") {
    return NextResponse.json({ error: "status must be en_route or delivered" }, { status: 400 });
  }
  const load = getLoad(id);
  if (!load || load.accountId !== ctx.session.accountId || load.truckId !== ctx.truck.id) {
    return NextResponse.json({ error: "That job is not on your truck" }, { status: 404 });
  }
  if (load.status === "delivered" || load.status === "cancelled") {
    return NextResponse.json({ error: "That job is already finished" }, { status: 409 });
  }
  const updated = setLoadStatus(load.id, body.status);
  const truck = body.status === "en_route"
    ? updateTruckPosition(ctx.truck.id, ctx.truck.lat, ctx.truck.lon, "moving")
    : updateTruckPosition(ctx.truck.id, load.destLat, load.destLon, "idle");
  return NextResponse.json({ job: updated, truck });
}
