"use client";

import { useEffect, useState } from "react";
import { Clock, MapPin, Navigation } from "lucide-react";
import { HereMap } from "@/components/HereMap";

interface TrackData {
  shipment: {
    origin: string; destination: string;
    originLat: number; originLon: number;
    destLat:   number; destLon:   number;
    polyline:  string;
    status:    string;
    plannedDistanceMiles: number;
    plannedDurationHours: number;
  };
  live: {
    position: { lat: number; lon: number; heading?: number; speedMps?: number; recordedAt: number } | null;
    eta:      { etaIso: string; distanceMiles: number; durationHours: number; updatedAt: number } | null;
  };
}

export function TrackingClient({ token, apiKey }: { token: string; apiKey: string }) {
  const [data, setData]   = useState<TrackData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const r = await fetch(`/api/track/${token}`, { cache: "no-store" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error ?? `Tracking unavailable (${r.status})`);
        return;
      }
      setData(await r.json());
    } catch {
      setError("Network error.");
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [token]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 text-center">
        <div>
          <div className="text-lg font-semibold text-ink-900">Tracking link unavailable</div>
          <div className="mt-1 text-sm text-ink-500">{error}</div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50">
        <div className="text-sm text-ink-500">Loading…</div>
      </div>
    );
  }

  const s = data.shipment;
  const live = data.live;

  // Decode etaIso to local time + delta vs. plan
  const etaMs = live.eta ? Date.parse(live.eta.etaIso) : null;
  const etaText = etaMs ? new Date(etaMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  const liveHours = live.eta?.durationHours ?? null;
  const delayHours = liveHours != null ? liveHours - s.plannedDurationHours : null;

  const markers = [
    { id: "o", lat: s.originLat, lon: s.originLon, label: "Pickup" },
    { id: "d", lat: s.destLat,   lon: s.destLon,   label: "Delivery" },
    ...(live.position ? [{ id: "t", lat: live.position.lat, lon: live.position.lon, label: "Truck" }] : []),
  ];
  const center = live.position
    ? { lat: live.position.lat, lon: live.position.lon }
    : { lat: (s.originLat + s.destLat) / 2, lon: (s.originLon + s.destLon) / 2 };

  return (
    <main data-no-shell className="min-h-screen bg-ink-50 p-0 m-0">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col">
        <header className="border-b border-ink-200 bg-white px-6 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">
            Shipment tracking
          </div>
          <h1 className="mt-1 text-xl font-bold text-ink-900">
            {s.origin} <span className="text-ink-400">→</span> {s.destination}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={s.status} />
            <Pill label={`Planned ${s.plannedDistanceMiles.toFixed(0)} mi`} />
            <Pill label={`Planned ${s.plannedDurationHours.toFixed(1)} h`} />
            {etaText && (
              <Pill
                label={`ETA ${etaText}`}
                tone={delayHours != null && delayHours > 0.25 ? "warn" : "good"}
              />
            )}
            {delayHours != null && Math.abs(delayHours) >= 0.1 && (
              <Pill
                label={delayHours > 0
                  ? `+${(delayHours * 60).toFixed(0)} min vs plan`
                  : `${(delayHours * 60).toFixed(0)} min vs plan`}
                tone={delayHours > 0 ? "warn" : "good"}
              />
            )}
          </div>
        </header>

        <div className="grid flex-1 gap-0 md:grid-cols-[1fr_320px]">
          <div className="bg-ink-100">
            <HereMap
              apiKey={apiKey}
              markers={markers}
              polyline={s.polyline}
              center={center}
              zoom={live.position ? 8 : 6}
              height="calc(100vh - 130px)"
            />
          </div>

          <aside className="space-y-3 border-l border-ink-200 bg-white px-5 py-4 text-sm">
            <Block icon={<MapPin />} title="Pickup" body={s.origin} />
            <Block icon={<MapPin />} title="Delivery" body={s.destination} />
            {live.position && (
              <Block
                icon={<Navigation />}
                title="Truck position"
                body={`${live.position.lat.toFixed(4)}, ${live.position.lon.toFixed(4)}`}
                sub={`updated ${formatRelative(live.position.recordedAt)}`}
              />
            )}
            {live.eta && etaText && (
              <Block
                icon={<Clock />}
                title="Live arrival"
                body={etaText}
                sub={`${live.eta.distanceMiles.toFixed(0)} mi · ${live.eta.durationHours.toFixed(1)} h remaining`}
              />
            )}
            <div className="pt-2 text-[11px] text-ink-400">
              Shared by carrier · refreshes every 15s
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: "good" | "info" | "warn" | "muted" }> = {
    assigned:    { label: "Assigned", tone: "info" },
    accepted:    { label: "En route", tone: "info" },
    in_progress: { label: "In transit", tone: "good" },
    completed:   { label: "Delivered", tone: "good" },
    cancelled:   { label: "Cancelled", tone: "warn" },
  };
  const m = map[status] ?? { label: status, tone: "muted" };
  const dot = m.tone === "good" ? "bg-emerald-500"
            : m.tone === "info" ? "bg-blue-500"
            : m.tone === "warn" ? "bg-amber-500"
            : "bg-ink-400";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-ink-700">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {m.label}
    </span>
  );
}

function Pill({ label, tone = "muted" }: { label: string; tone?: "good" | "warn" | "muted" }) {
  const dot = tone === "good" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-ink-400";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-ink-700">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function Block({ icon, title, body, sub }: {
  icon: React.ReactNode; title: string; body: string; sub?: string;
}) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/60 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">
        <span className="[&>svg]:h-3 [&>svg]:w-3">{icon}</span> {title}
      </div>
      <div className="mt-1 text-sm font-semibold text-ink-900">{body}</div>
      {sub && <div className="mt-0.5 text-[11px] text-ink-500">{sub}</div>}
    </div>
  );
}

function formatRelative(ts: number): string {
  const sec = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}
