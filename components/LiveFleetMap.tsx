"use client";

import { useEffect, useState } from "react";
import { HereMap } from "@/components/HereMap";

interface FallbackMarker { id: string; lat: number; lon: number; label?: string }
interface LivePos {
  assignmentId: string;
  driverId: string;
  status: string;
  originLabel: string;
  destLabel: string;
  lat: number; lon: number;
  recordedAt: number;
}

/**
 * Wraps HereMap and overlays live truck positions for active assignments.
 * Polls /api/assignments/positions every 15s. Falls back to the dispatcher's
 * mock fleet markers when no live positions are yet streaming.
 */
export function LiveFleetMap({
  apiKey, fallbackMarkers, height = "480px",
}: {
  apiKey: string;
  fallbackMarkers: FallbackMarker[];
  height?: string;
}) {
  const [live, setLive] = useState<LivePos[]>([]);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const r = await fetch("/api/assignments/positions", { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json() as { positions: LivePos[] };
        if (alive) setLive(d.positions ?? []);
      } catch { /* network blip */ }
    }
    poll();
    const id = setInterval(poll, 15_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Live trucks override fallback for the same driver.
  const liveDriverIds = new Set(live.map((p) => p.driverId));
  const fallbackKept  = fallbackMarkers.filter((m) => !liveDriverIds.has(m.id));

  const markers = [
    ...fallbackKept,
    ...live.map((p) => ({
      id: `live-${p.assignmentId}`,
      lat: p.lat, lon: p.lon,
      label: `Live · ${p.originLabel} → ${p.destLabel}`,
    })),
  ];

  return (
    <HereMap apiKey={apiKey} markers={markers} height={height} />
  );
}
