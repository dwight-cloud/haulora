import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listDvirs, createDvir, DVIR_CHECKLIST, type Defect } from "@/lib/dvir";

export const runtime = "nodejs";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ reports: listDvirs(s.sub), checklist: DVIR_CHECKLIST });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const kind = body?.kind === "post" ? "post" : "pre";
  const truckId = String(body?.truckId ?? "unassigned").slice(0, 64);
  const defects: Defect[] = Array.isArray(body?.defects)
    ? body.defects.filter((d: unknown): d is Defect =>
        !!d && typeof d === "object" && typeof (d as Defect).item === "string"
        && ((d as Defect).severity === "minor" || (d as Defect).severity === "major"))
    : [];
  const rep = createDvir({
    userId: s.sub, truckId, kind, defects,
    odometer: typeof body?.odometer === "number" ? body.odometer : null,
    signature: typeof body?.signature === "string" ? body.signature : null,
  });
  return NextResponse.json({ report: rep });
}
