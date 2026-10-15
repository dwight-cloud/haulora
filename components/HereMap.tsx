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
  /** Called once the map object exists (tiles may still be loading). */
  onReady?: () => void;
  /** Hide the style switcher and overlay toggles (small embedded maps). */
  minimal?: boolean;
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
  parking: { color: "#2563EB", letter: "P" },
  stop:    { color: "#B4471C", letter: "T" },
  rest:    { color: "#178A6E", letter: "R" },
  weigh:   { color: "#6B21A8", letter: "W" },
};

function poiMarkerIcon(H: any, kind: string) {
  const meta = POI_ICON[kind] ?? { color: "#1C1A17", letter: "?" };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="34" viewBox="0 0 28 34"><path d="M14 0C6.268 0 0 6.268 0 14c0 10 14 20 14 20s14-10 14-20C28 6.268 21.732 0 14 0z" fill="${meta.color}"/><circle cx="14" cy="14" r="8" fill="white"/><text x="14" y="18" font-family="sans-serif" font-size="11" font-weight="700" text-anchor="middle" fill="${meta.color}">${meta.letter}</text></svg>`;
  return new H.map.Icon(svg, { size: { w: 28, h: 34 }, anchor: { x: 14, y: 34 } });
}

/** Swallow the noisy Tangram warnings the HERE SDK prints on WebGL init. */
function quietConsole<T>(fn: () => T): T {
  const origErr = console.error;
  console.error = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && first.startsWith("Tangram")) return;
    origErr(...args);
  };
  try { return fn(); } finally { console.error = origErr; }
}

/**
 * HERE map wrapper.
 *
 * Lifecycle: the map object is created once per mount (and rebuilt only when
 * the API key, base style or truck-restriction overlay change). Everything
 * data-driven (markers, routes, alternates, isolines, incidents) lives in one
 * `H.map.Group` that is cleared and refilled when those props change, so a
 * polling page can refresh every few seconds without tearing the map down.
 */
export function HereMap({
  apiKey, center, zoom = 5, markers = [], polyline, alternates = [], routes = [], fitToRoutes = false, markerStyle = "pin", onSelectAlternate,
  isolines = [], incidents = [], height = "520px", onReady, minimal = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const trafficRef = useRef<any>(null);
  const dataGroupRef = useRef<any>(null);
  const poiGroupRef = useRef<any>(null);
  const onReadyRef = useRef(onReady);
  const onSelectAltRef = useRef(onSelectAlternate);
  onReadyRef.current = onReady;
  onSelectAltRef.current = onSelectAlternate;

  const [style, setStyle] = useState<MapStyle>("explore.day");
  const [showTraffic, setShowTraffic] = useState(false);
  const [showTruckRestr, setShowTruckRestr] = useState(false);
  const [showPois, setShowPois] = useState(false);
  const [pois, setPois] = useState<TruckPoi[]>([]);
  /** Bumped every time a fresh map object exists so data effects re-run. */
  const [mapGen, setMapGen] = useState(0);

  const initialView = useRef({ center, zoom });

  // Create the map once per mount; rebuild only for key / base style / restriction overlay.
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let onWinResize: (() => void) | null = null;

    ensureHere().then(() => {
      if (cancelled || !ref.current) return;
      const H = window.H;
      const c = initialView.current.center ?? { lat: -27.47, lon: 153.02 };

      if (mapRef.current) { try { mapRef.current.dispose(); } catch {} mapRef.current = null; }

      const features = showTruckRestr ? "vehicle_restrictions:active_and_inactive" : undefined;
      const baseLayer = buildRasterLayer(apiKey, style, features);

      const map = quietConsole(() => new H.Map(ref.current, baseLayer, {
        center: { lat: c.lat, lng: c.lon },
        zoom: initialView.current.zoom ?? 5,
        pixelRatio: window.devicePixelRatio || 1,
        // The unpinned 3.1 CDN build now defaults to the HARP engine, which
        // does not draw ImageTileProvider raster layers. Classic WebGL does.
        engineType: H.Map.EngineType.WEBGL,
      }));
      mapRef.current = map;
      new H.mapevents.Behavior(new H.mapevents.MapEvents(map));
      H.ui.UI.createDefault(map, { raster: { normal: { map: baseLayer } } } as any);

      const dataGroup = new H.map.Group();
      dataGroupRef.current = dataGroup;
      map.addObject(dataGroup);
      const poiGroup = new H.map.Group();
      poiGroupRef.current = poiGroup;
      map.addObject(poiGroup);
      trafficRef.current = null;

      const resize = () => { try { map.getViewPort().resize(); } catch { /* disposed */ } };
      onWinResize = resize;
      window.addEventListener("resize", resize);
      if (typeof ResizeObserver !== "undefined" && ref.current) {
        observer = new ResizeObserver(() => resize());
        observer.observe(ref.current);
      }

      onReadyRef.current?.();
      setMapGen((g) => g + 1);
    }).catch((e) => console.error("HERE map load error", e));

    return () => {
      cancelled = true;
      if (onWinResize) window.removeEventListener("resize", onWinResize);
      observer?.disconnect();
      dataGroupRef.current = null;
      poiGroupRef.current = null;
      trafficRef.current = null;
      if (mapRef.current) {
        try { mapRef.current.dispose(); } catch {}
        mapRef.current = null;
      }
    };
  }, [apiKey, style, showTruckRestr]);

  // Recentre only when the requested centre / zoom actually change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    const prev = initialView.current;
    if (prev.center?.lat === center.lat && prev.center?.lon === center.lon && prev.zoom === zoom) return;
    initialView.current = { center, zoom };
    try { map.setCenter({ lat: center.lat, lng: center.lon }); map.setZoom(zoom); } catch { /* disposed */ }
  }, [center?.lat, center?.lon, zoom, mapGen]);

  // Traffic overlay toggle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (showTraffic && !trafficRef.current) {
      trafficRef.current = buildTrafficLayer(apiKey);
      map.addLayer(trafficRef.current);
    } else if (!showTraffic && trafficRef.current) {
      try { map.removeLayer(trafficRef.current); } catch {}
      trafficRef.current = null;
    }
  }, [showTraffic, apiKey, mapGen]);

  // Data objects: clear the group and re-add on every prop change.
  const markersKey = JSON.stringify(markers);
  const altsKey = JSON.stringify(alternates);
  const routesKey = JSON.stringify(routes);
  const isoKey = JSON.stringify(isolines);
  const incKey = JSON.stringify(incidents);
  useEffect(() => {
    const H = window.H;
    const map = mapRef.current;
    const group = dataGroupRef.current;
    if (!H || !map || !group) return;
    try { group.removeAll(); } catch { return; }

    for (const m of markers) {
      if (markerStyle === "label" && m.label) {
        const text = String(m.label).replace(/[<>&]/g, "");
        const w = Math.max(34, text.length * 7 + 14);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="26" viewBox="0 0 ${w} 26"><rect x="1" y="1" width="${w - 2}" height="18" rx="4" fill="#1C1A17" stroke="white" stroke-width="1.5"/><path d="M${w / 2 - 4} 19 L${w / 2} 25 L${w / 2 + 4} 19 Z" fill="#1C1A17"/><text x="${w / 2}" y="13.5" font-family="system-ui,sans-serif" font-size="10" font-weight="700" text-anchor="middle" fill="white">${text}</text></svg>`;
        const icon = new H.map.Icon(svg, { size: { w, h: 26 }, anchor: { x: w / 2, y: 26 } });
        group.addObject(new H.map.Marker({ lat: m.lat, lng: m.lon }, { icon }));
      } else {
        group.addObject(new H.map.Marker({ lat: m.lat, lng: m.lon }));
      }
    }

    // Multi-route fleet view: every route in its own colour.
    let fleetBounds: any = null;
    for (const r of routes) {
      try {
        const line = H.geo.LineString.fromFlexiblePolyline(r.polyline);
        const poly = new H.map.Polyline(line, { style: { strokeColor: r.color ?? "#2563EB", lineWidth: r.width ?? 4 } });
        if (r.label) (poly as any).setData?.(r.label);
        group.addObject(poly);
        const bb = poly.getBoundingBox();
        fleetBounds = fleetBounds ? fleetBounds.mergeRect(bb) : bb;
      } catch (e) { console.error("route polyline decode failed", e); }
    }

    // Alternate polylines (rendered before the primary so it sits on top)
    alternates.forEach((alt, idx) => {
      try {
        const line = H.geo.LineString.fromFlexiblePolyline(alt.polyline);
        const poly = new H.map.Polyline(line, {
          style: { strokeColor: "rgba(28,26,23,0.45)", lineWidth: 5, lineDash: [2, 2] },
        });
        poly.addEventListener("tap", () => onSelectAltRef.current?.(idx));
        group.addObject(poly);
      } catch (e) { console.error("alt polyline decode failed", e); }
    });

    let primaryBounds: any = null;
    if (polyline) {
      try {
        const line = H.geo.LineString.fromFlexiblePolyline(polyline);
        const poly = new H.map.Polyline(line, { style: { strokeColor: "#2563EB", lineWidth: 6 } });
        group.addObject(poly);
        primaryBounds = poly.getBoundingBox();
      } catch (e) { console.error("polyline decode failed", e); }
    }

    // Isoline reachability rings (drive-time polygons), translucent so overlaps stack.
    const ISO_COLORS = ["rgba(23,138,110,0.22)", "rgba(245,158,11,0.22)", "rgba(239,68,68,0.22)"];
    isolines.forEach((iso, i) => {
      try {
        const ring = H.geo.LineString.fromFlexiblePolyline(iso.polyline);
        const pts: number[] = [];
        const reader = ring.getLatLngAltArray();
        for (let k = 0; k < reader.length; k += 3) pts.push(reader[k], reader[k + 1], 0);
        const poly = new H.map.Polygon(new H.geo.LineString(pts), {
          style: {
            fillColor: iso.color ?? ISO_COLORS[i % ISO_COLORS.length],
            strokeColor: (iso.color ?? ISO_COLORS[i % ISO_COLORS.length]).replace(/0\.22\)/, "0.6)"),
            lineWidth: 2,
          },
        });
        group.addObject(poly);
      } catch (e) { console.error("isoline decode failed", e); }
    });

    // Incident markers (coloured dots by severity)
    for (const inc of incidents) {
      const sev = Math.max(0, Math.min(3, inc.criticality));
      const color = ["#EAB308", "#F59E0B", "#EF4444", "#B91C1C"][sev] ?? "#EF4444";
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="${color}" stroke="white" stroke-width="2"/><text x="10" y="14" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle" fill="white">!</text></svg>`;
      const icon = new H.map.Icon(svg, { size: { w: 20, h: 20 }, anchor: { x: 10, y: 10 } });
      const m = new H.map.Marker({ lat: inc.lat, lng: inc.lon }, { icon });
      (m as any).setData?.(`<b>${inc.type}</b><br>${inc.description}`);
      group.addObject(m);
    }

    const target = primaryBounds ?? (fitToRoutes ? fleetBounds : null);
    if (target) {
      try { map.getViewModel().setLookAtData({ bounds: target }); } catch { /* not laid out yet */ }
    }
  }, [mapGen, markersKey, altsKey, routesKey, isoKey, incKey, polyline, fitToRoutes, markerStyle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch POIs near map centre when toggled on
  useEffect(() => {
    if (!showPois) { setPois([]); return; }
    const c = center ?? { lat: -27.47, lon: 153.02 };
    const ctrl = new AbortController();
    fetch(`/api/places/truck?lat=${c.lat}&lon=${c.lon}&kinds=parking,stop,rest,weigh&limit=40`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setPois(d.items ?? []))
      .catch(() => {});
    return () => ctrl.abort();
  }, [showPois, center?.lat, center?.lon]);

  // Render POIs into their group
  useEffect(() => {
    const H = window.H;
    const group = poiGroupRef.current;
    if (!H || !group) return;
    try { group.removeAll(); } catch { return; }
    for (const p of pois) {
      const kind = p.ontology ?? "stop";
      const icon = poiMarkerIcon(H, kind);
      const marker = new H.map.Marker({ lat: p.position.lat, lng: p.position.lon }, { icon });
      (marker as any).setData?.(`<b>${p.title}</b><br>${p.address}`);
      group.addObject(marker);
    }
  }, [pois, mapGen]);

  return (
    <div className="relative">
      <div ref={ref} style={{ width: "100%", height }} className="overflow-hidden rounded-xl bg-bitumen-100" role="region" aria-label="Map" />

      {!minimal && (
        <>
          {/* Base style switcher */}
          <div className="absolute top-3 right-3 flex flex-col gap-1 rounded-lg bg-white/95 p-1 shadow-md ring-1 ring-black/5 backdrop-blur">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStyle(s.id)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                  style === s.id ? "bg-bitumen-900 text-white" : "text-bitumen-900 hover:bg-bitumen-100"
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
            <Toggle active={showPois}        onClick={() => setShowPois((v) => !v)}       label="Truck stops & parking" color="#2563EB" />
          </div>

          {/* POI legend */}
          {showPois && (
            <div className="absolute bottom-3 left-3 flex gap-3 rounded-lg bg-white/95 px-3 py-2 text-xs shadow-md ring-1 ring-black/5 backdrop-blur">
              <Legend dot="#2563EB" label="Parking" />
              <Legend dot="#B4471C" label="Truck stop" />
              <Legend dot="#178A6E" label="Rest area" />
              <Legend dot="#6B21A8" label="Weigh station" />
            </div>
          )}
        </>
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
        active ? "bg-bitumen-900 text-white" : "text-bitumen-900 hover:bg-bitumen-100"
      }`}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: active ? "white" : color }} />
      {label}
    </button>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-bitumen-700">
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      {label}
    </span>
  );
}
