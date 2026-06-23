import { test } from "node:test";
import assert from "node:assert/strict";
import { tickToUiPrice, binToUiPrice, clmmBandToPrices, dlmmBandToPrices } from "./ticks.ts";

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

test("tick zero is unit price when decimals match", () => {
  assert.ok(close(tickToUiPrice(0, 6, 6), 1));
});

test("tick price scales by the decimal difference", () => {
  assert.ok(close(tickToUiPrice(0, 9, 6), 1000));
});

test("bin price uses the bin step as a growth factor", () => {
  assert.ok(close(binToUiPrice(0, 100, 6, 6), 1));
  assert.ok(close(binToUiPrice(1, 100, 6, 6), 1.01, 1e-12));
});

test("band conversion preserves ordering", () => {
  const clmm = clmmBandToPrices({ unit: "tick", lower: -1000, upper: 1000, inclusiveUpper: false }, 6, 6);
  assert.ok(clmm.low < clmm.high);
  const dlmm = dlmmBandToPrices({ unit: "bin", lower: -50, upper: 50, inclusiveUpper: true }, 25, 6, 6);
  assert.ok(dlmm.low < dlmm.high);
});
