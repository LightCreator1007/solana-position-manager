import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendSnapshot, readSnapshots, serializeSnapshot, deserializeSnapshot, ledgerPath, recordRealizedLoss, dailyRealizedLossUsd } from "./ledger.ts";
import type { Snapshot } from "./model.ts";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function demoSnap(takenAtUnix: number, wallet = "WalletTest11111111111111111111111111111111"): Snapshot {
  return {
    takenAtUnix,
    wallet,
    priceUsd: { [SOL]: 150, [USDC]: 1 },
    priceSource: { [SOL]: "jupiter", [USDC]: "jupiter" },
    positions: [{
      venue: "orca",
      kind: "clmm",
      ref: "Ref111",
      band: { unit: "tick", lower: -100, upper: 100, inclusiveUpper: false },
      inRange: true,
      legs: { a: { mint: SOL, decimals: 9, raw: 10_000_000_000n }, b: { mint: USDC, decimals: 6, raw: 1_500_000_000n } },
      unclaimed: { a: 12_345_678n, b: 2_000_000n },
      openedAtUnix: takenAtUnix,
    }],
  };
}

test("serialize then deserialize preserves bigint amounts", () => {
  const snap = demoSnap(1000);
  const back = deserializeSnapshot(serializeSnapshot(snap));
  assert.equal(back.positions[0].legs.a.raw, 10_000_000_000n);
  assert.equal(back.positions[0].unclaimed.a, 12_345_678n);
  assert.equal(back.positions[0].unclaimed.b, 2_000_000n);
  assert.deepEqual(back, snap);
});

test("append and read returns snapshots sorted by time with bigints intact", () => {
  const home = mkdtempSync(join(tmpdir(), "lp-desk-"));
  try {
    appendSnapshot(demoSnap(2000), { home });
    appendSnapshot(demoSnap(1000), { home });
    const read = readSnapshots("WalletTest11111111111111111111111111111111", { home });
    assert.equal(read.length, 2);
    assert.equal(read[0].takenAtUnix, 1000);
    assert.equal(read[1].takenAtUnix, 2000);
    assert.equal(read[0].positions[0].legs.a.raw, 10_000_000_000n);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("malformed lines are skipped, not fatal", () => {
  const home = mkdtempSync(join(tmpdir(), "lp-desk-"));
  try {
    const wallet = "WalletTest11111111111111111111111111111111";
    appendSnapshot(demoSnap(1000, wallet), { home });
    appendFileSync(ledgerPath(wallet, { home }), "{ this is not json\n", "utf8");
    appendSnapshot(demoSnap(3000, wallet), { home });
    const read = readSnapshots(wallet, { home });
    assert.equal(read.length, 2);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("reading an unknown wallet returns an empty list", () => {
  const home = mkdtempSync(join(tmpdir(), "lp-desk-"));
  try {
    assert.deepEqual(readSnapshots("Nobody", { home }), []);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("daily realized loss sums today's entries and survives a restart", () => {
  const home = mkdtempSync(join(tmpdir(), "lp-desk-"));
  const wallet = "WalletTest11111111111111111111111111111111";
  const noonToday = 1_700_000_000; // a fixed unix second used as "now"
  try {
    recordRealizedLoss(wallet, 120, { home }, noonToday);
    recordRealizedLoss(wallet, 80, { home }, noonToday + 60);
    // A fresh read (simulating a new process) sees both, not a reset-to-zero counter.
    assert.equal(dailyRealizedLossUsd(wallet, { home }, noonToday + 120), 200);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a loss from a previous day does not count against today's cap", () => {
  const home = mkdtempSync(join(tmpdir(), "lp-desk-"));
  const wallet = "WalletTest11111111111111111111111111111111";
  const now = 1_700_000_000;
  try {
    recordRealizedLoss(wallet, 500, { home }, now - 86_400 * 2);
    recordRealizedLoss(wallet, 50, { home }, now);
    assert.equal(dailyRealizedLossUsd(wallet, { home }, now), 50);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
