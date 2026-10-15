import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeLevyPct,
  levyDelta,
  tripFuelCost,
  surchargeNoticeText,
} from "../fuel-levy";

test("indexed levy at base price is 0", () => {
  assert.equal(computeLevyPct({ currentCpl: 176.6, baseCpl: 176.6, fuelShare: 0.3, method: "indexed" }), 0);
});

test("indexed levy: +40 c/L on base 176.6 with share 0.30 is about 6.80%", () => {
  const pct = computeLevyPct({ currentCpl: 216.6, baseCpl: 176.6, fuelShare: 0.3, method: "indexed" });
  assert.ok(Math.abs(pct - 6.8) < 0.01, `got ${pct}`);
});

test("indexed levy clamps negative to 0 unless allowNegative", () => {
  const base = { currentCpl: 160, baseCpl: 176.6, fuelShare: 0.3, method: "indexed" as const };
  assert.equal(computeLevyPct(base), 0);
  assert.ok(!Object.is(computeLevyPct(base), -0));
  const neg = computeLevyPct({ ...base, allowNegative: true });
  assert.ok(neg < 0);
  assert.ok(Math.abs(neg - -2.82) < 0.01, `got ${neg}`);
});

test("fixed method returns fixedPct, defaulting to 0", () => {
  assert.equal(computeLevyPct({ currentCpl: 300, baseCpl: 176.6, fuelShare: 0.3, method: "fixed", fixedPct: 12.5 }), 12.5);
  assert.equal(computeLevyPct({ currentCpl: 300, baseCpl: 176.6, fuelShare: 0.3, method: "fixed" }), 0);
});

test("none method returns 0 regardless of prices", () => {
  assert.equal(computeLevyPct({ currentCpl: 330, baseCpl: 160, fuelShare: 0.4, method: "none" }), 0);
});

test("indexed with missing or zero baseCpl throws", () => {
  assert.throws(() => computeLevyPct({ currentCpl: 281, baseCpl: 0, fuelShare: 0.3, method: "indexed" }), /baseCpl/);
  assert.throws(
    () => computeLevyPct({ currentCpl: 281, baseCpl: undefined as unknown as number, fuelShare: 0.3, method: "indexed" }),
    /baseCpl/,
  );
  assert.throws(() => computeLevyPct({ currentCpl: 281, baseCpl: NaN, fuelShare: 0.3, method: "indexed" }), /baseCpl/);
});

test("levyDelta maths", () => {
  const d = levyDelta({
    customer: { baseRatePerKm: 3.2, weeklyKm: 4000, levyCurrentPct: 5 },
    newLevyPct: 10,
  });
  // weekly base 12,800: old levy 640, new levy 1,280
  assert.equal(d.oldWeeklyLevyAud, 640);
  assert.equal(d.newWeeklyLevyAud, 1280);
  assert.equal(d.weeklyRevenueDeltaAud, 640);
  assert.equal(d.perKmDeltaAud, 0.16);

  const down = levyDelta({ customer: { baseRatePerKm: 2, weeklyKm: 1000, levyCurrentPct: 8 }, newLevyPct: 6 });
  assert.equal(down.weeklyRevenueDeltaAud, -40);
  assert.equal(down.perKmDeltaAud, -0.04);
});

test("tripFuelCost: 1,350 km at 48 L/100km at 281 c/L", () => {
  const r = tripFuelCost({ km: 1350, litresPer100km: 48, dieselCpl: 281 });
  assert.equal(r.litres, 648);
  assert.equal(r.costAud, 1820.88);
});

test("surchargeNoticeText contains the effective date and both percentages", () => {
  const txt = surchargeNoticeText({
    customerName: "Darling Downs Grain",
    operatorName: "Brisbane Demo Fleet",
    oldPct: 5.25,
    newPct: 17.7,
    effectiveDate: "22 October 2026",
    currentCpl: 281,
    baseCpl: 176.6,
    noticeDays: 7,
  });
  assert.match(txt, /22 October 2026/);
  assert.match(txt, /5\.25%/);
  assert.match(txt, /17\.70%/);
  assert.match(txt, /281\.0 c\/L/);
  assert.match(txt, /176\.6 c\/L/);
  assert.match(txt, /7-day/);
  assert.match(txt, /increase/);
});
