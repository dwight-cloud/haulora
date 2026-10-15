"use client";

import { useEffect, useRef, useState } from "react";

interface Marker { id: string; lat: number; lon: number; label?: string }
interface AltRoute { polyline: string; label?: string }
interface RouteLine { polyline: string; color?: string; label?: string; width?: number }
interface IsolineRing { polyline: string; label?: string; color?: string }
interface IncidentPoint { lat: number; lon: number; type: string; description: string; criticality: number }

type MapStyle = "explore.day" | "explore.night" | "satellite.day" | "topo.day";

interface Props {
  apiKey: string;
  center?: { lat: number; lon: number };
  zoom?: number;
  markers?: Marker[];
  polyline?: string;
  alternates?: AltRoute[];
  /** Any number of coloured routes drawn together (fleet view). Does not re-fit the viewport. */
  routes?: RouteLine[];
  /** "label" draws each marker as a small tag with its label text (truck codes). */
  markerStyle?: "pin" | "label";
  /** Fit the viewport to all routes/markers on load (default: only when `polyline` is set). */
  fitToRoutes?: boolean;
  onSelectAlternate?: (index: number) => void;
  isolines?: IsolineRing[];
  incidents?: IncidentPoint[];
  height?: string;
}

declare global { interface Window { H: any; __hereLoader?: Promise<void> } }

const CDN = "https://js.api.here.com/v3/3.1";

function loadOne(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-here="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "1") { resolve(); return; }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(src)));
      return;
    }
    const s = document.createElement("script");
    s.src = src; s.async = false; s.dataset.here = src;
    s.onload = () => { s.dataset.loaded = "1"; resolve(); };
    s.onerror = () => reject(new Error(src));
    document.head.appendChild(s);
  });
}

function ensureHere(): Promise<void> {
  if (!window.__hereLoader) {
    window.__hereLoader = (async () => {
      if (!document.querySelector("link[data-here-css]")) {
        const l = document.createElement("link");
        l.rel = "stylesheet"; l.href = `${CDN}/mapsjs-ui.css`; l.dataset.hereCss = "1";
        document.head.appendChild(l);
      }
      await loadOne(`${CDN}/mapsjs-core.js`);
      await loadOne(`${CDN}/mapsjs-service.js`);
      await loadOne(`${CDN}/mapsjs-mapevents.js`);
      await loadOne(`${CDN}/mapsjs-ui.js`);
      const start = Date.now();
      while (!(window.H && window.H.service && window.H.mapevents && window.H.ui)) {
        if (Date.now() - start > 10000) throw new Error("HERE SDK failed to initialize");
        await new Promise((r) => setTimeout(r, 30));
      }
    })();
  }
  return window.__hereLoader;
}

function baseTileUrl(style: string, apiKey: string, features?: string) {
  const f = features ? `&features=${features}` : "";
  return (z: number, x: number, y: number) =>
    `https://maps.hereapi.com/v3/base/mc/${z}/${x}/${y}/png8?style=${style}&size=512&ppi=400${f}&apikey=${apiKey}`;
}

function buildRasterLayer(apiKey: string, style: MapStyle, features?: string) {
  const H = window.H;
  const effectiveStyle: string = features ? "lite.day" : style;
  const getURL = baseTileUrl(effectiveStyle, apiKey, features);
  const provider = new H.map.provider.ImageTileProvider({
    getURL: (col: number, row: number, level: number) => getURL(level, col, row),
    tileSize: 512,
    max: 20,
  });
  return new H.map.layer.TileLayer(provider);
}

function buildTrafficLayer(apiKey: string) {
  const H = window.H;
  const provider = new H.map.provider.ImageTileProvider({
    getURL: (col: number, row: number, level: number) =>
      `https://traffic.maps.hereapi.com/v3/flow/mc/${level}/${col}/${row}/png8?size=512&ppi=400&apikey=${apiKey}`,
    tileSize: 512,
    max: 18,
    opacity: 0.9,
  });
  return new H.map.layer.TileLayer(provider);
}

