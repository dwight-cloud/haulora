import { NextRequest, NextResponse } from "next/server";
import { requireDispatcher } from "@/lib/api-helpers";
import { listLoads, listCustomers, listTrucks } from "@/lib/domain/repo";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;
  const a = auth.session.accountId;
  return NextResponse.json({ loads: listLoads(a), customers: listCustomers(a), trucks: listTrucks(a) });
}
