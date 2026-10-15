/** Client-safe labels, colours and small derivations shared by the fleet pages. */
import type { Load, LoadStatus, Truck, TruckStatus } from "@/lib/domain/types";
import type { PillTone } from "@/components/ui/primitives";

export const LOAD_STATUS_LABEL: Record<LoadStatus, string> = {
  en_route: "On the road", planned: "Booked", rerouted: "New route", held: "Waiting at the depot", delayed: "Running late", delivered: "Delivered", cancelled: "Cancelled",
};
export const LOAD_STATUS_TONE: Record<LoadStatus, PillTone> = {
  en_route: "info", planned: "neutral", rerouted: "success", held: "warning", delayed: "danger", delivered: "neutral", cancelled: "neutral",
};
export const LOAD_STATUS_COLOUR: Record<LoadStatus, string> = {
  en_route: "#2563EB", planned: "#8A8780", rerouted: "#178A6E", held: "#D97706", delayed: "#DC2626",
  delivered: "#CFC8BD", cancelled: "#CFC8BD",
};
export const IN_FLIGHT: LoadStatus[] = ["planned", "en_route", "delayed", "rerouted", "held"];

export const TRUCK_STATUS_LABEL: Record<TruckStatus, string> = {
  moving: "On the road", idle: "At the depot", off_duty: "Driver off duty", out_of_service: "Off the road for repairs",
};
export const TRUCK_STATUS_TONE: Record<TruckStatus, PillTone> = {
  moving: "info", idle: "success", off_duty: "neutral", out_of_service: "danger",
};

/** Same rule as lib/agents/capacity.ts hoursAvailableToday (kept client-side so the page needs no server import). */
export function hoursLeftToday(t: Truck): number {
  if (t.status === "out_of_service" || t.status === "off_duty") return 0;
  if (t.status === "moving") return 4;
  return 12;
}

export function truckType(grossKg: number): string {
  if (grossKg >= 60000) return "B-double";
  if (grossKg >= 40000) return "Semi-trailer";
  if (grossKg >= 20000) return "Heavy rigid";
  return "Rigid";
}

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371, d = Math.PI / 180;
  const dLat = (b.lat - a.lat) * d, dLon = (b.lon - a.lon) * d;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Short place name: "Townsville QLD (Bohle industrial)" → "Townsville". */
export function shortPlace(label: string): string {
  return label.split(" (")[0].replace(/,?\s+(QLD|NSW|VIC|SA|WA|NT|TAS|ACT)\b.*$/, "").replace(/\s+Depot$/, " depot");
}

/** "near Rockhampton (38 km)" from the closest load origin or destination. */
export function nearestPlace(t: { lat: number; lon: number }, loads: Load[]): string {
  let best: { label: string; km: number } | null = null;
  for (const l of loads) {
    for (const p of [{ label: l.originLabel, lat: l.originLat, lon: l.originLon }, { label: l.destLabel, lat: l.destLat, lon: l.destLon }]) {
      const km = haversineKm(t, p);
      if (!best || km < best.km) best = { label: shortPlace(p.label), km };
    }
  }
  if (!best) return `${t.lat.toFixed(2)}, ${t.lon.toFixed(2)}`;
  if (best.km < 5) return `at ${best.label}`;
  return `${Math.round(best.km)} km from ${best.label}`;
}
