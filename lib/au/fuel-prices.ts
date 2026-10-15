/**
 * Diesel price observations for the fuel agent.
 *
 * Reads and writes the `fuel_prices` table (see lib/domain/schema.ts). One row
 * per capture; the newest row per region is the price the agent reasons from.
 * All statements are parameterised.
 */
import { db } from "../db";
import { genId } from "../domain/schema";
import { camel, type FuelPrice } from "../domain/types";

/** A dated reference point for Queensland retail diesel, cents per litre. */
export interface DieselReferencePoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Retail diesel price, cents per litre. */
  cpl: number;
  /** True when the value is derived/estimated rather than a published weekly figure. */
  approx?: boolean;
  note: string;
  source: string;
}

/**
 * Queensland retail diesel reference points for 2026, used to seed demo data
 * and to anchor the price chart. Cents per litre.
 */
export const AU_DIESEL_REFERENCE: readonly DieselReferencePoint[] = [
  {
    date: "2026-02-20",
    cpl: 176.6,
    note: "pre Hormuz closure",
    source: "ACCC weekly",
  },
  {
    date: "2026-03-31",
    cpl: 322,
    approx: true,
    note: "peak, derived",
    source: "derived",
  },
  {
    date: "2026-09-16",
    cpl: 286.8,
    note: "ACCC weekly",
    source: "ACCC weekly",
  },
  {
    date: "2026-10-07",
    cpl: 281.0,
    note: "~104 c/L above pre-conflict",
    source: "ACCC weekly",
  },
];

const toFuelPrice = (row: Record<string, unknown>): FuelPrice => camel<FuelPrice>(row);

/**
 * Newest diesel observation for an account. When `region` is given, the newest
 * row for that region; otherwise the newest row overall.
 */
export function latestDieselPrice(accountId: string, region?: string): FuelPrice | undefined {
  const row = region
    ? db
        .prepare(
          `SELECT * FROM fuel_prices WHERE account_id = ? AND region = ?
           ORDER BY captured_at DESC, rowid DESC LIMIT 1`,
        )
        .get(accountId, region)
    : db
        .prepare(
          `SELECT * FROM fuel_prices WHERE account_id = ?
           ORDER BY captured_at DESC, rowid DESC LIMIT 1`,
        )
        .get(accountId);
  return row ? toFuelPrice(row as Record<string, unknown>) : undefined;
}

/** Insert a diesel observation and return the stored row. */
export function recordDieselPrice(args: {
  accountId: string;
  region: string;
  dieselCpl: number;
  source: string;
  capturedAt?: number;
}): FuelPrice {
  if (!Number.isFinite(args.dieselCpl) || args.dieselCpl <= 0) {
    throw new Error(`fuel-prices: dieselCpl must be a positive number (got ${String(args.dieselCpl)})`);
  }
  const id = genId("fp");
  const capturedAt = args.capturedAt ?? Date.now();
  db.prepare(
    `INSERT INTO fuel_prices (id, account_id, captured_at, region, diesel_cpl, source)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, args.accountId, capturedAt, args.region, args.dieselCpl, args.source);
  const row = db.prepare("SELECT * FROM fuel_prices WHERE id = ?").get(id) as Record<string, unknown>;
  return toFuelPrice(row);
}

/** Most recent observations for an account, newest first. */
export function priceHistory(accountId: string, limit = 30): FuelPrice[] {
  const rows = db
    .prepare(
      `SELECT * FROM fuel_prices WHERE account_id = ?
       ORDER BY captured_at DESC, rowid DESC LIMIT ?`,
    )
    .all(accountId, Math.max(1, Math.floor(limit))) as Record<string, unknown>[];
  return rows.map(toFuelPrice);
}

/**
 * Record a scenario price shock: a new observation equal to the latest price
 * plus `deltaCpl`, with source "scenario". Falls back to the latest overall
 * observation when the region has none, and to the newest AU_DIESEL_REFERENCE
 * point when the account has no observations at all.
 */
export function applyScenarioPriceShock(args: {
  accountId: string;
  deltaCpl: number;
  region?: string;
}): FuelPrice {
  if (!Number.isFinite(args.deltaCpl)) {
    throw new Error(`fuel-prices: deltaCpl must be a finite number (got ${String(args.deltaCpl)})`);
  }
  const latest =
    (args.region ? latestDieselPrice(args.accountId, args.region) : undefined) ??
    latestDieselPrice(args.accountId);
  const region = args.region ?? latest?.region ?? "QLD";
  const baseCpl = latest?.dieselCpl ?? AU_DIESEL_REFERENCE[AU_DIESEL_REFERENCE.length - 1].cpl;
  const dieselCpl = Math.round((baseCpl + args.deltaCpl) * 10) / 10;
  return recordDieselPrice({ accountId: args.accountId, region, dieselCpl, source: "scenario" });
}
