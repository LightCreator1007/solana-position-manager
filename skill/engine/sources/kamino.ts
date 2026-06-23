import type { Position } from "../model.ts";
import { strOf, numOf, bigOf } from "./extract.ts";

const PKG = "@kamino-finance/kliquidity-sdk";

export interface ReadOpts {
  rpcUrl?: string;
}

export type RawFetcher = (owner: string, opts: ReadOpts) => Promise<Record<string, unknown>[]>;

export interface KaminoFields {
  strategy: string;
  mintA: string;
  decimalsA: number;
  mintB: string;
  decimalsB: number;
  amountA: bigint;
  amountB: bigint;
  tickLower?: number;
  tickUpper?: number;
  tickCurrent?: number;
}

export function toPosition(f: KaminoFields): Position {
  const position: Position = {
    venue: "kamino",
    kind: "vault",
    ref: f.strategy,
    legs: {
      a: { mint: f.mintA, decimals: f.decimalsA, raw: f.amountA },
      b: { mint: f.mintB, decimals: f.decimalsB, raw: f.amountB },
    },
    unclaimed: { a: 0n, b: 0n },
  };
  if (f.tickLower !== undefined && f.tickUpper !== undefined) {
    position.band = { unit: "tick", lower: f.tickLower, upper: f.tickUpper, inclusiveUpper: false };
    if (f.tickCurrent !== undefined) {
      position.inRange = f.tickCurrent >= f.tickLower && f.tickCurrent < f.tickUpper;
    }
  }
  return position;
}

export function toPositionFromRaw(raw: Record<string, unknown>): Position {
  const hasRange = "tickLower" in raw || "tickLowerIndex" in raw;
  return toPosition({
    strategy: strOf(raw, ["strategy", "address", "vault"]),
    mintA: strOf(raw, ["tokenAMint", "mintA"]),
    decimalsA: numOf(raw, ["decimalsA"], 9),
    mintB: strOf(raw, ["tokenBMint", "mintB"]),
    decimalsB: numOf(raw, ["decimalsB"], 6),
    amountA: bigOf(raw, ["amountA", "tokenA"]),
    amountB: bigOf(raw, ["amountB", "tokenB"]),
    ...(hasRange
      ? {
          tickLower: numOf(raw, ["tickLower", "tickLowerIndex"]),
          tickUpper: numOf(raw, ["tickUpper", "tickUpperIndex"]),
          tickCurrent: numOf(raw, ["tickCurrent", "tickCurrentIndex"]),
        }
      : {}),
  });
}

async function liveFetch(): Promise<Record<string, unknown>[]> {
  const pkg = PKG;
  try {
    await import(pkg);
  } catch {
    throw new Error(`source/kamino: optional dependency ${PKG} is not installed`);
  }
  throw new Error("source/kamino: live fetch wiring lives in leaves/data-sources.md; pass a fetcher to read()");
}

export async function read(owner: string, opts: ReadOpts = {}, fetcher?: RawFetcher): Promise<Position[]> {
  const raws = await (fetcher ? fetcher(owner, opts) : liveFetch());
  return raws.map(toPositionFromRaw);
}
