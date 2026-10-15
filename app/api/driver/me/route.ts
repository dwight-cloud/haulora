import { NextRequest, NextResponse } from "next/server";
import { requireDriverContext } from "@/lib/driver-api";
import { listDriverJobs, setDriverTruck } from "@/lib/domain/driver";
import { listTrucks } from "@/lib/domain/repo";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await requireDriverContext(req);
  if ("error" in ctx) return ctx.error;
  const { session, truck } = ctx;
  return NextResponse.json({
    user: { id: session.sub, name: session.name, role: session.role, accountName: session.accountName },
    truck,
    trucks: listTrucks(session.accountId),
    jobs: listDriverJobs(session.accountId, truck.id),
  });
}

/** Switch truck: { truckId }. */
export async function POST(req: NextRequest) {
  const ctx = await requireDriverContext(req);
  if ("error" in ctx) return ctx.error;
  const body = await req.json().catch(() => ({})) as { truckId?: string };
  const next = listTrucks(ctx.session.accountId).find((t) => t.id === body.truckId);
  if (!next) return NextResponse.json({ error: "That truck is not in your fleet" }, { status: 400 });
  setDriverTruck(ctx.session.sub, next.id);
  return NextResponse.json({ ok: true, truck: next });
}
