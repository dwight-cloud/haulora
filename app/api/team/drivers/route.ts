import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listDriversForAccount } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (s.role !== "dispatcher") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const drivers = listDriversForAccount(s.accountId).map((d) => ({
    id: d.id, name: d.name, email: d.email, createdAt: d.created_at,
  }));
  return NextResponse.json({ accountName: s.accountName, drivers });
}
