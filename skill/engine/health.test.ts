import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deserializeSnapshot } from "./ledger.ts";
import type { Snapshot } from "./model.ts";
import { escalations, portfolioScore, venueShares, orientationLooksOff } from "./health.ts";

function loadDemo(): Snapshot[] {
  const path = fileURLToPath(new URL("./fixtures/snapshots-demo.jsonl", import.meta.url));
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map(deserializeSnapshot);
}

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL = "So11111111111111111111111111111111111111112";

function orcaSnapshot(over: Partial<Snapshot["positions"][number]> = {}): Snapshot {
  return {
    takenAtUnix: 1,
    wallet: "W",
    priceUsd: { [SOL]: 150, [USDC]: 1 },
    priceSource: { [SOL]: "jupiter", [USDC]: "jupiter" },
    positions: [{
      venue: "orca",
      kind: "clmm",
      ref: "Whirl1",
      band: { unit: "tick", lower: -18970, upper: -18326, inclusiveUpper: false },
      inRange: true,
      legs: {
        a: { mint: SOL, decimals: 9, raw: 10_000_000_000n },
        b: { mint: USDC, decimals: 6, raw: 1_500_000_000n },
      },
      unclaimed: { a: 0n, b: 0n },
      ...over,
    }],
  };
}

function lendingSnapshot(health: number): Snapshot {
  return {
    takenAtUnix: 1,
    wallet: "W",
    priceUsd: { [USDC]: 1 },
    priceSource: { [USDC]: "jupiter" },
    positions: [{
      venue: "kamino",
      kind: "lending",
      ref: "Obligation1",
      legs: { a: { mint: USDC, decimals: 6, raw: 1_000_000_000n } },
      unclaimed: { a: 0n },
      health,
    }],
  };
}

test("out-of-range clmm position raises a high alert", () => {
  const snaps = loadDemo();
  const alerts = escalations(snaps[2]);
  assert.ok(alerts.some((a) => a.code === "out-of-range" && a.severity === "high"));
});

test("in-range snapshot has no out-of-range alert", () => {
  const alerts = escalations(loadDemo()[0]);
  assert.ok(!alerts.some((a) => a.code === "out-of-range"));
});

test("low lending health escalates by tier", () => {
  assert.ok(escalations(lendingSnapshot(1.1)).some((a) => a.severity === "critical"));
  assert.ok(escalations(lendingSnapshot(1.4)).some((a) => a.severity === "high"));
  assert.ok(!escalations(lendingSnapshot(2.0)).some((a) => a.code.startsWith("liquidation")));
});

test("single-venue portfolio flags concentration", () => {
  const alerts = escalations(loadDemo()[0]);
  assert.ok(alerts.some((a) => a.code === "concentration"));
  const shares = venueShares(loadDemo()[0]);
  assert.ok(Math.abs(shares["orca"] - 1) < 1e-9);
});

test("a Token-2022 leg raises a verify-before-sizing flag", () => {
  const snap = orcaSnapshot({
    legs: {
      a: { mint: SOL, decimals: 9, raw: 1n, tokenProgram: "token-2022", hasTransferHook: true },
      b: { mint: USDC, decimals: 6, raw: 1n },
    },
  });
  assert.ok(escalations(snap).some((a) => a.code === "token-2022"));
});

test("a locked position raises a high alert", () => {
  assert.ok(escalations(orcaSnapshot({ locked: true })).some((a) => a.code === "locked" && a.severity === "high"));
});

test("thin pool liquidity raises a medium alert", () => {
  assert.ok(escalations(orcaSnapshot({ poolLiquidityUsd: 10_000 })).some((a) => a.code === "thin-liquidity"));
  assert.ok(!escalations(orcaSnapshot({ poolLiquidityUsd: 5_000_000 })).some((a) => a.code === "thin-liquidity"));
});

test("orientationLooksOff catches an inverted pair or a decimals slip, not normal drift", () => {
  assert.ok(orientationLooksOff(1 / 150, 150));
  assert.ok(orientationLooksOff(0.155, 150));
  assert.ok(!orientationLooksOff(155, 150));
});

test("a decimals mistake surfaces a price-orientation flag", () => {
  const snap = orcaSnapshot({
    legs: {
      a: { mint: SOL, decimals: 6, raw: 1n },
      b: { mint: USDC, decimals: 9, raw: 1n },
    },
  });
  assert.ok(escalations(snap).some((a) => a.code === "price-orientation"));
});

test("a correctly oriented in-range position has no orientation flag", () => {
  assert.ok(!escalations(orcaSnapshot()).some((a) => a.code === "price-orientation"));
});

test("score drops when the position goes out of range", () => {
  const inRange = portfolioScore(loadDemo()[0]).score;
  const outOfRange = portfolioScore(loadDemo()[2]).score;
  assert.ok(Math.abs(inRange - 75) < 1e-6);
  assert.ok(Math.abs(outOfRange - 35) < 1e-6);
  assert.ok(outOfRange < inRange);
});
