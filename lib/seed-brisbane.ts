/**
 * Demo seed: a Brisbane-based small road freight fleet.
 *
 * Seeds 8 trucks, 6 customers, 20 loads over the next 72 hours on real
 * Queensland corridors, the 2026 diesel reference series and two baseline road
 * events. Seeding never calls HERE; run `warmRoutes` separately once a HERE key
 * is set to fill planned/current polylines.
 */
import { db } from "./db";
import { AU_DIESEL_REFERENCE, recordDieselPrice } from "./au/fuel-prices";
import { recordEvent } from "./au/road-events";
import {
  listLoads, listTrucks, setLoadRoute, upsertCustomer, upsertLoad, upsertTruck, withTransaction,
  type LoadInput,
} from "./domain/repo";
import type { LoadStatus, Truck, TruckStatus } from "./domain/types";
import { truckRoute, type TruckProfile } from "./here";

const H = 3_600_000;

// ------------------------------------------------------------- places (QLD)
const P = {
  depot:      { label: "Rocklea Depot, Brisbane QLD",            lat: -27.5465, lon: 153.0085 },
  townsville: { label: "Townsville QLD (Bohle industrial)",      lat: -19.2742, lon: 146.7308 },
  rocky:      { label: "Rockhampton QLD (Parkhurst)",            lat: -23.3100, lon: 150.5170 },
  toowoomba:  { label: "Toowoomba QLD (Torrington)",             lat: -27.5490, lon: 151.9050 },
  goldcoast:  { label: "Gold Coast QLD (Yatala)",                lat: -27.8640, lon: 153.2200 },
  mtisa:      { label: "Mount Isa QLD",                          lat: -20.7256, lon: 139.4927 },
  roma:       { label: "Roma QLD",                               lat: -26.5720, lon: 148.7870 },
  cairns:     { label: "Cairns QLD (Portsmith)",                 lat: -16.9400, lon: 145.7700 },
  mackay:     { label: "Mackay QLD (Paget)",                     lat: -21.1800, lon: 149.1700 },
  gympie:     { label: "Gympie QLD",                             lat: -26.1900, lon: 152.6650 },
} as const;

// Approximate corridor road distances (km) used only for due-time maths.
const KM: Record<string, number> = {
  "depot>townsville": 1350, "depot>rocky": 640, "depot>toowoomba": 125, "depot>goldcoast": 55,
  "depot>mtisa": 2250, "toowoomba>roma": 350, "townsville>cairns": 345, "rocky>mackay": 335,
  "depot>gympie": 170, "toowoomba>depot": 125, "townsville>depot": 1350,
};

/** Transit hours: 85 km/h average, 30 min rest per 5 h driving, 7 h sleep per 12 h driving. */
function transitHours(km: number): number {
  const drive = km / 85;
  const rests = Math.floor(drive / 5) * 0.5;
  const sleeps = Math.floor(drive / 12) * 7;
  return drive + rests + sleeps;
}

// ------------------------------------------------------------------ trucks
const BD = { heightM: 4.3, grossKg: 62500, axleCount: 9, tankLitres: 1200, litresPer100km: 48 };
const SEMI = { heightM: 4.3, grossKg: 42500, axleCount: 6, tankLitres: 800, litresPer100km: 38 };
const RIGID = { heightM: 4.0, grossKg: 22500, axleCount: 3, tankLitres: 400, litresPer100km: 28 };

interface TruckSeed {
  code: string; rego: string; driverName: string; status: TruckStatus; lat: number; lon: number; fuelPct: number;
  profile: typeof BD;
}

