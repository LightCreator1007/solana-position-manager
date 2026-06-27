import { test } from "node:test";
import assert from "node:assert/strict";
import * as orca from "./orca.ts";
import * as raydium from "./raydium.ts";
import * as meteora from "./meteora.ts";
import * as kamino from "./kamino.ts";
import { EngineError } from "../errors.ts";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function router(routes: Record<string, unknown>): typeof fetch {
  return (async (_url: string, init?: { body?: string }) => {
    const method = JSON.parse(init?.body ?? "{}").method as string;
    return { ok: true, status: 200, json: async () => ({ result: routes[method] }) };
  }) as unknown as typeof fetch;
}

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

test("orcaRowToRaw derives base-unit amounts and range from liquidity and ticks", () => {
  const inRange = orca.toPositionFromRaw(
    orca.orcaRowToRaw({
      whirlpool: "P", tickLower: -100, tickUpper: 100, tickCurrent: 0,
      mintA: SOL, decimalsA: 9, mintB: USDC, decimalsB: 6, liquidity: 1_000_000,
    }),
  );
  assert.equal(inRange.inRange, true);
  assert.ok(inRange.legs.a.raw > 0n && (inRange.legs.b?.raw ?? 0n) > 0n);

  const belowRange = orca.orcaRowToRaw({
    whirlpool: "P", tickLower: -100, tickUpper: 100, tickCurrent: -200,
    mintA: SOL, decimalsA: 9, mintB: USDC, decimalsB: 6, liquidity: 1_000_000,
  });
  assert.equal(belowRange.amountB, "0");
  assert.notEqual(belowRange.amountA, "0");

  const aboveRange = orca.orcaRowToRaw({
    whirlpool: "P", tickLower: -100, tickUpper: 100, tickCurrent: 200,
    mintA: SOL, decimalsA: 9, mintB: USDC, decimalsB: 6, liquidity: 1_000_000,
  });
  assert.equal(aboveRange.amountA, "0");
  assert.notEqual(aboveRange.amountB, "0");
});

test("discoverPositionMints returns only single-unit NFT mints", async () => {
  const payload = {
    value: [
      { account: { data: { parsed: { info: { mint: "PosMint", tokenAmount: { amount: "1", decimals: 0 } } } } } },
      { account: { data: { parsed: { info: { mint: "UsdcAta", tokenAmount: { amount: "9", decimals: 6 } } } } } },
    ],
  };
  const mints = await orca.discoverPositionMints("owner", {
    rpcUrl: "https://rpc.test",
    fetchImpl: router({ getTokenAccountsByOwner: payload }),
  });
  assert.ok(mints.includes("PosMint"));
  assert.ok(!mints.includes("UsdcAta"));
});

test("the live path needs an rpc url and a venue sdk, and says which is missing", async () => {
  await assert.rejects(
    () => orca.read("owner"),
    (e: unknown) => e instanceof EngineError && e.code === "INVALID_INPUT",
  );
  await assert.rejects(
    () => orca.read("owner", { rpcUrl: "https://rpc.test" }),
    (e: unknown) => e instanceof EngineError && e.code === "DEPENDENCY_MISSING",
  );
});
