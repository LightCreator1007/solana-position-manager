import type { Position } from "../model.ts";
import { EngineError } from "../errors.ts";
import { strOf, numOf, bigOf } from "./extract.ts";
import { ammAmountsFromShare } from "./amm.ts";

const PKG = "@meteora-ag/cp-amm-sdk";

export interface ReadOpts {
  rpcUrl?: string;
}

export type RawFetcher = (owner: string, opts: ReadOpts) => Promise<Record<string, unknown>[]>;

export interface MeteoraDammFields {
  pool: string;
  mintA: string;
  decimalsA: number;
  mintB: string;
  decimalsB: number;
  lpTokens: bigint;
  lpSupply: bigint;
  reserveA: bigint;
  reserveB: bigint;
  feeOwedB?: bigint;
}

export function toPosition(f: MeteoraDammFields): Position {
  const { amountA, amountB } = ammAmountsFromShare(f.lpTokens, f.lpSupply, f.reserveA, f.reserveB);
  return {
    venue: "meteora-damm-v2",
    kind: "amm",
    ref: f.pool,
    legs: {
      a: { mint: f.mintA, decimals: f.decimalsA, raw: amountA },
      b: { mint: f.mintB, decimals: f.decimalsB, raw: amountB },
    },
    unclaimed: { a: 0n, b: f.feeOwedB ?? 0n },
  };
}

export function toPositionFromRaw(raw: Record<string, unknown>): Position {
  return toPosition({
    pool: strOf(raw, ["pool", "poolId", "pair"]),
    mintA: strOf(raw, ["tokenAMint", "mintA"]),
    decimalsA: numOf(raw, ["decimalsA"], 9),
    mintB: strOf(raw, ["tokenBMint", "mintB"]),
    decimalsB: numOf(raw, ["decimalsB"], 6),
    lpTokens: bigOf(raw, ["lpTokens", "lpAmount"]),
    lpSupply: bigOf(raw, ["lpSupply", "lpMintSupply"]),
    reserveA: bigOf(raw, ["reserveA", "vaultA"]),
    reserveB: bigOf(raw, ["reserveB", "vaultB"]),
    feeOwedB: bigOf(raw, ["feeOwedB", "feeB"]),
  });
}

async function liveFetch(): Promise<Record<string, unknown>[]> {
  const pkg = PKG;
  try {
    await import(pkg);
  } catch {
    throw new EngineError("DEPENDENCY_MISSING", `source/meteora-damm-v2: optional dependency ${PKG} is not installed`, {
      dependency: PKG,
    });
  }
  throw new EngineError(
    "NOT_IMPLEMENTED",
    "source/meteora-damm-v2: pass a fetcher to read(); the live path is in leaves/data-sources.md",
    { venue: "meteora-damm-v2" },
  );
}

export async function read(owner: string, opts: ReadOpts = {}, fetcher?: RawFetcher): Promise<Position[]> {
  const raws = await (fetcher ? fetcher(owner, opts) : liveFetch());
  return raws.map(toPositionFromRaw);
}
