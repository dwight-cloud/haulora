"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, BellOff, X } from "lucide-react";

interface AssignmentLite {
  id: string;
  driverName?: string | null;
  originLabel: string;
  destLabel: string;
  status: string;
  durationHours: number;            // planned
  liveEtaIso?: string | null;
  liveDurationHours?: number | null;
  liveUpdatedAt?: number | null;
}

interface ActiveDelay {
  assignmentId: string;
  label: string;
  delayMin: number;
  liveEtaIso: string;
}

const DELAY_THRESHOLD_MIN = 15;       // flip to delayed
const POLL_MS = 30_000;

/**
 * Polls the dispatcher's assignments every 30s. For each in-progress run
 * whose live ETA is more than +15 min vs plan, surfaces a toast in the
 * bottom-right and (optionally) fires an OS-level browser notification.
 *
 * State stored in localStorage so the same delay only notifies once per
 * 5 min, even across page navigations.
 */
export function DelayAlerts() {
  const [alerts, setAlerts] = useState<ActiveDelay[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const lastNotifiedAt = useRef<Map<string, number>>(loadLastNotified());

  // Bootstrap notification permission state
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setPermission(Notification.permission);
  }, []);

  // Polling
  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const r = await fetch("/api/assignments", { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json() as { assignments: AssignmentLite[] };
        if (!alive) return;
        const delayed: ActiveDelay[] = [];
        for (const a of d.assignments ?? []) {
          if (a.status === "completed" || a.status === "cancelled") continue;
          if (!a.liveEtaIso || a.liveDurationHours == null) continue;
          const delayMin = Math.round((a.liveDurationHours - a.durationHours) * 60);
          if (delayMin >= DELAY_THRESHOLD_MIN) {
            delayed.push({
              assignmentId: a.id,
              label: `${a.driverName ?? "Driver"} · ${a.originLabel} → ${a.destLabel}`,
              delayMin,
              liveEtaIso: a.liveEtaIso,
            });
          }
        }
        setAlerts(delayed);
        // Push native notification at most every 5 min per assignment
        if (Notification && Notification.permission === "granted") {
          const now = Date.now();
          for (const al of delayed) {
            const last = lastNotifiedAt.current.get(al.assignmentId) ?? 0;
            if (now - last < 5 * 60_000) continue;
            lastNotifiedAt.current.set(al.assignmentId, now);
            new Notification(`${al.delayMin} min delay`, {
              body: al.label,
              tag:  al.assignmentId, // collapse repeated notifications for same run
            });
          }
          saveLastNotified(lastNotifiedAt.current);
        }
      } catch { /* network blip */ }
    }
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  async function requestPermission() {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPermission(p);
  }

  if (alerts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[360px] space-y-2">
      {alerts.map((a) => (
        <div key={a.assignmentId} className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 shadow-card-lg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-amber-800">
                {a.delayMin}-min delay
              </div>
              <button
                onClick={() => setAlerts((prev) => prev.filter((x) => x.assignmentId !== a.assignmentId))}
                className="ml-auto text-amber-700/70 hover:text-amber-900"
                title="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-0.5 truncate text-[13px] font-semibold text-ink-900">{a.label}</div>
            <div className="text-[11px] text-ink-600">
              ETA {new Date(a.liveEtaIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>
      ))}

      {permission === "default" && (
        <button
          onClick={requestPermission}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] font-semibold text-ink-700 shadow-card hover:bg-ink-50"
        >
          <Bell className="h-3.5 w-3.5" /> Enable browser notifications
        </button>
      )}
      {permission === "denied" && (
        <div className="flex items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-[11px] text-ink-500 shadow-card">
          <BellOff className="h-3 w-3" /> Browser notifications blocked
        </div>
      )}
    </div>
  );
}

// -------- localStorage helpers --------

const STORAGE_KEY = "overdrive.delay-alerts.lastNotified";

function loadLastNotified(): Map<string, number> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, number>;
    return new Map(Object.entries(obj));
  } catch { return new Map(); }
}

function saveLastNotified(m: Map<string, number>) {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, number> = {};
    m.forEach((v, k) => { obj[k] = v; });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch { /* quota exhausted, etc. */ }
}
