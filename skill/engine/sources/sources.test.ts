import { test } from "node:test";
import assert from "node:assert/strict";
import * as orca from "./orca.ts";
import * as raydium from "./raydium.ts";
import * as meteora from "./meteora.ts";
import * as kamino from "./kamino.ts";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

test("orca range is half-open", () => {
  const inside = orca.toPosition({
    whirlpool: "P", tickLower: -100, tickUpper: 100, tickCurrent: 0,
    mintA: SOL, decimalsA: 9, mintB: USDC, decimalsB: 6,
    amountA: 1n, amountB: 2n, feeOwedB: 3n,
  });
  assert.equal(inside.inRange, true);
  const atUpper = orca.toPosition({
    whirlpool: "P", tickLower: -100, tickUpper: 100, tickCurrent: 100,
    mintA: SOL, decimalsA: 9, mintB: USDC, decimalsB: 6,
    amountA: 1n, amountB: 2n, feeOwedB: 3n,
  });
  assert.equal(atUpper.inRange, false);
  assert.equal(inside.venue, "orca");
  assert.equal(inside.band?.unit, "tick");
});

test("meteora range is inclusive of the upper bin", () => {
  const atUpper = meteora.toPosition({
    lbPair: "L", lowerBinId: -10, upperBinId: 10, activeId: 10,
    mintX: SOL, decimalsX: 9, mintY: USDC, decimalsY: 6,
    amountX: 1n, amountY: 2n, feeY: 3n,
  });
  assert.equal(atUpper.inRange, true);
  assert.equal(atUpper.venue, "meteora-dlmm");
  assert.equal(atUpper.band?.inclusiveUpper, true);
});

test("raydium maps to a tick clmm position", () => {
  const p = raydium.toPosition({
    poolId: "R", tickLower: -5, tickUpper: 5, tickCurrent: 0,
    mintA: SOL, decimalsA: 9, mintB: USDC, decimalsB: 6,
    amountA: 1n, amountB: 2n, feeOwedB: 3n,
  });
  assert.equal(p.venue, "raydium");
  assert.equal(p.inRange, true);
});

test("kamino maps to a vault, with an optional band", () => {
  const noBand = kamino.toPosition({
    strategy: "S", mintA: SOL, decimalsA: 9, mintB: USDC, decimalsB: 6, amountA: 1n, amountB: 2n,
  });
  assert.equal(noBand.kind, "vault");
  assert.equal(noBand.band, undefined);
  const withBand = kamino.toPosition({
    strategy: "S", mintA: SOL, decimalsA: 9, mintB: USDC, decimalsB: 6, amountA: 1n, amountB: 2n,
    tickLower: -100, tickUpper: 100, tickCurrent: 0,
  });
  assert.equal(withBand.inRange, true);
});

test("read maps raw records through an injected fetcher", async () => {
  const fetcher = async () => [
    { whirlpool: "P1", tickLowerIndex: -100, tickUpperIndex: 100, tickCurrentIndex: 50, tokenMintA: SOL, tokenMintB: USDC, amountA: "5", amountB: "6", feeOwedB: "7" },
  ];
  const positions = await orca.read("owner", {}, fetcher);
  assert.equal(positions.length, 1);
  assert.equal(positions[0].ref, "P1");
  assert.equal(positions[0].inRange, true);
  assert.equal(positions[0].legs.a.raw, 5n);
  assert.equal(positions[0].unclaimed.b, 7n);
});

test("the live path errors clearly when the optional dependency is absent", async () => {
  await assert.rejects(() => orca.read("owner"), /optional dependency/);
});
