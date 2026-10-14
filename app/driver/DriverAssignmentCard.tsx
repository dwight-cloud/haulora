"use client";

import { useState } from "react";
import type { Assignment, AssignmentStatus } from "@/lib/assignments";

export function DriverAssignmentCard({ assignment }: { assignment: Assignment }) {
  const [a, setA] = useState(assignment);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function transition(next: AssignmentStatus) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/assignments/${a.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "failed");
      setA(d.assignment);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally { setBusy(false); }
  }

  const action = a.status === "assigned"
    ? { label: "Accept", next: "accepted" as AssignmentStatus, color: "bg-ink-900 text-white" }
    : a.status === "accepted"
    ? { label: "Start run", next: "in_progress" as AssignmentStatus, color: "bg-ink-900 text-offwhite" }
    : a.status === "in_progress"
    ? { label: "Mark complete", next: "completed" as AssignmentStatus, color: "bg-green-600 text-white" }
    : null;

  const statusColor: Record<AssignmentStatus, string> = {
    assigned:    "bg-yellow-500/15 text-yellow-800",
    accepted:    "bg-blue-500/15 text-blue-800",
    in_progress: "bg-ink-900/25 text-ink-900",
    completed:   "bg-green-500/15 text-green-800",
    cancelled:   "bg-red-500/15 text-red-700",
  };

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-ink-500">Assigned run</div>
          <div className="mt-1 text-xl font-bold">{a.originLabel} → {a.destLabel}</div>
          <div className="mt-0.5 text-xs text-ink-500">
            {new Date(a.createdAt).toLocaleString()}
            {a.hazardous && <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-700">HAZMAT</span>}
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${statusColor[a.status]}`}>
          {a.status.replace("_", " ")}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded bg-ink-50 p-2"><div className="text-[10px] uppercase tracking-widest text-ink-500">Miles</div><div className="font-bold">{a.distanceMiles.toFixed(0)}</div></div>
        <div className="rounded bg-ink-50 p-2"><div className="text-[10px] uppercase tracking-widest text-ink-500">Drive</div><div className="font-bold">{a.durationHours.toFixed(1)}h</div></div>
        <div className="rounded bg-ink-50 p-2"><div className="text-[10px] uppercase tracking-widest text-ink-500">Risk</div><div className="font-bold">{a.riskScore}</div></div>
      </div>

      {a.note && (
        <div className="mt-3 rounded bg-ink-50 p-3 text-sm">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">Dispatch note</div>
          <div className="mt-0.5">{a.note}</div>
        </div>
      )}

      {action && (
        <button
          onClick={() => transition(action.next)}
          disabled={busy}
          className={`mt-4 w-full rounded-lg py-2.5 text-sm font-bold disabled:opacity-50 ${action.color}`}
        >
          {busy ? "…" : action.label}
        </button>
      )}
      {a.status === "in_progress" && (
        <p className="mt-2 text-center text-xs text-ink-500">Open the iOS app for turn-by-turn.</p>
      )}
      {err && <div className="mt-2 text-xs text-red-700">{err}</div>}
    </div>
  );
}