const TRUCKS: TruckSeed[] = [
  // Moving: placed on their load's corridor.
  { code: "BNE-01", rego: "123 ABC", driverName: "Mick Harrison",  status: "moving",   lat: -24.9890, lon: 151.9500, fuelPct: 62, profile: BD },   // Bruce Hwy, Gin Gin → Townsville
  { code: "BNE-02", rego: "456 DEF", driverName: "Sarah Nguyen",   status: "moving",   lat: -24.3300, lon: 151.5600, fuelPct: 55, profile: BD },   // Bruce Hwy, Miriam Vale → Rockhampton
  { code: "BNE-03", rego: "789 GHJ", driverName: "Daniel Kowalski",status: "moving",   lat: -27.5580, lon: 152.2750, fuelPct: 81, profile: SEMI }, // Warrego Hwy, Gatton → Toowoomba
  { code: "BNE-04", rego: "234 KLM", driverName: "Tom Rangi",      status: "moving",   lat: -20.0760, lon: 146.2600, fuelPct: 41, profile: BD },   // Flinders Hwy, Charters Towers → Mount Isa
  // Idle at Rocklea depot.
  { code: "BNE-05", rego: "567 NPQ", driverName: "Jess Taylor",    status: "idle",     lat: -27.5462, lon: 153.0090, fuelPct: 95, profile: BD },
  { code: "BNE-06", rego: "890 RST", driverName: "Ben O'Connor",   status: "idle",     lat: -27.5468, lon: 153.0082, fuelPct: 88, profile: SEMI },
  { code: "BNE-07", rego: "345 UVW", driverName: "Priya Sharma",   status: "idle",     lat: -27.5470, lon: 153.0095, fuelPct: 35, profile: RIGID },
  // Off duty: resting in Townsville between legs.
  { code: "BNE-08", rego: "678 XYZ", driverName: "Luke Donovan",   status: "off_duty", lat: -19.2742, lon: 146.7308, fuelPct: 70, profile: BD },
];

// --------------------------------------------------------------- customers
interface CustomerSeed {
  key: string; name: string; contactEmail: string; baseRatePerKm: number;
  levyMethod: "indexed" | "fixed" | "none"; levyBaseCpl: number | null; levyFuelShare: number;
  levyCurrentPct: number; levyNoticeDays: number; weeklyKm: number;
}

const CUSTOMERS: CustomerSeed[] = [
  { key: "grocery",  name: "Sunstate Grocery Wholesale",      contactEmail: "freight@sunstategrocery.example.com.au", baseRatePerKm: 3.10, levyMethod: "indexed", levyBaseCpl: 176.6, levyFuelShare: 0.32, levyCurrentPct: 14.5, levyNoticeDays: 7,  weeklyKm: 6000 },
  { key: "mining",   name: "Carpentaria Mining Supplies",     contactEmail: "logistics@carpentariamining.example.com.au", baseRatePerKm: 3.60, levyMethod: "indexed", levyBaseCpl: 185,   levyFuelShare: 0.35, levyCurrentPct: 12,   levyNoticeDays: 14, weeklyKm: 4500 },
  { key: "building", name: "Darling Downs Building Supplies", contactEmail: "despatch@ddbuilding.example.com.au",     baseRatePerKm: 2.60, levyMethod: "fixed",   levyBaseCpl: null,  levyFuelShare: 0.30, levyCurrentPct: 8,    levyNoticeDays: 30, weeklyKm: 2800 },
  { key: "pharmacy", name: "Northern Rivers Pharmacy Group",  contactEmail: "supply@nrpharmacy.example.com.au",       baseRatePerKm: 3.40, levyMethod: "indexed", levyBaseCpl: 170,   levyFuelShare: 0.28, levyCurrentPct: 15,   levyNoticeDays: 7,  weeklyKm: 2200 },
  { key: "produce",  name: "Lockyer Valley Produce Exports",  contactEmail: "transport@lockyerproduce.example.com.au", baseRatePerKm: 2.90, levyMethod: "indexed", levyBaseCpl: 176.6, levyFuelShare: 0.30, levyCurrentPct: 10,   levyNoticeDays: 7,  weeklyKm: 3800 }, // stale: under-recovered
  { key: "retail",   name: "Coastline Retail Group",          contactEmail: "dc@coastlineretail.example.com.au",     baseRatePerKm: 2.40, levyMethod: "none",    levyBaseCpl: null,  levyFuelShare: 0.30, levyCurrentPct: 0,    levyNoticeDays: 7,  weeklyKm: 5000 },
];

