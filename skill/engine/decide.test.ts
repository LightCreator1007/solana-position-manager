import { test } from "node:test";
import assert from "node:assert/strict";
import { decideRebalance, widthFromVol } from "./decide.ts";
import { bandFromWidth } from "./il.ts";

const outOfRange = {
  currentPrice: 130,
  currentBand: bandFromWidth(100, 0.1),
  depositValueUsd: 5000,
  feeVelocityUsdPerDay: 8,
  volAnnual: 0.3,
  horizonDays: 14,
  gasCostUsd: 2,
  slippageBps: 20,
  realizedGainUsd: 3000,
};

test("recommends rebalancing an out-of-range position when tax is off", () => {
  const d = decideRebalance({ ...outOfRange, taxRateBps: 0 });
  assert.equal(d.action, "REBALANCE");
  assert.ok(d.evDeltaUsd > 0);
  assert.equal(d.taxDragUsd, 0);
  assert.ok(d.breakEvenHorizonDays !== null && d.breakEvenHorizonDays >= 1);
});

test("tax drag flips a borderline rebalance to hold", () => {
  const off = decideRebalance({ ...outOfRange, taxRateBps: 0 });
  const on = decideRebalance({ ...outOfRange, taxRateBps: 3000 });
  assert.equal(off.action, "REBALANCE");
  assert.equal(on.action, "HOLD");
  assert.equal(on.taxDragUsd, 900);
  assert.ok(on.evDeltaUsd < off.evDeltaUsd);
});

test("a healthy in-range position is left alone", () => {
  const d = decideRebalance({
    currentPrice: 100,
    currentBand: bandFromWidth(100, 0.08),
    depositValueUsd: 8000,
    feeVelocityUsdPerDay: 3,
    volAnnual: 0.25,
    horizonDays: 14,
  });
  assert.equal(d.action, "HOLD");
  assert.ok(d.outOfRangeProbCurrent < 0.3);
});

test("recommended band is centered on the current price", () => {
  const d = decideRebalance({ ...outOfRange, taxRateBps: 0 });
  assert.ok(d.recommendedBand.low < outOfRange.currentPrice);
  assert.ok(d.recommendedBand.high > outOfRange.currentPrice);
  const center = (d.recommendedBand.low + d.recommendedBand.high) / 2;
  assert.ok(Math.abs(center - outOfRange.currentPrice) < 1e-6);
  assert.ok(Math.abs(d.recommendedWidth - widthFromVol(outOfRange.volAnnual, outOfRange.horizonDays)) < 1e-9);
});

test("inputs are echoed for transparency", () => {
  const d = decideRebalance({ ...outOfRange, taxRateBps: 3000 });
  assert.equal(d.inputs.taxRateBps, 3000);
  assert.equal(d.inputs.realizedGainUsd, 3000);
  assert.equal(d.inputs.horizonDays, 14);
  assert.equal(d.inputs.depositValueUsd, 5000);
});

test("confidence reflects data sufficiency", () => {
  const high = decideRebalance({ ...outOfRange, taxRateBps: 0 });
  assert.equal(high.confidence, "high");
  const low = decideRebalance({ ...outOfRange, volAnnual: 0, taxRateBps: 0 });
  assert.equal(low.confidence, "low");
});

test("a custom safety margin suppresses marginal rebalances", () => {
  const eager = decideRebalance({ ...outOfRange, taxRateBps: 0 });
  const strict = decideRebalance({ ...outOfRange, taxRateBps: 0, safetyMarginUsd: eager.evDeltaUsd + 1 });
  assert.equal(eager.action, "REBALANCE");
  assert.equal(strict.action, "HOLD");
});
