"use client";

import { Clock } from "lucide-react";

/**
 * Renders the live ETA for an assignment row in the dispatcher table.
 * Shows planned ETA when no live update yet, live ETA + delta vs planned
 * when the driver has been streaming positions and HERE recomputed.
 */
export function LiveEtaCell({
  status,
  createdAt,
  plannedDurationHours,
  liveEtaIso,
  liveDurationHours,
  liveUpdatedAt,
}: {
  status: string;
  createdAt: number;
  plannedDurationHours: number;
  liveEtaIso?: string | null;
  liveDurationHours?: number | null;
  liveUpdatedAt?: number | null;
}) {
  // Inactive runs: just show "—"
  if (status === "completed" || status === "cancelled") {
    return <span className="text-xs text-ink-400">—</span>;
  }

  // No live data yet: planned ETA = createdAt + planned duration
  if (!liveEtaIso || !liveUpdatedAt) {
    const ms = createdAt + plannedDurationHours * 3_600_000;
    const t  = new Date(ms);
    return (
      <div className="text-right">
        <div className="font-mono text-[13px] text-ink-700">
          {t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="text-[10px] text-ink-400">planned</div>
      </div>
    );
  }

  // Live data: surface delta vs planned in minutes, color by severity.
  const liveT = new Date(liveEtaIso);
  const deltaH = (liveDurationHours ?? plannedDurationHours) - plannedDurationHours;
  const deltaMin = Math.round(deltaH * 60);

  let tone = "text-ink-700";
  let label = "live";
  if (deltaMin >= 30)      { tone = "text-red-600";    label = `+${deltaMin}m late`; }
  else if (deltaMin >= 10) { tone = "text-amber-600";  label = `+${deltaMin}m late`; }
  else if (deltaMin <= -10){ tone = "text-emerald-600";label = `${deltaMin}m early`; }
  else                     { tone = "text-emerald-700";label = "on time"; }

  const ageSec = Math.max(1, Math.round((Date.now() - liveUpdatedAt) / 1000));
  const fresh = ageSec < 600 ? `${ageSec < 60 ? `${ageSec}s` : `${Math.round(ageSec/60)}m`} ago` : `${Math.round(ageSec/3600)}h ago`;

  return (
    <div className="text-right">
      <div className={`flex items-center justify-end gap-1 font-mono text-[13px] ${tone}`}>
        <Clock className="h-3 w-3" />
        {liveT.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
      <div className={`text-[10px] ${tone}`}>{label} · {fresh}</div>
    </div>
  );
}
