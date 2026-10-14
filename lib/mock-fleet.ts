export interface Truck {
  id: string;
  name: string;
  driver: string;
  status: "moving" | "idle" | "off-duty";
  lat: number;
  lon: number;
  speedMph: number;
  fuelPct: number;
  hosRemainingHours: number;
  etaIso: string;
  origin: string;
  destination: string;
  heightMeters: number;
  weightKg: number;
  axleCount: number;
  hazardous: boolean;
}

export const mockFleet: Truck[] = [
  { id: "T-1042", name: "Unit 1042", driver: "R. Alvarez",  status: "moving",   lat: 32.7767, lon: -96.7970, speedMph: 62, fuelPct: 78, hosRemainingHours: 6.5,  etaIso: "2026-04-15T19:10:00Z", origin: "Dallas, TX",        destination: "Houston, TX",         heightMeters: 4.11, weightKg: 36000, axleCount: 5, hazardous: false },
  { id: "T-1088", name: "Unit 1088", driver: "J. Okafor",   status: "moving",   lat: 34.0522, lon: -118.2437, speedMph: 55, fuelPct: 42, hosRemainingHours: 3.0,  etaIso: "2026-04-15T22:45:00Z", origin: "Los Angeles, CA",   destination: "Phoenix, AZ",         heightMeters: 4.25, weightKg: 40000, axleCount: 6, hazardous: true  },
  { id: "T-1133", name: "Unit 1133", driver: "M. Singh",    status: "idle",     lat: 41.8781, lon: -87.6298,  speedMph: 0,  fuelPct: 88, hosRemainingHours: 10.0, etaIso: "2026-04-16T04:30:00Z", origin: "Chicago, IL",       destination: "Detroit, MI",         heightMeters: 4.11, weightKg: 32000, axleCount: 5, hazardous: false },
  { id: "T-1209", name: "Unit 1209", driver: "C. Nguyen",   status: "moving",   lat: 39.7392, lon: -104.9903, speedMph: 48, fuelPct: 61, hosRemainingHours: 5.2,  etaIso: "2026-04-15T23:00:00Z", origin: "Denver, CO",        destination: "Salt Lake City, UT",  heightMeters: 4.11, weightKg: 36000, axleCount: 5, hazardous: false },
  { id: "T-1301", name: "Unit 1301", driver: "T. Bellamy",  status: "off-duty", lat: 33.4484, lon: -112.0740, speedMph: 0,  fuelPct: 100, hosRemainingHours: 0,   etaIso: "2026-04-16T08:00:00Z", origin: "Phoenix, AZ",       destination: "Las Vegas, NV",       heightMeters: 4.30, weightKg: 42000, axleCount: 6, hazardous: false },
];
