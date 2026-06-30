import type { Position } from "../model.ts";
import { EngineError } from "../errors.ts";
import { strOf, numOf, bigOf } from "./extract.ts";
import { annotateMints } from "./mint.ts";

const PKG = "@meteora-ag/dlmm";

export interface ReadOpts {
  rpcUrl?: string;
  fetchImpl?: typeof fetch;
}

export type RawFetcher = (owner: string, opts: ReadOpts) => Promise<Record<string, unknown>[]>;

export interface MeteoraFields {
  lbPair: string;
  lowerBinId: number;
  upperBinId: number;
  activeId: number;
  mintX: string;
  decimalsX: number;
  mintY: string;
  decimalsY: number;
  amountX: bigint;
  amountY: bigint;
  feeY: bigint;
}

export function toPosition(f: MeteoraFields): Position {
  return {
    venue: "meteora-dlmm",
    kind: "clmm",
    ref: f.lbPair,
    band: { unit: "bin", lower: f.lowerBinId, upper: f.upperBinId, inclusiveUpper: true },
    inRange: f.activeId >= f.lowerBinId && f.activeId <= f.upperBinId,
    legs: {
      a: { mint: f.mintX, decimals: f.decimalsX, raw: f.amountX },
      b: { mint: f.mintY, decimals: f.decimalsY, raw: f.amountY },
    },
    unclaimed: { a: 0n, b: f.feeY },
  };
}

export function toPositionFromRaw(raw: Record<string, unknown>): Position {
  return toPosition({
    lbPair: strOf(raw, ["lbPair", "pair", "pool"]),
    lowerBinId: numOf(raw, ["lowerBinId", "minBinId"]),
    upperBinId: numOf(raw, ["upperBinId", "maxBinId"]),
    activeId: numOf(raw, ["activeId", "activeBin"]),
    mintX: strOf(raw, ["tokenXMint", "mintX"]),
    decimalsX: numOf(raw, ["decimalsX"], 9),
    mintY: strOf(raw, ["tokenYMint", "mintY"]),
    decimalsY: numOf(raw, ["decimalsY"], 6),
    amountX: bigOf(raw, ["amountX", "tokenX"]),
    amountY: bigOf(raw, ["amountY", "tokenY"]),
    feeY: bigOf(raw, ["feeY", "feeOwedY"]),
  });
}

async function liveFetch(): Promise<Record<string, unknown>[]> {
  const pkg = PKG;
  try {
    await import(pkg);
  } catch {
    throw new EngineError("DEPENDENCY_MISSING", `source/meteora: optional dependency ${PKG} is not installed`, {
      dependency: PKG,
    });
  }
  throw new EngineError(
    "NOT_IMPLEMENTED",
    "source/meteora: pass a fetcher to read(); the live path is in leaves/data-sources.md",
    { venue: "meteora-dlmm" },
  );
}

export async function read(owner: string, opts: ReadOpts = {}, fetcher?: RawFetcher): Promise<Position[]> {
  const raws = await (fetcher ? fetcher(owner, opts) : liveFetch());
  const positions = raws.map(toPositionFromRaw);
  if (opts.rpcUrl) await annotateMints(positions, opts.rpcUrl, opts.fetchImpl);
  return positions;
}
