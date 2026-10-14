import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listDocuments, createDocument, DOCUMENT_KINDS } from "@/lib/documents";

export const runtime = "nodejs";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ documents: listDocuments(s.sub) });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const kind = String(body?.kind ?? "");
  const title = String(body?.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!DOCUMENT_KINDS.includes(kind as never)) {
    return NextResponse.json({ error: "bad kind" }, { status: 400 });
  }
  const doc = createDocument({
    userId: s.sub, kind, title,
    expiresAt: typeof body?.expiresAt === "number" ? body.expiresAt : null,
    fileData: typeof body?.fileData === "string" ? body.fileData : null,
    fileMime: typeof body?.fileMime === "string" ? body.fileMime : null,
  });
  return NextResponse.json({ document: doc });
}
