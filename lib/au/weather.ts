/**
 * Live weather along a route (Open-Meteo, free, no key) and Bureau of
 * Meteorology public warnings per state (RSS, regex-parsed, no deps).
 */
import { decodeFlexiblePolyline } from "../polyline";

const UA = "LogisticMind/0.1 (demo)";
const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";

export interface WeatherSample {
  lat: number;
  lon: number;
  /** ISO time of the first forecast hour used (local Brisbane time, from the API). */
  time: string;
  /** Peak hourly precipitation (mm) over the next 12 hours. */
  precipitationMm: number;
  /** Peak wind gust (km/h) over the next 12 hours. */
  windGustKmh: number;
  /** Worst WMO weather code over the next 12 hours. */
  weatherCode: number;
  warnings: string[];
}

interface OpenMeteoResponse {
  hourly?: {
    time?: string[];
    precipitation?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
    weather_code?: (number | null)[];
  };
}

/** Picks `n` evenly spaced points along the polyline (always includes both ends). */
export function samplePoints(polyline: string, n: number): Array<{ lat: number; lon: number }> {
  const pts = decodeFlexiblePolyline(polyline);
  if (pts.length === 0) return [];
  const count = Math.max(1, Math.min(n, pts.length));
  if (count === 1) return [pts[0]];
  const out: Array<{ lat: number; lon: number }> = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i * (pts.length - 1)) / (count - 1));
    out.push(pts[idx]);
  }
  return out;
}

/** Derives warning flags from hourly series starting at index 0 ("now"). */
export function deriveWarnings(hourly: {
  precipitation: number[];
  windGusts: number[];
  weatherCode: number[];
}): { warnings: string[]; precipitationMm: number; windGustKmh: number; weatherCode: number } {
  const next12 = (arr: number[]) => arr.slice(0, 12);
  const warnings: string[] = [];

  const peakRain = Math.max(0, ...next12(hourly.precipitation));
  const total24 = hourly.precipitation.slice(0, 24).reduce((s, v) => s + v, 0);
  const peakGust = Math.max(0, ...next12(hourly.windGusts));
  const codes = next12(hourly.weatherCode);
  const worstCode = codes.length ? Math.max(...codes) : 0;

  if (peakRain >= 10) warnings.push("heavy_rain");
  if (total24 >= 50) warnings.push("flood_risk");
  if (peakGust >= 70) warnings.push("high_wind");
  if (codes.some((c) => c >= 95 && c <= 99)) warnings.push("severe");

  return { warnings, precipitationMm: peakRain, windGustKmh: peakGust, weatherCode: worstCode };
}

async function fetchPoint(p: { lat: number; lon: number }): Promise<WeatherSample | null> {
  const url =
    `${OPEN_METEO}?latitude=${p.lat.toFixed(4)}&longitude=${p.lon.toFixed(4)}` +
    `&hourly=precipitation,wind_gusts_10m,weather_code&forecast_days=2&timezone=Australia%2FBrisbane`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as OpenMeteoResponse;
    const h = data.hourly;
    if (!h?.time?.length) return null;

    // Open-Meteo returns the full day from 00:00 local; start at the current hour.
    const nowBris = new Date(Date.now() + 10 * 3600_000); // Brisbane is UTC+10, no DST
    const nowKey = nowBris.toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
    let start = h.time.findIndex((t) => t.slice(0, 13) >= nowKey);
    if (start < 0) start = 0;

    const num = (arr?: (number | null)[]) => (arr ?? []).slice(start).map((v) => v ?? 0);
    const d = deriveWarnings({
      precipitation: num(h.precipitation),
      windGusts: num(h.wind_gusts_10m),
      weatherCode: num(h.weather_code),
    });
    return { lat: p.lat, lon: p.lon, time: h.time[start], ...d };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Samples `samples` evenly spaced vertices along the polyline and fetches the
 * 48-hour hourly forecast for each. Points whose fetch fails are dropped.
 */
export async function weatherAlongPolyline(polyline: string, samples = 6): Promise<WeatherSample[]> {
  const pts = samplePoints(polyline, samples);
  const results = await Promise.all(pts.map(fetchPoint));
  return results.filter((r): r is WeatherSample => r !== null);
}

// ---------- BOM warnings RSS ----------

export type BomState = "QLD" | "NSW" | "NT" | "VIC" | "SA" | "WA" | "TAS";

/**
 * Product IDs verified against the BOM RSS index (www.bom.gov.au/rss/) on
 * 2026-10-15. Note: the index lists IDZ00056 for Queensland and IDZ00059 for
 * Victoria (an earlier internal note had QLD as IDZ00059; the live index wins).
 */
const BOM_FEEDS: Record<BomState, string> = {
  NSW: "https://www.bom.gov.au/fwo/IDZ00054.warnings_nsw.xml",
  NT:  "https://www.bom.gov.au/fwo/IDZ00055.warnings_nt.xml",
  QLD: "https://www.bom.gov.au/fwo/IDZ00056.warnings_qld.xml",
  SA:  "https://www.bom.gov.au/fwo/IDZ00057.warnings_sa.xml",
  TAS: "https://www.bom.gov.au/fwo/IDZ00058.warnings_tas.xml",
  VIC: "https://www.bom.gov.au/fwo/IDZ00059.warnings_vic.xml",
  WA:  "https://www.bom.gov.au/fwo/IDZ00060.warnings_wa.xml",
};

export interface BomWarning { title: string; link: string; issued: string }

function unescapeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? unescapeXml(m[1]) : "";
}

/** Small regex-based RSS 2.0 item parser. Exported for tests. */
export function parseRssItems(xml: string): BomWarning[] {
  const out: BomWarning[] = [];
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const title = tag(block, "title");
    if (!title) continue;
    out.push({ title, link: tag(block, "link"), issued: tag(block, "pubDate") || tag(block, "dc:date") });
  }
  return out;
}

/** Current BOM public warnings for a state. Returns [] on any failure. */
export async function bomWarnings(state: BomState): Promise<BomWarning[]> {
  const url = BOM_FEEDS[state];
  if (!url) return [];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctl.signal, cache: "no-store" });
    if (!res.ok) return [];
    return parseRssItems(await res.text());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
