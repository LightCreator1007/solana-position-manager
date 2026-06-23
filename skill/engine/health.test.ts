import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deserializeSnapshot } from "./ledger.ts";
import type { Snapshot } from "./model.ts";
import { escalations, portfolioScore, venueShares } from "./health.ts";

function loadDemo(): Snapshot[] {
  const path = fileURLToPath(new URL("./fixtures/snapshots-demo.jsonl", import.meta.url));
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map(deserializeSnapshot);
}

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

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

test("score drops when the position goes out of range", () => {
  const inRange = portfolioScore(loadDemo()[0]).score;
  const outOfRange = portfolioScore(loadDemo()[2]).score;
  assert.ok(Math.abs(inRange - 75) < 1e-6);
  assert.ok(Math.abs(outOfRange - 35) < 1e-6);
  assert.ok(outOfRange < inRange);
});
