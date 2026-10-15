/**
 * Deterministic generator for evals/fuel_levy_cases.json.
 *
 * Run: npx tsx evals/generate_fuel_cases.ts
 *
 * Produces 50 golden cases for the fuel AGENT. Expected values are computed
 * with the same functions as lib/au/fuel-levy.ts so they are internally
 * consistent. No Math.random: a fixed-seed mulberry32 PRNG drives variation,
 * and category counts are fixed by construction.
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeLevyPct, levyDelta, type LevyMethod } from "../lib/au/fuel-levy";

// ---- seeded PRNG ----
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261015);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const between = (lo: number, hi: number, step: number): number =>
  Math.round((lo + rand() * (hi - lo)) / step) * step;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

const NAMES = [
  "Darling Downs Grain", "Moreton Bay Cold Chain", "Gladstone Steel Supplies", "Lockyer Valley Produce",
  "Toowoomba Building Co", "Sunshine Coast Beverages", "Mackay Sugar Haulage", "Ipswich Pallet Freight",
  "Wide Bay Timber", "Gold Coast Retail Group", "Roma Livestock Transport", "Townsville Mining Services",
  "Bundaberg Fresh", "Cairns Pharma Distribution", "Rockhampton Beef Exports", "Logan Furniture Depot",
  "Warwick Feed Mills", "Hervey Bay Marine", "Emerald Agri Supplies", "Noosa Food Services",
];
const REGIONS = ["QLD", "Brisbane", "Townsville", "Toowoomba", "Rockhampton"];
const DATES = ["2026-10-08", "2026-10-09", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"];

type Kind = "rise" | "no_change" | "price_fall" | "none" | "fixed" | "malformed";

interface CustomerInput {
  name: string;
  baseRatePerKm: number;
  levyMethod: LevyMethod;
  levyBaseCpl: number | null;
  levyFuelShare: number;
  levyCurrentPct: number;
  weeklyKm: number;
  levyNoticeDays: number;
}
interface CaseInput {
  customer: CustomerInput;
  currentCpl: number;
  previousCpl: number;
  region: string;
  todayIso: string;
}
interface Expected {
  levyPct?: number;
  shouldPropose?: boolean;
  riskLevel?: "low" | "medium" | "high";
  noticeRequired?: boolean;
  error?: boolean;
  notes: string;
}
interface Case { id: string; kind: Kind; input: CaseInput; expected: Expected }

function baseCustomer(method: LevyMethod, name: string): CustomerInput {
  return {
    name,
    baseRatePerKm: r2(between(1.8, 4.2, 0.05)),
    levyMethod: method,
    levyBaseCpl: r1(between(160, 200, 0.5)),
    levyFuelShare: r2(between(0.25, 0.4, 0.01)),
    levyCurrentPct: 0,
    weeklyKm: between(500, 12000, 50),
    levyNoticeDays: pick([7, 7, 7, 14, 14, 30]),
  };
}

function indexedPct(c: CustomerInput, currentCpl: number): number {
  return computeLevyPct({
    currentCpl, baseCpl: c.levyBaseCpl as number, fuelShare: c.levyFuelShare, method: "indexed",
  });
}

function riskFor(c: CustomerInput, newPct: number): Expected["riskLevel"] {
  const d = Math.abs(levyDelta({ customer: c, newLevyPct: newPct }).weeklyRevenueDeltaAud);
  return d < 500 ? "low" : d < 3000 ? "medium" : "high";
}

function expectedFor(c: CustomerInput, currentCpl: number, notes: string): Expected {
  const levyPct =
    c.levyMethod === "indexed" ? indexedPct(c, currentCpl)
    : c.levyMethod === "fixed" ? computeLevyPct({ currentCpl, baseCpl: c.levyBaseCpl ?? 0, fuelShare: c.levyFuelShare, method: "fixed", fixedPct: c.levyCurrentPct })
    : 0;
  const shouldPropose = Math.abs(levyPct - c.levyCurrentPct) >= 0.5;
  return {
    levyPct,
    shouldPropose,
    riskLevel: riskFor(c, levyPct),
    noticeRequired: shouldPropose && c.levyMethod === "indexed",
    notes,
  };
}

const cases: Case[] = [];
let n = 0;
function push(kind: Kind, input: CaseInput, expected: Expected) {
  n += 1;
  cases.push({ id: `fuel-${String(n).padStart(3, "0")}`, kind, input, expected });
}

// 29 general indexed cases: current price above base, stale current levy.
for (let i = 0; i < 29; i++) {
  const c = baseCustomer("indexed", NAMES[i % NAMES.length]);
  let currentCpl = r1(between(170, 330, 0.1));
  let lag = pick([0, 0.3, 0.8, 1.5, 3, 5, 8, 12, 18, 25]);
  if (i >= 27) {
    // Two deliberately large, stale accounts at peak-ish diesel so the "high"
    // risk band is exercised.
    currentCpl = i === 27 ? 322 : 305.4;
    lag = 20;
    c.weeklyKm = 11000 + i * 250;
    c.baseRatePerKm = 3.9;
  }
  const truePct = indexedPct(c, currentCpl);
  // Current levy lags the index by a varied amount (sometimes already close).
  c.levyCurrentPct = r2(Math.max(0, truePct - lag));
  const previousCpl = r1(currentCpl - between(2, 25, 0.1));
  push("rise", { customer: c, currentCpl, previousCpl, region: pick(REGIONS), todayIso: pick(DATES) },
    expectedFor(c, currentCpl, `Indexed levy; diesel ${previousCpl} -> ${currentCpl} c/L; current levy ${c.levyCurrentPct}% vs indexed ${truePct}%.`));
}

// 8 no-change cases: current levy already matches the index within 0.5 pp.
for (let i = 0; i < 8; i++) {
  const c = baseCustomer("indexed", NAMES[(i + 7) % NAMES.length]);
  const currentCpl = r1(between(180, 320, 0.1));
  const truePct = indexedPct(c, currentCpl);
  const jitter = pick([0, 0.1, -0.2, 0.3, -0.4, 0.45]);
  c.levyCurrentPct = r2(Math.max(0, truePct + jitter));
  const previousCpl = r1(currentCpl + between(-3, 3, 0.1));
  push("no_change", { customer: c, currentCpl, previousCpl, region: pick(REGIONS), todayIso: pick(DATES) },
    expectedFor(c, currentCpl, `No change: current levy ${c.levyCurrentPct}% is within 0.5 pp of indexed ${truePct}%.`));
}

// 5 price-fall cases: diesel has dropped, levy should come down (or clamp at 0).
for (let i = 0; i < 5; i++) {
  const c = baseCustomer("indexed", NAMES[(i + 13) % NAMES.length]);
  const previousCpl = r1(between(260, 330, 0.1));
  const currentCpl = i === 4 ? r1((c.levyBaseCpl as number) - 5) : r1(previousCpl - between(15, 60, 0.1));
  c.levyCurrentPct = r2(indexedPct(c, previousCpl));
  const truePct = indexedPct(c, currentCpl);
  push("price_fall", { customer: c, currentCpl, previousCpl, region: pick(REGIONS), todayIso: pick(DATES) },
    expectedFor(c, currentCpl, i === 4
      ? `Price fall below base: indexed levy clamps at 0% (no negative levy); current ${c.levyCurrentPct}%.`
      : `Price fall ${previousCpl} -> ${currentCpl} c/L; levy should drop from ${c.levyCurrentPct}% to ${truePct}%.`));
}

// 3 "none" method cases.
for (let i = 0; i < 3; i++) {
  const c = baseCustomer("none", NAMES[(i + 3) % NAMES.length]);
  const currentCpl = r1(between(250, 330, 0.1));
  const previousCpl = r1(currentCpl - between(5, 30, 0.1));
  if (i === 2) c.levyBaseCpl = null;
  push("none", { customer: c, currentCpl, previousCpl, region: pick(REGIONS), todayIso: pick(DATES) },
    expectedFor(c, currentCpl, "Contract has no fuel levy clause: levy is 0% and no proposal regardless of price."));
}

// 3 "fixed" method cases: the contract pins the levy at levyCurrentPct.
for (let i = 0; i < 3; i++) {
  const c = baseCustomer("fixed", NAMES[(i + 16) % NAMES.length]);
  c.levyCurrentPct = pick([5, 8.5, 10, 12.5, 15]);
  const currentCpl = r1(between(240, 330, 0.1));
  const previousCpl = r1(currentCpl - between(5, 30, 0.1));
  push("fixed", { customer: c, currentCpl, previousCpl, region: pick(REGIONS), todayIso: pick(DATES) },
    expectedFor(c, currentCpl, `Fixed levy at ${c.levyCurrentPct}% by contract; price moves do not change it.`));
}

// 2 malformed-input cases: indexed method with missing or zero base price.
{
  const c1 = baseCustomer("indexed", "Malformed Missing Base Pty Ltd");
  c1.levyBaseCpl = null;
  c1.levyCurrentPct = 4;
  push("malformed", { customer: c1, currentCpl: 281, previousCpl: 286.8, region: "QLD", todayIso: "2026-10-15" },
    { error: true, notes: "Indexed method but levyBaseCpl is missing: agent must flag the contract, not propose." });
  const c2 = baseCustomer("indexed", "Malformed Zero Base Pty Ltd");
  c2.levyBaseCpl = 0;
  c2.levyCurrentPct = 4;
  push("malformed", { customer: c2, currentCpl: 281, previousCpl: 286.8, region: "QLD", todayIso: "2026-10-15" },
    { error: true, notes: "Indexed method but levyBaseCpl is 0: division by zero; agent must flag, not propose." });
}

if (cases.length !== 50) throw new Error(`expected 50 cases, got ${cases.length}`);

const out = {
  version: 1,
  generatedBy: "evals/generate_fuel_cases.ts (seed 20261015)",
  tolerances: { levyPct: 0.05 },
  rules: {
    levyPct: "((currentCpl - levyBaseCpl) / levyBaseCpl) * levyFuelShare * 100, clamped at 0, rounded to 2 dp; fixed -> levyCurrentPct; none -> 0",
    shouldPropose: "|levyPct - levyCurrentPct| >= 0.5 percentage points",
    riskLevel: "|weekly revenue delta| < 500 low, < 3000 medium, else high (delta = baseRatePerKm * weeklyKm * (levyPct - levyCurrentPct) / 100)",
    noticeRequired: "shouldPropose && levyMethod === 'indexed'",
    error: "indexed method with levyBaseCpl missing or 0 must be reported as an error",
  },
  cases,
};

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "fuel_levy_cases.json");
writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
const counts = cases.reduce<Record<string, number>>((m, c) => ((m[c.kind] = (m[c.kind] ?? 0) + 1), m), {});
console.log(`wrote ${cases.length} cases to ${target}`, counts);
