// NOAA National Weather Service — free, no key required.
// Docs: https://www.weather.gov/documentation/services-web-api

const UA = "OverdriveNav/0.1 (ops@overdrive.app)"; // NWS requires a User-Agent

export interface WeatherSample {
  lat: number;
  lon: number;
  time: string;
  temperatureF?: number;
  windSpeedMph?: number;
  windGustMph?: number;
  windDirection?: string;
  precipChance?: number;
  shortForecast?: string;
  icon?: string;
  warnings: string[]; // derived: "high_wind", "ice", "snow", "severe"
}

async function nwsJSON(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/geo+json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`NWS ${res.status} ${url}`);
  return res.json();
}

// Parse "10 to 20 mph" or "30 mph" into a number (max value if range)
function parseMph(s?: string): number | undefined {
  if (!s) return undefined;
  const nums = s.match(/\d+/g);
  if (!nums) return undefined;
  return Math.max(...nums.map(Number));
}

export async function weatherAt(lat: number, lon: number, hoursAhead = 2): Promise<WeatherSample | null> {
  try {
    const pt = (await nwsJSON(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`)) as {
      properties?: { forecastHourly?: string };
    };
    const fUrl = pt?.properties?.forecastHourly;
    if (!fUrl) return null;
    const forecast = (await nwsJSON(fUrl)) as {
      properties?: { periods?: Array<{
        startTime: string;
        temperature?: number;
        temperatureUnit?: string;
        windSpeed?: string;
        windDirection?: string;
        probabilityOfPrecipitation?: { value?: number };
        shortForecast?: string;
        icon?: string;
      }> };
    };
    const periods = forecast.properties?.periods ?? [];
    const p = periods[Math.min(hoursAhead, periods.length - 1)] ?? periods[0];
    if (!p) return null;
    const wind = parseMph(p.windSpeed);
    const warnings: string[] = [];
    if (wind && wind >= 40) warnings.push("high_wind");
    if (p.shortForecast) {
      const t = p.shortForecast.toLowerCase();
      if (t.includes("ice") || t.includes("freezing")) warnings.push("ice");
      if (t.includes("snow") || t.includes("blizzard")) warnings.push("snow");
      if (t.includes("thunder") || t.includes("severe") || t.includes("tornado")) warnings.push("severe");
      if (t.includes("fog")) warnings.push("fog");
    }
    if ((p.probabilityOfPrecipitation?.value ?? 0) >= 70) warnings.push("heavy_rain");
    return {
      lat, lon,
      time: p.startTime,
      temperatureF: p.temperatureUnit === "F" ? p.temperature : undefined,
      windSpeedMph: wind,
      windDirection: p.windDirection,
      precipChance: p.probabilityOfPrecipitation?.value ?? undefined,
      shortForecast: p.shortForecast,
      icon: p.icon,
      warnings,
    };
  } catch {
    return null;
  }
}

// Sample N evenly-spaced points along a list of coordinates (from a decoded polyline)
// and fetch weather for each. Returns null entries where NWS is unreachable (e.g. outside US).
export async function weatherAlong(
  coords: Array<{ lat: number; lon: number }>,
  samples = 5,
  driveHours = 4,
): Promise<WeatherSample[]> {
  if (coords.length === 0) return [];
  const step = Math.max(1, Math.floor(coords.length / samples));
  const picks: Array<{ lat: number; lon: number; hoursAhead: number }> = [];
  for (let i = 0; i < samples; i++) {
    const idx = Math.min(coords.length - 1, i * step);
    picks.push({
      lat: coords[idx].lat,
      lon: coords[idx].lon,
      hoursAhead: Math.round((i / Math.max(1, samples - 1)) * driveHours),
    });
  }
  const results = await Promise.all(picks.map((p) => weatherAt(p.lat, p.lon, p.hoursAhead)));
  return results.filter((r): r is WeatherSample => r != null);
}
