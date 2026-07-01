import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bandFromWidth,
  ilConstantProduct,
  clmmValueInB,
  liquidityForValue,
  clmmTokenSplit,
  ilClmm,
  realizedVolAnnualized,
  ewmaVolAnnualized,
  breakEvenFeeApr,
  outOfRangeProbability,
  stdNormCdf,
  type PricePoint,
} from "./il.ts";

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

test("ilConstantProduct is zero at ratio 1 and symmetric in r and 1/r", () => {
  assert.ok(close(ilConstantProduct(1), 0));
  assert.ok(close(ilConstantProduct(2), ilConstantProduct(0.5)));
  assert.ok(close(ilConstantProduct(4), -0.2));
});

test("ilConstantProduct rejects non-positive ratio", () => {
  assert.throws(() => ilConstantProduct(0));
  assert.throws(() => ilConstantProduct(-1));
});

test("clmmValueInB matches hand-computed values on band [1,4]", () => {
  const band = { low: 1, high: 4 };
  assert.ok(close(clmmValueInB(1, 1, band), 0.5));
  assert.ok(close(clmmValueInB(1, 4, band), 1));
  assert.ok(close(clmmValueInB(1, 2, band), 2 * Math.SQRT2 - 2, 1e-6));
});

test("clmmValueInB token split reconstructs the value at mid price", () => {
  const band = { low: 1, high: 4 };
  const split = clmmTokenSplit(1000, 2, band);
  const valueFromSplit = split.amountA * 2 + split.amountB;
  assert.ok(close(valueFromSplit, clmmValueInB(1000, 2, band), 1e-6));
});

test("liquidityForValue round-trips through clmmValueInB", () => {
  const band = { low: 1, high: 4 };
  const liquidity = liquidityForValue(1000, 2, band);
  assert.ok(close(clmmValueInB(liquidity, 2, band), 1000, 1e-6));
});

test("ilClmm is ~zero when exit equals entry", () => {
  const r = ilClmm({ entryPrice: 2, exitPrice: 2, band: { low: 1, high: 4 }, depositValueInB: 1000 });
  assert.ok(close(r.ilFraction, 0, 1e-9));
});

test("ilClmm is negative and bounded for an in-range move", () => {
  const r = ilClmm({ entryPrice: 2, exitPrice: 3, band: { low: 1, high: 4 }, depositValueInB: 1000 });
  assert.ok(r.ilFraction < 0);
  assert.ok(r.ilFraction > -1);
});

test("ilClmm edge ILs are non-positive and at least as severe as an interior exit", () => {
  const r = ilClmm({ entryPrice: 2, exitPrice: 2.2, band: { low: 1, high: 4 }, depositValueInB: 1000 });
  assert.ok(r.ilAtLow <= 1e-9);
  assert.ok(r.ilAtHigh <= 1e-9);
  assert.ok(Math.min(r.ilAtLow, r.ilAtHigh) <= r.ilFraction + 1e-9);
});

test("breakEvenFeeApr turns an IL loss into the APR needed to offset it", () => {
  assert.ok(close(breakEvenFeeApr(-0.05, 0.5), 0.1));
  assert.equal(breakEvenFeeApr(0, 1), 0);
  assert.equal(breakEvenFeeApr(0.03, 1), 0);
  assert.throws(() => breakEvenFeeApr(-0.05, 0));
});

test("ewmaVolAnnualized is zero for a flat series, positive for a moving one, and guards lambda", () => {
  const flat: PricePoint[] = [
    { t: 0, price: 100 },
    { t: 86400, price: 100 },
    { t: 172800, price: 100 },
  ];
  assert.equal(ewmaVolAnnualized(flat), 0);

  const moving: PricePoint[] = [
    { t: 0, price: 100 },
    { t: 86400, price: 110 },
    { t: 172800, price: 105 },
    { t: 259200, price: 115 },
  ];
  assert.ok(ewmaVolAnnualized(moving) > 0);
  assert.throws(() => ewmaVolAnnualized(moving, 1));
});

test("bandFromWidth builds a symmetric band and rejects bad input", () => {
  const band = bandFromWidth(100, 0.1);
  assert.ok(close(band.low, 90));
  assert.ok(close(band.high, 110));
  assert.throws(() => bandFromWidth(100, 0));
  assert.throws(() => bandFromWidth(100, 1));
});

test("realizedVolAnnualized is zero for a flat series and positive for a moving one", () => {
  const flat: PricePoint[] = [
    { t: 0, price: 100 },
    { t: 86400, price: 100 },
    { t: 172800, price: 100 },
  ];
  assert.equal(realizedVolAnnualized(flat), 0);

  const moving: PricePoint[] = [
    { t: 0, price: 100 },
    { t: 86400, price: 110 },
    { t: 172800, price: 105 },
    { t: 259200, price: 115 },
  ];
  assert.ok(realizedVolAnnualized(moving) > 0);
});

test("realized vol counts a steady trend as volatility (realized variance, no mean subtraction)", () => {
  // Equal successive log returns are a pure trend. A mean-subtracting sample
  // variance reports zero here; realized variance (sum of squared returns over
  // total elapsed time) correctly reports positive volatility.
  const trend: PricePoint[] = [
    { t: 0, price: 100 },
    { t: 86400, price: 110 },
    { t: 2 * 86400, price: 121 },
  ];
  assert.ok(realizedVolAnnualized(trend) > 0);
  assert.ok(ewmaVolAnnualized(trend) > 0);
});

test("realized vol is spacing-aware: the same move over more time is less volatile", () => {
  const fast: PricePoint[] = [
    { t: 0, price: 100 }, { t: 86400, price: 100 }, { t: 2 * 86400, price: 130 },
  ];
  const slow: PricePoint[] = [
    { t: 0, price: 100 }, { t: 86400, price: 100 }, { t: 8 * 86400, price: 130 },
  ];
  assert.ok(realizedVolAnnualized(fast) > realizedVolAnnualized(slow));
});

test("stdNormCdf is 0.5 at zero and monotone", () => {
  assert.ok(close(stdNormCdf(0), 0.5, 1e-6));
  assert.ok(stdNormCdf(-1) < 0.5);
  assert.ok(stdNormCdf(1) > 0.5);
  assert.ok(close(stdNormCdf(1.96), 0.975, 2e-3));
});

test("outOfRangeProbability is low when centered and tight vol, high when outside", () => {
  const lowProb = outOfRangeProbability(100, { low: 90, high: 110 }, 0.5, 1);
  assert.ok(lowProb < 0.05);

  const highProb = outOfRangeProbability(120, { low: 90, high: 110 }, 0.5, 1);
  assert.ok(highProb > 0.5);

  assert.equal(outOfRangeProbability(100, { low: 90, high: 110 }, 0, 1), 0);
  assert.equal(outOfRangeProbability(120, { low: 90, high: 110 }, 0, 1), 1);
});
