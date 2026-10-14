import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deleteDocument, getDocumentFile } from "@/lib/documents";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const f = getDocumentFile(s.sub, id);
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  // file_data is stored as base64 data URL or raw base64; normalize to raw.
  const b64 = f.data.startsWith("data:") ? f.data.split(",", 2)[1] ?? "" : f.data;
  const buf = Buffer.from(b64, "base64");
  return new NextResponse(buf, {
    headers: {
      "content-type": f.mime,
      "content-disposition": `inline; filename="${encodeURIComponent(f.title)}"`,
    },
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const ok = deleteDocument(s.sub, id);
  return NextResponse.json({ ok });
}