const STYLES: { id: MapStyle; label: string }[] = [
  { id: "explore.day",    label: "Map" },
  { id: "satellite.day",  label: "Satellite" },
  { id: "topo.day",       label: "Terrain" },
  { id: "explore.night",  label: "Dark" },
];

interface TruckPoi {
  title: string;
  address: string;
  position: { lat: number; lon: number };
  ontology?: string;
}

const POI_ICON: Record<string, { color: string; letter: string }> = {
  parking: { color: "#1F8BFF", letter: "P" },
  stop:    { color: "#FF6B1A", letter: "T" },
  rest:    { color: "#10B981", letter: "R" },
  weigh:   { color: "#6B21A8", letter: "W" },
};

function poiMarkerIcon(H: any, kind: string) {
  const meta = POI_ICON[kind] ?? { color: "#0B1E3F", letter: "?" };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="34" viewBox="0 0 28 34"><path d="M14 0C6.268 0 0 6.268 0 14c0 10 14 20 14 20s14-10 14-20C28 6.268 21.732 0 14 0z" fill="${meta.color}"/><circle cx="14" cy="14" r="8" fill="white"/><text x="14" y="18" font-family="sans-serif" font-size="11" font-weight="700" text-anchor="middle" fill="${meta.color}">${meta.letter}</text></svg>`;
  return new H.map.Icon(svg, { size: { w: 28, h: 34 }, anchor: { x: 14, y: 34 } });
}

export function HereMap({
  apiKey, center, zoom = 5, markers = [], polyline, alternates = [], routes = [], fitToRoutes = false, markerStyle = "pin", onSelectAlternate,
  isolines = [], incidents = [], height = "520px",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const baseRef = useRef<any>(null);
  const trafficRef = useRef<any>(null);
  const poiGroupRef = useRef<any>(null);

  const [style, setStyle] = useState<MapStyle>("explore.day");
  const [showTraffic, setShowTraffic] = useState(false);
  const [showTruckRestr, setShowTruckRestr] = useState(false);
  const [showPois, setShowPois] = useState(false);
  const [pois, setPois] = useState<TruckPoi[]>([]);

  // Init / rebuild map when base style or truck-restrictions toggle changes
  useEffect(() => {
    let cancelled = false;
    let resize: (() => void) | null = null;
    const origErr = console.error;
    console.error = (...args: unknown[]) => {
      const first = args[0];
      if (typeof first === "string" && first.startsWith("Tangram")) return;
      origErr(...args);
    };

    ensureHere().then(() => {
      if (cancelled || !ref.current) return;
      const H = window.H;
      const c = center ?? { lat: 39.5, lon: -98.35 };

      if (mapRef.current) { try { mapRef.current.dispose(); } catch {} mapRef.current = null; }

      const features = showTruckRestr ? "vehicle_restrictions:active_and_inactive" : undefined;
      const baseLayer = buildRasterLayer(apiKey, style, features);
      baseRef.current = baseLayer;

      const map = new H.Map(ref.current, baseLayer, {
        center: { lat: c.lat, lng: c.lon },
        zoom,
        pixelRatio: window.devicePixelRatio || 1,
      });
      mapRef.current = map;
      new H.mapevents.Behavior(new H.mapevents.MapEvents(map));
      H.ui.UI.createDefault(map, { raster: { normal: { map: baseLayer } } } as any);

      if (showTraffic) {
        trafficRef.current = buildTrafficLayer(apiKey);
        map.addLayer(trafficRef.current);
      }

      for (const m of markers) {
        if (markerStyle === "label" && m.label) {
          const text = String(m.label).replace(/[<>&]/g, "");
          const w = Math.max(34, text.length * 7 + 14);
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="26" viewBox="0 0 ${w} 26"><rect x="1" y="1" width="${w - 2}" height="18" rx="4" fill="#0F172A" stroke="white" stroke-width="1.5"/><path d="M${w / 2 - 4} 19 L${w / 2} 25 L${w / 2 + 4} 19 Z" fill="#0F172A"/><text x="${w / 2}" y="13.5" font-family="system-ui,sans-serif" font-size="10" font-weight="700" text-anchor="middle" fill="white">${text}</text></svg>`;
          const icon = new H.map.Icon(svg, { size: { w, h: 26 }, anchor: { x: w / 2, y: 26 } });
          map.addObject(new H.map.Marker({ lat: m.lat, lng: m.lon }, { icon }));
        } else {
          map.addObject(new H.map.Marker({ lat: m.lat, lng: m.lon }));
        }
      }

      // Multi-route fleet view: every route in its own colour.
      let fleetBounds: any = null;
      for (const r of routes) {
        try {
          const line = H.geo.LineString.fromFlexiblePolyline(r.polyline);
          const poly = new H.map.Polyline(line, { style: { strokeColor: r.color ?? "#1F8BFF", lineWidth: r.width ?? 4 } });
          if (r.label) (poly as any).setData?.(r.label);
          map.addObject(poly);
          const bb = poly.getBoundingBox();
          fleetBounds = fleetBounds ? fleetBounds.mergeRect(bb) : bb;
        } catch (e) { origErr("route polyline decode failed", e); }
      }
      if (fitToRoutes && fleetBounds) map.getViewModel().setLookAtData({ bounds: fleetBounds });

      // Alternate polylines (rendered first so primary is on top)
      alternates.forEach((alt, idx) => {
        try {
          const line = H.geo.LineString.fromFlexiblePolyline(alt.polyline);
          const poly = new H.map.Polyline(line, {
            style: { strokeColor: "rgba(11,30,63,0.45)", lineWidth: 5, lineDash: [2, 2] },
          });
          (poly as any).__altIndex = idx;
          poly.addEventListener("tap", () => onSelectAlternate?.(idx));
          map.addObject(poly);
        } catch (e) { origErr("alt polyline decode failed", e); }
      });

      if (polyline) {
        try {
          const line = H.geo.LineString.fromFlexiblePolyline(polyline);
          const poly = new H.map.Polyline(line, { style: { strokeColor: "#1F8BFF", lineWidth: 6 } });
          map.addObject(poly);
          map.getViewModel().setLookAtData({ bounds: poly.getBoundingBox() });
        } catch (e) { origErr("polyline decode failed", e); }
      }

      // Isoline reachability rings (drive-time polygons). Drawn as translucent
      // filled polygons so overlapping rings stack in darker bands.
      const ISO_COLORS = ["rgba(16,185,129,0.22)", "rgba(245,158,11,0.22)", "rgba(239,68,68,0.22)"];
      isolines.forEach((iso, i) => {
        try {
          const ring = H.geo.LineString.fromFlexiblePolyline(iso.polyline);
          const pts: any[] = [];
          const reader = ring.getLatLngAltArray();
          for (let k = 0; k < reader.length; k += 3) pts.push({ lat: reader[k], lng: reader[k + 1] });
          const poly = new H.map.Polygon(
            new H.geo.LineString(pts.flatMap((p) => [p.lat, p.lng, 0])),
            {
              style: {
                fillColor: iso.color ?? ISO_COLORS[i % ISO_COLORS.length],
                strokeColor: (iso.color ?? ISO_COLORS[i % ISO_COLORS.length]).replace(/0\.22\)/, "0.6)"),
                lineWidth: 2,
              },
            }
          );
          map.addObject(poly);
        } catch (e) { origErr("isoline decode failed", e); }
      });

      // Traffic-incident markers (small red dots; tap for description)
      const incidentGroup = new H.map.Group();
      for (const inc of incidents) {
        const sev = Math.max(0, Math.min(3, inc.criticality));
        const color = ["#EAB308", "#F59E0B", "#EF4444", "#B91C1C"][sev] ?? "#EF4444";
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="${color}" stroke="white" stroke-width="2"/><text x="10" y="14" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle" fill="white">!</text></svg>`;
        const icon = new H.map.Icon(svg, { size: { w: 20, h: 20 }, anchor: { x: 10, y: 10 } });
        const m = new H.map.Marker({ lat: inc.lat, lng: inc.lon }, { icon });
        (m as any).setData?.(`<b>${inc.type}</b><br>${inc.description}`);
        incidentGroup.addObject(m);
      }
      map.addObject(incidentGroup);

      // POI group (re-populated in its own effect)
      const poiGroup = new H.map.Group();
      poiGroupRef.current = poiGroup;
      map.addObject(poiGroup);

      resize = () => map.getViewPort().resize();
      window.addEventListener("resize", resize);
    }).catch((e) => origErr("HERE map load error", e));

    return () => {
      cancelled = true;
      console.error = origErr;
      if (resize) window.removeEventListener("resize", resize);
      if (mapRef.current) {
        try { mapRef.current.dispose(); } catch {}
        mapRef.current = null;
      }
    };
  }, [apiKey, center?.lat, center?.lon, zoom, JSON.stringify(markers), polyline, JSON.stringify(alternates), JSON.stringify(routes), fitToRoutes, markerStyle, JSON.stringify(isolines), JSON.stringify(incidents), style, showTraffic, showTruckRestr]);

  // Fetch POIs near map center when toggled on
  useEffect(() => {
    if (!showPois) { setPois([]); return; }
    const c = center ?? { lat: 39.5, lon: -98.35 };
    const ctrl = new AbortController();
    fetch(`/api/places/truck?lat=${c.lat}&lon=${c.lon}&kinds=parking,stop,rest,weigh&limit=40`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setPois(d.items ?? []))
      .catch(() => {});
    return () => ctrl.abort();
  }, [showPois, center?.lat, center?.lon]);

  // Render POIs into the group
  useEffect(() => {
    const H = window.H;
    const group = poiGroupRef.current;
    if (!H || !group) return;
    group.removeAll();
    for (const p of pois) {
      const kind = p.ontology ?? "stop";
      const icon = poiMarkerIcon(H, kind);
      const marker = new H.map.Marker({ lat: p.position.lat, lng: p.position.lon }, { icon });
      (marker as any).setData?.(`<b>${p.title}</b><br>${p.address}`);
      group.addObject(marker);
    }
  }, [pois]);

  return (
    <div className="relative">
      <div ref={ref} style={{ width: "100%", height }} className="overflow-hidden rounded-xl bg-ink-100" />

      {/* Base style switcher */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 rounded-lg bg-white/95 p-1 shadow-md ring-1 ring-black/5 backdrop-blur">
        {STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStyle(s.id)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              style === s.id ? "bg-ink-900 text-white" : "text-ink-900 hover:bg-ink-100"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Overlay toggles */}
      <div className="absolute top-3 left-3 flex flex-col gap-1 rounded-lg bg-white/95 p-1 shadow-md ring-1 ring-black/5 backdrop-blur">
        <Toggle active={showTraffic}     onClick={() => setShowTraffic((v) => !v)}    label="Traffic" color="#E11D48" />
        <Toggle active={showTruckRestr}  onClick={() => setShowTruckRestr((v) => !v)} label="Truck restrictions" color="#B45309" />
        <Toggle active={showPois}        onClick={() => setShowPois((v) => !v)}       label="Truck stops & parking" color="#1F8BFF" />
      </div>

      {/* POI legend */}
      {showPois && (
        <div className="absolute bottom-3 left-3 flex gap-3 rounded-lg bg-white/95 px-3 py-2 text-xs shadow-md ring-1 ring-black/5 backdrop-blur">
          <Legend dot="#1F8BFF" label="Parking" />
          <Legend dot="#FF6B1A" label="Truck stop" />
          <Legend dot="#10B981" label="Rest area" />
          <Legend dot="#6B21A8" label="Weigh station" />
        </div>
      )}
    </div>
  );
}

function Toggle({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded px-2.5 py-1 text-xs font-medium transition ${
        active ? "bg-ink-900 text-white" : "text-ink-900 hover:bg-ink-100"
      }`}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: active ? "white" : color }} />
      {label}
    </button>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-ink-700">
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      {label}
    </span>
  );
}
