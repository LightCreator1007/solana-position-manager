import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deserializeSnapshot } from "./ledger.ts";
import type { Snapshot } from "./model.ts";
import {
  portfolioValueUsd,
  unclaimedFeesUsd,
  feeVelocityUsdPerDay,
  simpleReturn,
  holdingPeriodDays,
  pairPriceSeries,
  valueSeries,
} from "./pnl.ts";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function loadDemo(): Snapshot[] {
  const path = fileURLToPath(new URL("./fixtures/snapshots-demo.jsonl", import.meta.url));
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map(deserializeSnapshot);
}

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

test("demo fixture loads three snapshots", () => {
  assert.equal(loadDemo().length, 3);
});

test("portfolio value and unclaimed fees match hand computation", () => {
  const snaps = loadDemo();
  assert.ok(close(unclaimedFeesUsd(snaps[0].positions[0], snaps[0].priceUsd), 3.5));
  assert.ok(close(portfolioValueUsd(snaps[0]), 3003.5));
  assert.ok(close(portfolioValueUsd(snaps[2]), 3010.125));
});

test("fee velocity measures only positive accrual per day", () => {
  assert.ok(close(feeVelocityUsdPerDay(loadDemo()), 3.3125, 1e-6));
});

test("holding period and simple return", () => {
  const snaps = loadDemo();
  assert.equal(holdingPeriodDays(snaps), 2);
  const r = simpleReturn(snaps);
  assert.ok(r !== null && close(r, 3010.125 / 3003.5 - 1, 1e-9));
});

test("pair price series derives token-A-in-token-B prices", () => {
  const series = pairPriceSeries(loadDemo(), SOL, USDC);
  assert.deepEqual(series.map((p) => p.price), [150, 155, 165]);
});

test("value series tracks each snapshot", () => {
  const vs = valueSeries(loadDemo());
  assert.equal(vs.length, 3);
  assert.ok(close(vs[2].valueUsd, 3010.125));
});

test("single snapshot yields null return and zero velocity", () => {
  const one = loadDemo().slice(0, 1);
  assert.equal(simpleReturn(one), null);
  assert.equal(feeVelocityUsdPerDay(one), 0);
});