// ------------------------------------------------------------------- loads
type PlaceKey = keyof typeof P;
interface LoadSeed {
  ref: string; customer: string; truck: string | null; description: string;
  from: PlaceKey; to: PlaceKey; routeNote?: string;
  /** Pickup offset from now, in hours (negative = already departed). */
  pickupH: number; tonnes: number; valueAud: number;
  perishable?: boolean; essential?: boolean; status: LoadStatus; replanReason?: string;
}

const LOADS: LoadSeed[] = [
  // en_route on the four moving trucks
  { ref: "LM-1001", customer: "grocery",  truck: "BNE-01", description: "Dry grocery, 22 pallets", from: "depot", to: "townsville", pickupH: -5,  tonnes: 24, valueAud: 95000,  essential: true, status: "en_route" },
  { ref: "LM-1002", customer: "mining",   truck: "BNE-02", description: "Conveyor idlers and wear plate", from: "depot", to: "rocky", pickupH: -4, tonnes: 26, valueAud: 140000, status: "en_route" },
  { ref: "LM-1003", customer: "building", truck: "BNE-03", description: "Plasterboard and framing timber", from: "depot", to: "toowoomba", pickupH: -1, tonnes: 28, valueAud: 32000, status: "en_route" },
  { ref: "LM-1004", customer: "mining",   truck: "BNE-04", description: "Haul truck tyres and hydraulic spares", from: "depot", to: "mtisa", routeNote: "via Townsville and Flinders Hwy", pickupH: -30, tonnes: 30, valueAud: 180000, status: "en_route" },
  // en_route, just departed the depot on two further trucks
  { ref: "LM-1005", customer: "retail",   truck: "BNE-05", description: "Homewares, 18 pallets", from: "depot", to: "goldcoast", pickupH: -0.5, tonnes: 12, valueAud: 45000, status: "en_route" },
  { ref: "LM-1006", customer: "produce",  truck: "BNE-06", description: "Chilled lettuce and brassicas", from: "depot", to: "gympie", pickupH: -0.75, tonnes: 18, valueAud: 22000, perishable: true, status: "en_route" },
  // delayed
  { ref: "LM-1007", customer: "pharmacy", truck: "BNE-08", description: "Pharmaceuticals and chilled vaccines", from: "townsville", to: "cairns", pickupH: -3, tonnes: 8, valueAud: 160000, essential: true, status: "delayed", replanReason: "Bruce Hwy flood restriction near Ingham; driver on mandated rest in Townsville" },
  { ref: "LM-1008", customer: "mining",   truck: null,     description: "Drill rods and consumables", from: "rocky", to: "mackay", pickupH: -2, tonnes: 20, valueAud: 75000, status: "delayed", replanReason: "No truck available at Rockhampton; awaiting backload allocation" },
  // delivered
  { ref: "LM-1009", customer: "retail",   truck: "BNE-07", description: "Apparel cartons", from: "depot", to: "toowoomba", pickupH: -20, tonnes: 16, valueAud: 38000, status: "delivered" },
  { ref: "LM-1010", customer: "grocery",  truck: "BNE-05", description: "Ambient grocery, 20 pallets", from: "depot", to: "goldcoast", pickupH: -26, tonnes: 20, valueAud: 60000, status: "delivered" },
  // planned over the next 72 h
  { ref: "LM-1011", customer: "grocery",  truck: null,     description: "Mixed grocery for regional DC", from: "depot", to: "rocky", pickupH: 6,  tonnes: 24, valueAud: 88000, essential: true, status: "planned" },
  { ref: "LM-1012", customer: "produce",  truck: "BNE-03", description: "Return leg: packed vegetables for export", from: "toowoomba", to: "depot", pickupH: 8, tonnes: 20, valueAud: 35000, perishable: true, status: "planned" },
  { ref: "LM-1013", customer: "building", truck: null,     description: "Roofing iron and insulation", from: "toowoomba", to: "roma", pickupH: 14, tonnes: 28, valueAud: 26000, status: "planned" },
  { ref: "LM-1014", customer: "pharmacy", truck: null,     description: "Scheduled medicines, temperature controlled", from: "depot", to: "townsville", pickupH: 10, tonnes: 6, valueAud: 120000, essential: true, status: "planned" },
  { ref: "LM-1015", customer: "mining",   truck: null,     description: "Mill liners", from: "depot", to: "mtisa", routeNote: "via Roma and Longreach (Warrego/Landsborough Hwy)", pickupH: 20, tonnes: 28, valueAud: 150000, status: "planned" },
  { ref: "LM-1016", customer: "produce",  truck: "BNE-07", description: "Fresh herbs for airfreight", from: "depot", to: "goldcoast", pickupH: 4, tonnes: 14, valueAud: 18000, perishable: true, status: "planned" },
  { ref: "LM-1017", customer: "retail",   truck: null,     description: "Seasonal stock, 16 pallets", from: "depot", to: "gympie", pickupH: 28, tonnes: 15, valueAud: 30000, status: "planned" },
  { ref: "LM-1018", customer: "grocery",  truck: "BNE-01", description: "Return leg: empty crates and pallets", from: "townsville", to: "depot", pickupH: 36, tonnes: 10, valueAud: 12000, status: "planned" },
  { ref: "LM-1019", customer: "building", truck: null,     description: "Precast concrete panels", from: "depot", to: "rocky", pickupH: 44, tonnes: 30, valueAud: 28000, status: "planned" },
  { ref: "LM-1020", customer: "retail",   truck: null,     description: "Furniture flat-packs", from: "depot", to: "toowoomba", pickupH: 60, tonnes: 18, valueAud: 42000, status: "planned" },
];

