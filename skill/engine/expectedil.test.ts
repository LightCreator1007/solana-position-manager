import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedIlUsd } from "./decide.ts";
import { bandFromWidth } from "./il.ts";

const price = 100;
const band = bandFromWidth(100, 0.05);
const principal = 1000;

test("expected IL is zero when volatility is zero", () => {
  assert.equal(expectedIlUsd(band, price, 0, 14, principal), 0);
});

test("expected IL is positive and finite for a real volatility", () => {
  const il = expectedIlUsd(band, price, 0.6, 14, principal);
  assert.ok(il > 0 && Number.isFinite(il));
});

test("expected IL rises with volatility", () => {
  const lo = expectedIlUsd(band, price, 0.3, 14, principal);
  const hi = expectedIlUsd(band, price, 0.9, 14, principal);
  assert.ok(hi > lo);
});

test("expected IL never exceeds the principal", () => {
  const il = expectedIlUsd(band, price, 3.0, 60, principal);
  assert.ok(il <= principal);
});
