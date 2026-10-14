import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listPodsSummary, createPod } from "@/lib/pod";

export const runtime = "nodejs";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ pods: listPodsSummary(s.sub) });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const pod = createPod({
    userId: s.sub,
    routeLabel: typeof body?.routeLabel === "string" ? body.routeLabel : null,
    signerName: typeof body?.signerName === "string" ? body.signerName : null,
    signerSignature: typeof body?.signerSignature === "string" ? body.signerSignature : null,
    photoData: typeof body?.photoData === "string" ? body.photoData : null,
    notes: typeof body?.notes === "string" ? body.notes : null,
  });
  return NextResponse.json({ ok: true, id: pod.id, createdAt: pod.createdAt });
}