// -------------------------------------------------------------------- seed

export interface SeedCounts { trucks: number; customers: number; loads: number; fuelPrices: number; events: number }

export function seedBrisbaneFleet(accountId: string, opts: { force?: boolean } = {}): SeedCounts {
  const existing = listTrucks(accountId).length;
  if (existing > 0 && !opts.force) {
    return {
      trucks: existing,
      customers: listCustomersCount(accountId),
      loads: listLoads(accountId).length,
      fuelPrices: countRows("fuel_prices", accountId),
      events: countRows("road_events", accountId),
    };
  }

  return withTransaction(() => {
    if (opts.force) {
      db.prepare("DELETE FROM actions WHERE account_id = ?").run(accountId);
      db.prepare("DELETE FROM agent_runs WHERE account_id = ?").run(accountId);
      db.prepare("DELETE FROM loads WHERE account_id = ?").run(accountId);
      db.prepare("DELETE FROM trucks WHERE account_id = ?").run(accountId);
      db.prepare("DELETE FROM customers WHERE account_id = ?").run(accountId);
      db.prepare("DELETE FROM fuel_prices WHERE account_id = ? AND source = 'seed'").run(accountId);
      db.prepare("DELETE FROM road_events WHERE account_id = ? AND source = 'seed'").run(accountId);
    }

    const truckIds = new Map<string, string>();
    for (const t of TRUCKS) {
      const row = upsertTruck({
        accountId, code: t.code, rego: t.rego, driverName: t.driverName, status: t.status,
        lat: t.lat, lon: t.lon, fuelPct: t.fuelPct, hazardous: false, ...t.profile,
      });
      truckIds.set(t.code, row.id);
    }

    const customerIds = new Map<string, string>();
    for (const c of CUSTOMERS) {
      const row = upsertCustomer({ accountId, ...c });
      customerIds.set(c.key, row.id);
    }

    const now = Date.now();
    for (const l of LOADS) {
      const from = P[l.from];
      const to = P[l.to];
      const km = KM[`${l.from}>${l.to}`] ?? 300;
      const pickupAt = now + l.pickupH * H;
      const dueAt = pickupAt + Math.round(transitHours(km) * 1.25 * H);
      const input: LoadInput = {
        accountId, customerId: customerIds.get(l.customer)!, truckId: l.truck ? truckIds.get(l.truck)! : null,
        ref: l.ref, description: l.routeNote ? `${l.description} (${l.routeNote})` : l.description,
        originLabel: from.label, originLat: from.lat, originLon: from.lon,
        destLabel: to.label, destLat: to.lat, destLon: to.lon,
        pickupAt, dueAt, tonnes: l.tonnes, valueAud: l.valueAud,
        perishable: !!l.perishable, essential: !!l.essential, status: l.status,
        replanReason: l.replanReason ?? null,
      };
      upsertLoad(input);
    }

    let fuelPrices = 0;
    for (const p of AU_DIESEL_REFERENCE) {
      recordDieselPrice({ accountId, region: "QLD", dieselCpl: p.cpl, source: "seed", capturedAt: Date.parse(`${p.date}T06:00:00+10:00`) });
      fuelPrices++;
    }

    recordEvent({
      accountId, source: "seed", kind: "flood", road: "Bruce Highway",
      title: "Bruce Hwy: flood restriction near Ingham",
      description: "Herbert River flooding; single lane under traffic control, heavy vehicles over 4.5 m held intermittently. Expect delays of 2 to 6 hours.",
      lat: -18.65, lon: 146.16, radiusKm: 15, severity: "moderate",
      startsAt: now - 18 * H, endsAt: now + 48 * H, active: true,
    });
    recordEvent({
      accountId, source: "seed", kind: "restriction", road: "Warrego Highway",
      title: "Warrego Hwy: planned roadworks near Gatton",
      description: "Pavement rehabilitation between Gatton and Helidon; 60 km/h and lane closures 7 pm to 5 am.",
      lat: -27.56, lon: 152.28, radiusKm: 8, severity: "minor",
      startsAt: now - 2 * 24 * H, endsAt: now + 10 * 24 * H, active: true,
    });

    return {
      trucks: TRUCKS.length,
      customers: CUSTOMERS.length,
      loads: LOADS.length,
      fuelPrices,
      events: 2,
    };
  });
}

