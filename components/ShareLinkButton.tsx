"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Plus, Share2, Trash2, X } from "lucide-react";

interface TrackingToken {
  token: string;
  assignmentId: string;
  createdAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
}

/**
 * Dispatcher action on an assignment row.
 *
 * Click → opens a popover with all active share URLs for this assignment.
 * "+ New link" creates one. Each URL renders in a select-all input so the
 * dispatcher can always copy it manually (cmd+C) — handy when the page is
 * served over plain HTTP, where `navigator.clipboard` is blocked.
 *
 * Each URL has a Copy (best-effort), Open, and Revoke action.
 */
export function ShareLinkButton({ assignmentId }: { assignmentId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tokens, setTokens] = useState<TrackingToken[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Load existing tokens when the popover opens
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/assignments/${assignmentId}/share`, { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (alive) setTokens(d.tokens ?? []);
      } catch { /* network blip */ }
    })();
    return () => { alive = false; };
  }, [open, assignmentId]);

  async function createLink() {
    setBusy(true);
    try {
      const r = await fetch(`/api/assignments/${assignmentId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInHours: 72 }),
      });
      const d = await r.json();
      if (r.ok) {
        // Refresh list
        const list = await fetch(`/api/assignments/${assignmentId}/share`, { cache: "no-store" }).then((x) => x.json());
        setTokens(list.tokens ?? []);
      } else {
        alert(d.error ?? "Failed to generate link.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: string) {
    if (!confirm("Revoke this tracking link? Anyone using it will lose access.")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/assignments/${assignmentId}/share?token=${encodeURIComponent(token)}`, {
        method: "DELETE",
      });
      if (r.ok) setTokens((prev) => prev.filter((t) => t.token !== token));
    } finally {
      setBusy(false);
    }
  }

  const activeTokens = tokens.filter((t) => !t.revokedAt);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-700 hover:text-ink-900"
      >
        <Share2 className="h-3 w-3" />
        Share{activeTokens.length > 0 ? ` (${activeTokens.length})` : ""}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-[420px] rounded-xl border border-ink-200 bg-white p-3 text-left shadow-card-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">Tracking links</div>
              <div className="text-xs text-ink-500">Public URLs that show this shipment to a customer.</div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {activeTokens.length === 0 && (
              <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50/60 p-3 text-xs text-ink-500">
                No active links yet. Generate one below.
              </div>
            )}
            {activeTokens.map((t) => (
              <TokenRow
                key={t.token}
                url={publicUrlFor(t.token)}
                expiresAt={t.expiresAt}
                onRevoke={() => revoke(t.token)}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={createLink}
            disabled={busy}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            {busy ? "Creating…" : "New link (72h)"}
          </button>
        </div>
      )}
    </div>
  );
}

function TokenRow({
  url, expiresAt, onRevoke,
}: { url: string; expiresAt: number | null; onRevoke: () => void }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function copyNow() {
    const success = await tryCopy(url, inputRef.current);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-2">
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 truncate rounded border border-ink-200 bg-ink-50/60 px-2 py-1 font-mono text-[11px] text-ink-700 focus:outline-none focus:ring-1 focus:ring-ink-300"
        />
        <button
          type="button"
          onClick={copyNow}
          title="Copy"
          className="rounded p-1.5 text-ink-600 hover:bg-ink-100 hover:text-ink-900"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          title="Open"
          className="rounded p-1.5 text-ink-600 hover:bg-ink-100 hover:text-ink-900"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <button
          type="button"
          onClick={onRevoke}
          title="Revoke"
          className="rounded p-1.5 text-ink-600 hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {expiresAt && (
        <div className="mt-1 text-[10px] text-ink-500">
          Expires {new Date(expiresAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
}

function publicUrlFor(token: string): string {
  if (typeof window === "undefined") return `/track/${token}`;
  return `${window.location.origin}/track/${token}`;
}

/**
 * Best-effort clipboard copy.
 *  1. Async clipboard API — only works on secure contexts (HTTPS / localhost)
 *  2. document.execCommand('copy') on a selected input — works on plain HTTP too
 *  3. Fallback to selecting the input and asking the user to press cmd+C
 */
async function tryCopy(text: string, input: HTMLInputElement | null): Promise<boolean> {
  // 1) modern API
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* fall through */ }
  }
  // 2) execCommand on the visible input
  if (input) {
    input.focus();
    input.select();
    try {
      const ok = document.execCommand("copy");
      if (ok) return true;
    } catch { /* fall through */ }
  }
  // 3) detached textarea
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) return true;
  } catch { /* nope */ }
  // 4) ask the user — at least make the URL selected
  if (input) input.select();
  alert("Couldn't copy automatically. The URL is selected — press " + (navigator.userAgent.includes("Mac") ? "⌘C" : "Ctrl+C") + " to copy.");
  return false;
}
