/**
 * Fuel levy engine for Australian road freight.
 *
 * Pure and deterministic: no I/O, no Date.now(), no randomness. Everything the
 * fuel agent needs to reason about a customer's fuel levy clause lives here so
 * it can be unit-tested and replayed against golden cases.
 *
 * Model
 * -----
 * A customer's base rate (A$/km) assumes a reference diesel price, the
 * `baseCpl` (cents per litre). When diesel moves away from that reference the
 * operator applies a percentage levy on top of the base freight rate:
 *
 *     levy% = ((currentCpl - baseCpl) / baseCpl) * fuelShare * 100
 *
 * where `fuelShare` is the fuel portion of the operator's cost base (typically
 * 0.25 to 0.40 for linehaul). Operators rarely apply a negative levy when
 * diesel falls below the reference, so indexed levies clamp at 0 unless
 * `allowNegative` is set.
 */

export type LevyMethod = "indexed" | "fixed" | "none";

/** Round to 2 decimal places, avoiding -0. */
function round2(n: number): number {
  const r = Math.round((n + Number.EPSILON) * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function assertFinite(name: string, v: unknown): asserts v is number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`fuel-levy: ${name} must be a finite number (got ${String(v)})`);
  }
}

export interface ComputeLevyPctArgs {
  /** Current diesel price, cents per litre. */
  currentCpl: number;
  /** Diesel price the customer's base rate assumes, cents per litre. Required for "indexed". */
  baseCpl: number;
  /** Fuel share of the cost base, e.g. 0.30. Required for "indexed". */
  fuelShare: number;
  /** Levy clause method on the contract. */
  method: LevyMethod;
  /** Contractually fixed levy percentage, used only when method is "fixed". */
  fixedPct?: number;
  /** Allow an indexed levy to go below 0 when diesel is under the base price. Default false. */
  allowNegative?: boolean;
}

/**
 * Compute the fuel levy percentage for a customer under their contract method.
 *
 * - "none"    -> 0
 * - "fixed"   -> `fixedPct ?? 0`
 * - "indexed" -> ((currentCpl - baseCpl) / baseCpl) * fuelShare * 100,
 *                clamped at 0 unless `allowNegative` is true.
 *
 * The result is rounded to 2 decimals.
 *
 * @throws Error when method is "indexed" and `baseCpl` is missing, non-finite or <= 0,
 *   or when `currentCpl` / `fuelShare` are not finite numbers.
 *
 * @example
 * computeLevyPct({ currentCpl: 216.6, baseCpl: 176.6, fuelShare: 0.3, method: "indexed" }) // 6.8
 */
export function computeLevyPct(args: ComputeLevyPctArgs): number {
  const { method } = args;
  if (method === "none") return 0;
  if (method === "fixed") {
    const p = args.fixedPct ?? 0;
    assertFinite("fixedPct", p);
    return round2(p);
  }
  if (method !== "indexed") {
    throw new Error(`fuel-levy: unknown levy method "${String(method)}"`);
  }

  const { baseCpl, currentCpl, fuelShare } = args;
  if (baseCpl === undefined || baseCpl === null || !Number.isFinite(baseCpl) || baseCpl <= 0) {
    throw new Error(
      `fuel-levy: baseCpl must be a positive number for an indexed levy (got ${String(baseCpl)})`,
    );
  }
  assertFinite("currentCpl", currentCpl);
  assertFinite("fuelShare", fuelShare);
  if (fuelShare < 0 || fuelShare > 1) {
    throw new Error(`fuel-levy: fuelShare must be between 0 and 1 (got ${fuelShare})`);
  }

  const raw = ((currentCpl - baseCpl) / baseCpl) * fuelShare * 100;
  const pct = args.allowNegative ? raw : Math.max(0, raw);
  return round2(pct);
}

export interface LevyDeltaArgs {
  customer: {
    /** Base freight rate, A$ per loaded km, ex-levy. */
    baseRatePerKm: number;
    /** Typical loaded km per week. */
    weeklyKm: number;
    /** Levy percentage currently applied to this customer. */
    levyCurrentPct: number;
  };
  /** Proposed new levy percentage. */
  newLevyPct: number;
}

export interface LevyDelta {
  /** Change in weekly revenue from the levy change, A$ (positive = more revenue). */
  weeklyRevenueDeltaAud: number;
  /** Change in the effective per-km rate, A$/km. */
  perKmDeltaAud: number;
  /** Weekly levy revenue under the current percentage, A$. */
  oldWeeklyLevyAud: number;
  /** Weekly levy revenue under the new percentage, A$. */
  newWeeklyLevyAud: number;
}

