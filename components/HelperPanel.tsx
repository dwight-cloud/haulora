"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Compass, Loader2, MessageCircle, Send, X } from "lucide-react";
import { cx } from "./ui/primitives";

/**
 * "Ask Haulio": a floating, read-only chat that explains the system and what
 * is happening in the fleet. It talks to POST /api/assistant, which can look
 * but never change anything. Open state and the last 10 messages persist in
 * sessionStorage so the conversation survives page changes.
 */

type Msg = { role: "user" | "assistant"; content: string; costUsd?: number; error?: boolean };
interface Reply { answer: string; costUsd: number; mock: boolean; suggestions: string[] }

const STORE_OPEN = "haulio.helper.open";
const STORE_MSGS = "haulio.helper.msgs";
const MAX_STORED = 10;

function load<T>(key: string, fallback: T): T {
  try { const v = sessionStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function save(key: string, value: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode / quota */ }
}

export function HelperPanel() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [starters, setStarters] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Hydrate from sessionStorage and fetch starter questions once.
  useEffect(() => {
    setOpen(load(STORE_OPEN, false));
    setMsgs(load<Msg[]>(STORE_MSGS, []));
    setHydrated(true);
    fetch("/api/assistant", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((d) => { if (d?.starters) setStarters(d.starters); }).catch(() => {});
  }, []);
  useEffect(() => { if (hydrated) save(STORE_OPEN, open); }, [open, hydrated]);
  useEffect(() => { if (hydrated) save(STORE_MSGS, msgs.slice(-MAX_STORED)); }, [msgs, hydrated]);

  // Other components can open the panel ("Ask the helper" buttons).
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("haulio:helper:open", onOpen);
    return () => window.removeEventListener("haulio:helper:open", onOpen);
  }, []);

  // Esc closes and returns focus to the launcher.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); buttonRef.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [open]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy, open]);

  const send = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");
    const history = msgs.filter((m) => !m.error).slice(-6).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((xs) => [...xs, { role: "user", content: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ question, page: window.location.pathname, history }),
      });
      let body: Partial<Reply> & { error?: string } = {};
      try { body = await res.json(); } catch { /* non-JSON */ }
      if (res.status === 429) {
        setMsgs((xs) => [...xs, { role: "assistant", content: body.error ?? "You are asking faster than the helper can answer. Wait a minute and try again.", error: true }]);
      } else if (res.status === 401) {
        setMsgs((xs) => [...xs, { role: "assistant", content: "Your session has ended. Sign in again from the home page.", error: true }]);
      } else if (!res.ok || !body.answer) {
        setMsgs((xs) => [...xs, { role: "assistant", content: body.error ?? `The helper could not answer (${res.status}). Try again in a moment.`, error: true }]);
      } else {
        setMsgs((xs) => [...xs, { role: "assistant", content: body.answer!, costUsd: body.costUsd ?? 0 }]);
        setSuggestions(body.suggestions ?? []);
      }
    } catch {
      setMsgs((xs) => [...xs, { role: "assistant", content: "No connection. Check the network and try again.", error: true }]);
    } finally { setBusy(false); }
  }, [busy, msgs]);

  const cost = msgs.reduce((s, m) => s + (m.costUsd ?? 0), 0);
  const chips = (msgs.length === 0 ? starters : suggestions).slice(0, msgs.length === 0 ? 6 : 3);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="haulio-helper"
        className={cx(
          "fixed bottom-20 right-4 z-[60] h-12 items-center gap-2 rounded-full bg-rust-500 pl-4 pr-5 text-sm font-semibold text-white shadow-glow transition hover:bg-rust-600 md:bottom-5 md:right-5",
          open ? "hidden md:inline-flex" : "inline-flex"
        )}
      >
        <MessageCircle className="h-5 w-5" aria-hidden /> Ask Haulio
      </button>

      {open && (
        <section
          id="haulio-helper"
          role="dialog"
          aria-label="Haulio helper"
          className="fixed inset-0 z-[70] flex flex-col bg-white shadow-card-lg md:inset-auto md:bottom-20 md:right-5 md:h-[600px] md:max-h-[calc(100vh-6rem)] md:w-[380px] md:rounded-2xl md:border md:border-bitumen-200"
        >
          <header className="flex items-start justify-between gap-3 border-b border-bitumen-100 px-4 py-3">
            <div className="min-w-0">
              <div className="text-[14px] font-bold text-bitumen-900">Haulio helper</div>
              <div className="text-[11px] leading-4 text-bitumen-500">Explains the system, never changes anything</div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("haulio:tour:start")); }} className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-[12px] font-semibold text-bitumen-600 hover:bg-bitumen-50 hover:text-bitumen-900" title="Guided tour">
                <Compass className="h-3.5 w-3.5" /> Show me around
              </button>
              <button type="button" onClick={() => { setOpen(false); buttonRef.current?.focus(); }} aria-label="Close helper" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-bitumen-500 hover:bg-bitumen-50 hover:text-bitumen-900"><X className="h-4 w-4" /></button>
            </div>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {msgs.length === 0 && (
              <div className="rounded-xl bg-bitumen-50 px-3 py-2.5 text-[13px] leading-5 text-bitumen-700">
                Ask anything about Haulio: what a page is for, what the agents just did, or what to click next. I can read your fleet's data but I cannot change it.
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cx(
                  "max-w-[88%] rounded-2xl px-3.5 py-2 text-[13px] leading-5",
                  m.role === "user" ? "rounded-br-sm bg-bitumen-900 text-white" : m.error ? "rounded-bl-sm border border-red-200 bg-red-50 text-red-800" : "rounded-bl-sm bg-bitumen-50 text-bitumen-800"
                )}>
                  {m.role === "assistant" && !m.error ? <Lite text={m.content} /> : m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start" role="status">
                <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-sm bg-bitumen-50 px-3.5 py-2 text-[13px] text-bitumen-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…</div>
              </div>
            )}
          </div>

          {chips.length > 0 && !busy && (
            <div className="flex flex-wrap gap-1.5 border-t border-bitumen-100 px-4 py-2">
              {chips.map((q) => (
                <button key={q} type="button" onClick={() => send(q)} className="rounded-full border border-bitumen-200 bg-white px-2.5 py-1 text-left text-[12px] font-medium text-bitumen-700 transition hover:border-rust-300 hover:text-rust-700">{q}</button>
              ))}
            </div>
          )}

          <form className="border-t border-bitumen-100 px-3 py-2.5" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                rows={1}
                maxLength={600}
                placeholder="Ask a question… (Enter to send)"
                aria-label="Your question"
                className="input min-h-[44px] max-h-32 flex-1 resize-none py-2.5 text-[13px]"
              />
              <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-rust-500 text-white transition hover:bg-rust-600 disabled:opacity-40"><Send className="h-4 w-4" /></button>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-bitumen-400">
              <span>Cost this chat: US${cost.toFixed(4)}</span>
              {msgs.length > 0 && <button type="button" onClick={() => { setMsgs([]); setSuggestions([]); }} className="hover:text-bitumen-700">Clear</button>}
            </div>
          </form>
        </section>
      )}
    </>
  );
}

/** Markdown-lite: **bold**, numbered / bulleted lists, paragraphs. */
function Lite({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        const lines = b.split("\n").filter((l) => l.trim());
        const numbered = lines.length > 0 && lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
        const bulleted = lines.length > 0 && lines.every((l) => /^\s*[-*•]\s+/.test(l));
        if (numbered) return <ol key={i} className="list-decimal space-y-0.5 pl-5">{lines.map((l, j) => <li key={j}><Inline text={l.replace(/^\s*\d+[.)]\s+/, "")} /></li>)}</ol>;
        if (bulleted) return <ul key={i} className="list-disc space-y-0.5 pl-5">{lines.map((l, j) => <li key={j}><Inline text={l.replace(/^\s*[-*•]\s+/, "")} /></li>)}</ul>;
        return <p key={i}>{lines.map((l, j) => <span key={j}>{j > 0 && <br />}<Inline text={l} /></span>)}</p>;
      })}
    </div>
  );
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="font-semibold text-bitumen-900">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>)}</>;
}
