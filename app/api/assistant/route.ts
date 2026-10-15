import { NextRequest, NextResponse } from "next/server";
import { requireDispatcher, rateLimit } from "@/lib/api-helpers";
import { askAssistant, STARTER_QUESTIONS } from "@/lib/assistant";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({ starters: STARTER_QUESTIONS });
}

/** Read-only helper chat. Rate limited per visitor; shares the daily model cap. */
export async function POST(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;
  const limited = rateLimit(req, "assistant", 30, 10 * 60_000);
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? "").trim().slice(0, 600);
  if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });
  const history = Array.isArray(body.history) ? body.history.filter((h: { role?: string; content?: string }) => (h.role === "user" || h.role === "assistant") && typeof h.content === "string").slice(-6) : [];
  const reply = await askAssistant({ accountId: auth.session.accountId, question, page: typeof body.page === "string" ? body.page : undefined, history });
  return NextResponse.json(reply);
}