/**
 * Revenue impact of moving a customer from their current levy to a new one.
 *
 * Levy revenue = baseRatePerKm * weeklyKm * levyPct / 100. All outputs rounded
 * to cents; `perKmDeltaAud` is rounded to 4 decimals so small per-km moves
 * are not lost.
 */
export function levyDelta(args: LevyDeltaArgs): LevyDelta {
  const { baseRatePerKm, weeklyKm, levyCurrentPct } = args.customer;
  assertFinite("baseRatePerKm", baseRatePerKm);
  assertFinite("weeklyKm", weeklyKm);
  assertFinite("levyCurrentPct", levyCurrentPct);
  assertFinite("newLevyPct", args.newLevyPct);

  const weeklyBase = baseRatePerKm * weeklyKm;
  const oldWeekly = weeklyBase * (levyCurrentPct / 100);
  const newWeekly = weeklyBase * (args.newLevyPct / 100);
  const perKm = baseRatePerKm * ((args.newLevyPct - levyCurrentPct) / 100);

  return {
    weeklyRevenueDeltaAud: round2(newWeekly - oldWeekly),
    perKmDeltaAud: Math.round(perKm * 10000) / 10000 || 0,
    oldWeeklyLevyAud: round2(oldWeekly),
    newWeeklyLevyAud: round2(newWeekly),
  };
}

export interface TripFuelCostArgs {
  /** Trip distance in km. */
  km: number;
  /** Consumption, litres per 100 km (B-double laden is ~48). */
  litresPer100km: number;
  /** Diesel price, cents per litre. */
  dieselCpl: number;
}

/**
 * Fuel burned and its cost for a trip.
 *
 * @example
 * tripFuelCost({ km: 1350, litresPer100km: 48, dieselCpl: 281 }) // { litres: 648, costAud: 1820.88 }
 */
export function tripFuelCost(args: TripFuelCostArgs): { litres: number; costAud: number } {
  assertFinite("km", args.km);
  assertFinite("litresPer100km", args.litresPer100km);
  assertFinite("dieselCpl", args.dieselCpl);
  const litres = (args.km * args.litresPer100km) / 100;
  const costAud = (litres * args.dieselCpl) / 100;
  return { litres: round2(litres), costAud: round2(costAud) };
}

export interface SurchargeNoticeArgs {
  customerName: string;
  operatorName: string;
  /** Levy percentage currently applied. */
  oldPct: number;
  /** Levy percentage to apply from the effective date. */
  newPct: number;
  /** Effective date, already formatted for display (e.g. "22 October 2026" or ISO). */
  effectiveDate: string;
  /** Current diesel price the new levy is indexed to, cents per litre. */
  currentCpl: number;
  /** Reference diesel price the base rate assumes, cents per litre. */
  baseCpl: number;
  /** Contractual notice period in days. */
  noticeDays: number;
}

/**
 * Plain, professional notice paragraph advising a customer of a fuel levy
 * change. Australian English, no marketing language. States the index
 * (current vs reference diesel price), both percentages, the notice period
 * and the effective date.
 */
export function surchargeNoticeText(args: SurchargeNoticeArgs): string {
  const fmtPct = (p: number) => `${round2(p).toFixed(2)}%`;
  const fmtCpl = (c: number) => `${round2(c).toFixed(1)} c/L`;
  const direction = args.newPct > args.oldPct ? "increase" : args.newPct < args.oldPct ? "decrease" : "change";
  const noticeWord = args.noticeDays === 1 ? "day" : "days";

  return (
    `Dear ${args.customerName}, ` +
    `${args.operatorName} advises that the fuel levy applied to your freight rates will ${direction} ` +
    `from ${fmtPct(args.oldPct)} to ${fmtPct(args.newPct)}, effective ${args.effectiveDate}. ` +
    `The levy is indexed to the retail diesel price, which is currently ${fmtCpl(args.currentCpl)} ` +
    `against the reference price of ${fmtCpl(args.baseCpl)} on which your base rates are set. ` +
    `This notice is provided in accordance with the ${args.noticeDays}-${noticeWord} notice period in your agreement. ` +
    `The levy will be reviewed again as diesel prices move. ` +
    `Please contact us if you have any questions.`
  );
}
