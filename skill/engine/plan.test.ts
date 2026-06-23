import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan } from "./plan.ts";
import type { Position } from "./model.ts";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const position: Position = {
  venue: "orca",
  kind: "clmm",
  ref: "WhirlAbCdEf1234567890",
  band: { unit: "tick", lower: -100, upper: 100, inclusiveUpper: false },
  inRange: false,
  legs: { a: { mint: SOL, decimals: 9, raw: 10_000_000_000n }, b: { mint: USDC, decimals: 6, raw: 1_500_000_000n } },
  unclaimed: { a: 0n, b: 0n },
};
const prices = { [SOL]: 150, [USDC]: 1 };

test("plan lists the lifecycle steps in order", () => {
  const plan = buildPlan(position, { low: 140, high: 160 }, prices);
  assert.deepEqual(plan.steps.map((s) => s.kind), ["collectFees", "withdraw", "close", "open", "deposit"]);
});

test("plan can include a swap leg before opening", () => {
  const plan = buildPlan(position, { low: 140, high: 160 }, prices, { includeSwap: true });
  const kinds = plan.steps.map((s) => s.kind);
  assert.ok(kinds.indexOf("swap") < kinds.indexOf("open"));
});

test("plan estimates notional from position value and builds a confirm phrase", () => {
  const plan = buildPlan(position, { low: 140, high: 160 }, prices);
  assert.ok(Math.abs(plan.estNotionalUsd - 3000) < 1e-6);
  assert.equal(plan.confirmPhrase, "CONFIRM REBALANCE orca WhirlAbC");
});

test("plan rejects an invalid target band", () => {
  assert.throws(() => buildPlan(position, { low: 160, high: 140 }, prices));
  assert.throws(() => buildPlan(position, { low: 0, high: 160 }, prices));
});
