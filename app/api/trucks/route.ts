import { NextRequest, NextResponse } from "next/server";
import { requireDispatcher } from "@/lib/api-helpers";
import { listTrucks } from "@/lib/domain/repo";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;
  return NextResponse.json({ trucks: listTrucks(auth.session.accountId) });
}