function listCustomersCount(accountId: string): number { return countRows("customers", accountId); }
function countRows(table: "fuel_prices" | "road_events" | "customers", accountId: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE account_id = ?`).get(accountId) as { n: number }).n;
}

// ------------------------------------------------------------- warm routes

const DEFAULT_PROFILE: TruckProfile = { heightMeters: 4.3, weightKg: 62500, axleCount: 9, trailerCount: 2 };

function profileFor(truck: Truck | undefined): TruckProfile {
  if (!truck) return DEFAULT_PROFILE;
  return {
    heightMeters: truck.heightM, weightKg: truck.grossKg, axleCount: truck.axleCount,
    hazardous: truck.hazardous, trailerCount: truck.axleCount >= 9 ? 2 : truck.axleCount >= 6 ? 1 : 0,
  };
}

/**
 * Fill planned/current routes for loads that have none, one HERE call at a
 * time with a short pause. Never run automatically; call once the HERE key is set.
 */
export async function warmRoutes(
  accountId: string,
  opts: { max?: number } = {},
): Promise<{ routed: number; failed: number; errors: Array<{ ref: string; error: string }> }> {
  const trucks = new Map(listTrucks(accountId).map((t) => [t.id, t]));
  const pending = listLoads(accountId).filter((l) => !l.plannedPolyline).slice(0, opts.max ?? Infinity);
  let routed = 0;
  const errors: Array<{ ref: string; error: string }> = [];
  for (const load of pending) {
    try {
      const res = await truckRoute(
        { lat: load.originLat, lon: load.originLon },
        { lat: load.destLat, lon: load.destLon },
        profileFor(load.truckId ? trucks.get(load.truckId) : undefined),
      );
      const leg = {
        polyline: res.primary.polyline,
        km: res.primary.distanceMeters / 1000,
        hours: res.primary.durationSeconds / 3600,
      };
      setLoadRoute(load.id, { planned: leg, current: leg });
      routed++;
    } catch (e) {
      errors.push({ ref: load.ref, error: e instanceof Error ? e.message : String(e) });
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return { routed, failed: errors.length, errors };
}
