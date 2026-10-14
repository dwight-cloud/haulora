import { NextRequest, NextResponse } from "next/server";
import { createReport, listReportsNear, purgeExpiredReports, REPORT_KINDS, type ReportKind } from "@/lib/reports";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  const radius = Number(sp.get("radiusKm") ?? "50");
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "lat,lon required" }, { status: 400 });
  }
  purgeExpiredReports();
  const kindsRaw = sp.get("kinds");
  const kinds = kindsRaw
    ? (kindsRaw.split(",").filter((k): k is ReportKind => (REPORT_KINDS as readonly string[]).includes(k)))
    : undefined;
  return NextResponse.json({ reports: listReportsNear(lat, lon, radius, kinds) });
}

export async function POST(req: NextRequest) {
  // Anonymous — no auth required. Rate limit via IP not implemented in MVP.
  const body = await req.json().catch(() => ({}));
  const kind = body?.kind as ReportKind;
  if (!(REPORT_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }
  const lat = Number(body?.lat);
  const lon = Number(body?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "lat,lon required" }, { status: 400 });
  }
  const report = createReport({
    kind, lat, lon,
    note: typeof body?.note === "string" ? body.note.slice(0, 280) : null,
  });
  return NextResponse.json({ report });
}
