"use client";

import { useEffect, useRef, useState } from "react";

interface Driver { id: string; name: string; email: string }
interface Thread {
  driverId: string; driverName: string; lastBody: string; lastAt: number;
  lastFromRole: string; unreadForDispatch: number;
}
interface Message {
  id: string; fromRole: "driver" | "dispatcher"; fromName: string;
  body: string; createdAt: number; driverId: string;
  lat?: number | null; lon?: number | null;
}

export function MessagesPanel({ drivers, initialThreads }: { drivers: Driver[]; initialThreads: Thread[] }) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [selected, setSelected] = useState<string | null>(initialThreads[0]?.driverId ?? drivers[0]?.id ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function refreshThread(driverId: string) {
    const r = await fetch(`/api/messages?driverId=${encodeURIComponent(driverId)}`, { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      setMessages(d.messages ?? []);
    }
  }
  async function refreshInbox() {
    const r = await fetch(`/api/messages`, { cache: "no-store" });
    if (r.ok) setThreads((await r.json()).threads ?? []);
  }

  useEffect(() => {
    if (selected) refreshThread(selected);
  }, [selected]);

  useEffect(() => {
    const i = setInterval(() => {
      refreshInbox();
      if (selected) refreshThread(selected);
    }, 5000);
    return () => clearInterval(i);
  }, [selected]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    if (!selected || !draft.trim()) return;
    setSending(true);
    try {
      const r = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: selected, body: draft }),
      });
      if (r.ok) {
        setDraft("");
        await refreshThread(selected);
        await refreshInbox();
      }
    } finally {
      setSending(false);
    }
  }

  const driversMap = new Map(drivers.map((d) => [d.id, d]));
  const rows: Thread[] = drivers.map((d) => {
    const t = threads.find((x) => x.driverId === d.id);
    return t ?? { driverId: d.id, driverName: d.name, lastBody: "No messages yet", lastAt: 0, lastFromRole: "dispatcher", unreadForDispatch: 0 };
  }).sort((a, b) => b.lastAt - a.lastAt);

  return (
    <section className="mt-6 grid gap-4 md:grid-cols-[280px_1fr]">
      <aside className="rounded-2xl border border-ink-200 bg-white p-3 shadow-card max-h-[70vh] overflow-y-auto">
        {rows.length === 0 && <div className="p-4 text-sm text-ink-500">No drivers yet. Invite one from Team.</div>}
        {rows.map((t) => (
          <button
            key={t.driverId}
            onClick={() => setSelected(t.driverId)}
            className={`w-full text-left rounded-lg px-3 py-2 mb-1 transition ${
              selected === t.driverId ? "bg-ink-900 text-offwhite" : "hover:bg-ink-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">{t.driverName}</span>
              {t.unreadForDispatch > 0 && (
                <span className="rounded-full bg-ink-900 px-2 py-0.5 text-[10px] font-bold text-offwhite">{t.unreadForDispatch}</span>
              )}
            </div>
            <div className={`text-xs truncate ${selected === t.driverId ? "text-offwhite/70" : "text-ink-500"}`}>
              {t.lastFromRole === "driver" ? "" : "You: "}{t.lastBody}
            </div>
          </button>
        ))}
      </aside>

      <div className="rounded-2xl border border-ink-200 bg-white shadow-card flex flex-col h-[70vh]">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-ink-500">Pick a driver to start chatting.</div>
        ) : (
          <>
            <header className="border-b border-ink-200 px-4 py-3">
              <div className="font-bold">{driversMap.get(selected)?.name ?? "Driver"}</div>
              <div className="text-xs text-ink-500">{driversMap.get(selected)?.email}</div>
            </header>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {messages.length === 0 && (
                <div className="text-center text-sm text-ink-500 pt-10">Say hi to kick off the thread.</div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.fromRole === "dispatcher" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    m.fromRole === "dispatcher" ? "bg-ink-900 text-offwhite" : "bg-ink-50 text-ink-900"
                  }`}>
                    <div className="text-[10px] uppercase tracking-wider opacity-60 font-bold">
                      {m.fromRole === "dispatcher" ? "You" : m.fromName}
                    </div>
                    {m.body && <div className="whitespace-pre-wrap">{m.body}</div>}
                    {m.lat != null && m.lon != null && (
                      <a
                        href={`https://www.google.com/maps?q=${m.lat},${m.lon}`}
                        target="_blank"
                        rel="noreferrer"
                        className={`mt-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${
                          m.fromRole === "dispatcher" ? "bg-offwhite/15 text-offwhite" : "bg-ink-900 text-offwhite"
                        }`}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg>
                        Pinned location · {m.lat.toFixed(4)}, {m.lon.toFixed(4)}
                      </a>
                    )}
                    <div className={`text-[10px] mt-1 ${m.fromRole === "dispatcher" ? "text-offwhite/60" : "text-ink-400"}`}>
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <footer className="border-t border-ink-200 p-3 flex gap-2">
              <input
                className="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm"
                placeholder="Type a message…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                disabled={sending}
              />
              <button
                onClick={send}
                disabled={sending || !draft.trim()}
                className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                Send
              </button>
            </footer>
          </>
        )}
      </div>
    </section>
  );
}
