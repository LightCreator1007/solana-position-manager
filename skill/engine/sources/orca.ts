import type { Position } from "../model.ts";
import { EngineError, classifyError } from "../errors.ts";
import { clmmTokenSplit } from "../il.ts";
import { strOf, numOf, bigOf } from "./extract.ts";
import { annotateMints } from "./mint.ts";
import {
  RpcClient,
  getMintDecimals,
  getParsedTokenAccounts,
  isPositionNft,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "./rpc.ts";

const PKG = "@orca-so/whirlpools";
const CLIENT_PKG = "@orca-so/whirlpools-client";
const KIT_PKG = "@solana/kit";

export interface ReadOpts {
  rpcUrl?: string;
  fetchImpl?: typeof fetch;
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

export interface OrcaSdkRow {
  whirlpool: string;
  tickLower: number;
  tickUpper: number;
  tickCurrent: number;
  mintA: string;
  decimalsA: number;
  mintB: string;
  decimalsB: number;
  liquidity: number;
  feeOwedB?: number;
}

// Derive pooled base-unit amounts from on-chain liquidity at the current tick,
// using the same concentrated-liquidity split as the IL math. Tick prices are
// raw (not decimal-adjusted), so the amounts come out in token base units. These
// are float-derived estimates rounded to base units, consistent with the
// engine's USD-as-estimate stance.
export function orcaRowToRaw(row: OrcaSdkRow): Record<string, unknown> {
  const low = Math.pow(1.0001, row.tickLower);
  const high = Math.pow(1.0001, row.tickUpper);
  const current = Math.pow(1.0001, row.tickCurrent);
  const { amountA, amountB } = clmmTokenSplit(row.liquidity, current, { low, high });
  const toBase = (n: number): string => BigInt(Math.max(0, Math.round(n))).toString();
  return {
    whirlpool: row.whirlpool,
    tickLowerIndex: row.tickLower,
    tickUpperIndex: row.tickUpper,
    tickCurrentIndex: row.tickCurrent,
    tokenMintA: row.mintA,
    decimalsA: row.decimalsA,
    tokenMintB: row.mintB,
    decimalsB: row.decimalsB,
    amountA: toBase(amountA),
    amountB: toBase(amountB),
    feeOwedB: toBase(row.feeOwedB ?? 0),
  };
}

// Read-only discovery of candidate position NFT mints for an owner. Uses the
// parsed token-account RPC under both token programs, so nothing is byte-decoded.
export async function discoverPositionMints(owner: string, opts: ReadOpts = {}): Promise<string[]> {
  if (!opts.rpcUrl) {
    throw new EngineError("INVALID_INPUT", "orca.discoverPositionMints: rpcUrl is required", { owner });
  }
  const rpc = new RpcClient(opts.rpcUrl, { fetchImpl: opts.fetchImpl });
  const mints: string[] = [];
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    const accounts = await getParsedTokenAccounts(rpc, owner, programId);
    for (const acc of accounts) if (isPositionNft(acc)) mints.push(acc.mint);
  }
  return mints;
}

async function liveFetch(owner: string, opts: ReadOpts): Promise<Record<string, unknown>[]> {
  if (!opts.rpcUrl) {
    throw new EngineError("INVALID_INPUT", "source/orca: rpcUrl is required for the live path", { owner });
  }
  let sdk: Record<string, unknown>;
  let kit: Record<string, unknown>;
  try {
    sdk = (await import(PKG)) as Record<string, unknown>;
  } catch {
    throw new EngineError("DEPENDENCY_MISSING", `source/orca: optional dependency ${PKG} is not installed`, {
      dependency: PKG,
    });
  }
  try {
    kit = (await import(KIT_PKG)) as Record<string, unknown>;
  } catch {
    throw new EngineError("DEPENDENCY_MISSING", `source/orca: optional dependency ${KIT_PKG} is not installed`, {
      dependency: KIT_PKG,
    });
  }

  let client: Record<string, unknown> = {};
  try {
    client = (await import(CLIENT_PKG)) as Record<string, unknown>;
  } catch {
    client = {};
  }

  const createSolanaRpc = kit.createSolanaRpc as ((url: string) => unknown) | undefined;
  const toAddress = kit.address as ((s: string) => unknown) | undefined;
  const fetchPositionsForOwner = sdk.fetchPositionsForOwner as
    | ((rpc: unknown, owner: unknown) => Promise<unknown[]>)
    | undefined;
  // fetchWhirlpool moved from the SDK facade to the generated client package
  const fetchWhirlpool = (sdk.fetchWhirlpool ?? client.fetchWhirlpool) as
    | ((rpc: unknown, addr: unknown) => Promise<unknown>)
    | undefined;
  if (!createSolanaRpc || !toAddress || !fetchPositionsForOwner || !fetchWhirlpool) {
    throw new EngineError("DEPENDENCY_MISSING", "source/orca: installed SDK is missing the read functions this path uses", {
      needs: "createSolanaRpc, address, fetchPositionsForOwner, fetchWhirlpool",
      note: "see leaves/data-sources.md for the version field map",
    });
  }

  try {
    const rpc = createSolanaRpc(opts.rpcUrl);
    const client = new RpcClient(opts.rpcUrl, { fetchImpl: opts.fetchImpl });
    const positions = await fetchPositionsForOwner(rpc, toAddress(owner));
    const pools = new Map<string, { tickCurrent: number; mintA: string; mintB: string }>();
    const raws: Record<string, unknown>[] = [];

    for (const pos of positions) {
      const data = ((pos as { data?: Record<string, unknown> }).data ?? pos) as Record<string, unknown>;
      const whirlpool = strOf(data, ["whirlpool", "pool"]);
      if (!whirlpool) continue;
      if (!pools.has(whirlpool)) {
        const poolAccount = (await fetchWhirlpool(rpc, toAddress(whirlpool))) as { data?: Record<string, unknown> };
        const poolData = (poolAccount.data ?? poolAccount) as Record<string, unknown>;
        pools.set(whirlpool, {
          tickCurrent: numOf(poolData, ["tickCurrentIndex", "tickCurrent"]),
          mintA: strOf(poolData, ["tokenMintA", "mintA"]),
          mintB: strOf(poolData, ["tokenMintB", "mintB"]),
        });
      }
      const pool = pools.get(whirlpool)!;
      const [decimalsA, decimalsB] = await Promise.all([
        getMintDecimals(client, pool.mintA),
        getMintDecimals(client, pool.mintB),
      ]);
      raws.push(
        orcaRowToRaw({
          whirlpool,
          tickLower: numOf(data, ["tickLowerIndex", "tickLower"]),
          tickUpper: numOf(data, ["tickUpperIndex", "tickUpper"]),
          tickCurrent: pool.tickCurrent,
          mintA: pool.mintA,
          decimalsA,
          mintB: pool.mintB,
          decimalsB,
          liquidity: Number(bigOf(data, ["liquidity"])),
          feeOwedB: Number(bigOf(data, ["feeOwedB", "feeOwedY"])),
        }),
      );
    }
    return raws;
  } catch (err) {
    throw classifyError(err);
  }
}

export async function read(owner: string, opts: ReadOpts = {}, fetcher?: RawFetcher): Promise<Position[]> {
  const raws = await (fetcher ? fetcher(owner, opts) : liveFetch(owner, opts));
  const positions = raws.map(toPositionFromRaw);
  if (opts.rpcUrl) await annotateMints(positions, opts.rpcUrl, opts.fetchImpl);
  return positions;
}
