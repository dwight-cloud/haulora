import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { sendMessage, listThread, listThreadsForAccount, markThreadReadFor } from "@/lib/messages";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = await getSessionFromRequest(req);
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const driverIdParam = url.searchParams.get("driverId");

  if (s.role === "driver") {
    // Drivers only ever see their own thread.
    markThreadReadFor(s.accountId, s.sub, "driver");
    return NextResponse.json({ messages: listThread(s.accountId, s.sub) });
  }

  // Dispatcher
  if (driverIdParam) {
    markThreadReadFor(s.accountId, driverIdParam, "dispatcher");
    return NextResponse.json({ messages: listThread(s.accountId, driverIdParam) });
  }
  return NextResponse.json({ threads: listThreadsForAccount(s.accountId) });
}

export async function POST(req: NextRequest) {
  const s = await getSessionFromRequest(req);
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body?.body === "string" ? body.body : "";
  const lat = typeof body?.lat === "number" && Number.isFinite(body.lat) ? body.lat : null;
  const lon = typeof body?.lon === "number" && Number.isFinite(body.lon) ? body.lon : null;
  if (!text.trim() && (lat == null || lon == null)) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }

  let driverId: string;
  if (s.role === "driver") {
    driverId = s.sub;
  } else {
    const bodyDriverId = typeof body?.driverId === "string" ? body.driverId : "";
    if (!bodyDriverId) return NextResponse.json({ error: "driverId required" }, { status: 400 });
    // Confirm the driver belongs to this dispatcher's account
    const row = db.prepare(`SELECT account_id, role FROM users WHERE id = ?`).get(bodyDriverId) as
      | { account_id: string; role: string } | undefined;
    if (!row || row.account_id !== s.accountId || row.role !== "driver") {
      return NextResponse.json({ error: "driver not in account" }, { status: 403 });
    }
    driverId = bodyDriverId;
  }

  const msg = sendMessage({
    accountId: s.accountId,
    fromUserId: s.sub,
    fromRole: s.role as "driver" | "dispatcher",
    fromName: s.name,
    driverId,
    body: text,
    lat, lon,
  });
  return NextResponse.json({ message: msg });
}
