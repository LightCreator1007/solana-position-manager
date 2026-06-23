import type { Position } from "../model.ts";
import { strOf, numOf, bigOf } from "./extract.ts";

const PKG = "@orca-so/whirlpools";

export interface ReadOpts {
  rpcUrl?: string;
}

export type RawFetcher = (owner: string, opts: ReadOpts) => Promise<Record<string, unknown>[]>;

export interface OrcaFields {
  whirlpool: string;
  tickLower: number;
  tickUpper: number;
  tickCurrent: number;
  mintA: string;
  decimalsA: number;
  mintB: string;
  decimalsB: number;
  amountA: bigint;
  amountB: bigint;
  feeOwedB: bigint;
}

export function toPosition(f: OrcaFields): Position {
  return {
    venue: "orca",
    kind: "clmm",
    ref: f.whirlpool,
    band: { unit: "tick", lower: f.tickLower, upper: f.tickUpper, inclusiveUpper: false },
    inRange: f.tickCurrent >= f.tickLower && f.tickCurrent < f.tickUpper,
    legs: {
      a: { mint: f.mintA, decimals: f.decimalsA, raw: f.amountA },
      b: { mint: f.mintB, decimals: f.decimalsB, raw: f.amountB },
    },
    unclaimed: { a: 0n, b: f.feeOwedB },
  };
}

export function toPositionFromRaw(raw: Record<string, unknown>): Position {
  return toPosition({
    whirlpool: strOf(raw, ["whirlpool", "pool", "address"]),
    tickLower: numOf(raw, ["tickLowerIndex", "tickLower"]),
    tickUpper: numOf(raw, ["tickUpperIndex", "tickUpper"]),
    tickCurrent: numOf(raw, ["tickCurrentIndex", "tickCurrent"]),
    mintA: strOf(raw, ["tokenMintA", "mintA"]),
    decimalsA: numOf(raw, ["decimalsA"], 9),
    mintB: strOf(raw, ["tokenMintB", "mintB"]),
    decimalsB: numOf(raw, ["decimalsB"], 6),
    amountA: bigOf(raw, ["amountA", "tokenA"]),
    amountB: bigOf(raw, ["amountB", "tokenB"]),
    feeOwedB: bigOf(raw, ["feeOwedB", "feeB"]),
  });
}

async function liveFetch(): Promise<Record<string, unknown>[]> {
  const pkg = PKG;
  try {
    await import(pkg);
  } catch {
    throw new Error(`source/orca: optional dependency ${PKG} is not installed`);
  }
  throw new Error("source/orca: live fetch wiring lives in leaves/data-sources.md; pass a fetcher to read()");
}

export async function read(owner: string, opts: ReadOpts = {}, fetcher?: RawFetcher): Promise<Position[]> {
  const raws = await (fetcher ? fetcher(owner, opts) : liveFetch());
  return raws.map(toPositionFromRaw);
}
