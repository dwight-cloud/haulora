import { NextResponse } from "next/server";
import { mockFleet } from "@/lib/mock-fleet";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ trucks: mockFleet });
}
