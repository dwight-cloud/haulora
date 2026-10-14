import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { fetchVehicles, getConnection } from "@/lib/samsara";

export const runtime = "nodejs";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const conn = getConnection(s.accountId);
  if (!conn) return NextResponse.json({ connected: false, vehicles: [] });
  try {
    const vehicles = await fetchVehicles(conn);
    return NextResponse.json({ connected: true, sandbox: conn.sandbox, vehicles });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "samsara error",
    }, { status: 502 });
  }
}
