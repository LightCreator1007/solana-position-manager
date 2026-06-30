import type { Position } from "../model.ts";
import { EngineError } from "../errors.ts";
import { strOf, numOf, bigOf } from "./extract.ts";
import { ammAmountsFromShare } from "./amm.ts";
import { annotateMints } from "./mint.ts";

const PKG = "@raydium-io/raydium-sdk-v2";

export interface ReadOpts {
  rpcUrl?: string;
  fetchImpl?: typeof fetch;
}

export type RawFetcher = (owner: string, opts: ReadOpts) => Promise<Record<string, unknown>[]>;

export interface RaydiumCpmmFields {
  poolId: string;
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

export function toPosition(f: RaydiumCpmmFields): Position {
  const { amountA, amountB } = ammAmountsFromShare(f.lpTokens, f.lpSupply, f.reserveA, f.reserveB);
  return {
    venue: "raydium-cpmm",
    kind: "amm",
    ref: f.poolId,
    legs: {
      a: { mint: f.mintA, decimals: f.decimalsA, raw: amountA },
      b: { mint: f.mintB, decimals: f.decimalsB, raw: amountB },
    },
    unclaimed: { a: 0n, b: f.feeOwedB ?? 0n },
  };
}

export function toPositionFromRaw(raw: Record<string, unknown>): Position {
  return toPosition({
    poolId: strOf(raw, ["poolId", "pool", "ammId"]),
    mintA: strOf(raw, ["mintA", "tokenMintA"]),
    decimalsA: numOf(raw, ["decimalsA"], 9),
    mintB: strOf(raw, ["mintB", "tokenMintB"]),
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
    throw new EngineError("DEPENDENCY_MISSING", `source/raydium-cpmm: optional dependency ${PKG} is not installed`, {
      dependency: PKG,
    });
  }
  throw new EngineError(
    "NOT_IMPLEMENTED",
    "source/raydium-cpmm: pass a fetcher to read(); the live path is in leaves/data-sources.md",
    { venue: "raydium-cpmm" },
  );
}

export async function read(owner: string, opts: ReadOpts = {}, fetcher?: RawFetcher): Promise<Position[]> {
  const raws = await (fetcher ? fetcher(owner, opts) : liveFetch());
  const positions = raws.map(toPositionFromRaw);
  if (opts.rpcUrl) await annotateMints(positions, opts.rpcUrl, opts.fetchImpl);
  return positions;
}
