import { NextResponse } from "next/server";
import { PERMIT_DIRECTORY } from "@/lib/permits";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ permits: PERMIT_DIRECTORY });
}
