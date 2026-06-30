import type { PriceSource } from "./model.ts";
import { EngineError, safeEndpoint } from "./errors.ts";

export interface PriceMap {
  usd: Record<string, number>;
  source: Record<string, PriceSource>;
  // When these prices were fetched, in unix seconds. Without it the "use a fresh
  // price for liquidation and sizing" rule cannot be enforced in code.
  fetchedAtUnix: number;
}

export interface PriceOpts {
  fetchImpl?: typeof fetch;
  birdeyeApiKey?: string;
  // Injectable clock for tests; defaults to wall-clock unix seconds.
  nowUnix?: number;
}

// Guard the liquidation and sizing paths. Throws a typed STALE_PRICE error when
// the price map is older than maxAgeSec, so a cached price can never silently
// drive a critical decision.
export function assertFresh(prices: PriceMap, maxAgeSec: number, nowUnix?: number): void {
  const now = nowUnix ?? Math.floor(Date.now() / 1000);
  const age = now - prices.fetchedAtUnix;
  if (age > maxAgeSec) {
    throw new EngineError("STALE_PRICE", `prices are ${age}s old, limit is ${maxAgeSec}s`, {
      ageSec: age,
      maxAgeSec,
    });
  }
}

const JUPITER_URL = "https://api.jup.ag/price/v2";
const BIRDEYE_URL = "https://public-api.birdeye.so/defi/price";

export async function fetchJupiterPrices(
  mints: string[],
  fetchImpl: typeof fetch,
): Promise<Record<string, number>> {
  if (mints.length === 0) return {};
  const res = await fetchImpl(`${JUPITER_URL}?ids=${mints.join(",")}`);
  if (!res.ok) {
    throw new EngineError("RPC_FAILED", `jupiter price http ${res.status}`, { endpoint: safeEndpoint(JUPITER_URL) });
  }
  const body = (await res.json()) as { data?: Record<string, { price?: string | number } | null> };
  const out: Record<string, number> = {};
  for (const mint of mints) {
    const raw = body.data?.[mint]?.price;
    const value = typeof raw === "string" ? Number(raw) : raw;
    if (typeof value === "number" && value > 0) out[mint] = value;
  }
  return out;
}

export async function fetchBirdeyePrices(
  mints: string[],
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const mint of mints) {
    const res = await fetchImpl(`${BIRDEYE_URL}?address=${mint}`, {
      headers: { "X-API-KEY": apiKey, "x-chain": "solana" },
    });
    if (!res.ok) continue;
    const body = (await res.json()) as { data?: { value?: number } };
    const value = body.data?.value;
    if (typeof value === "number" && value > 0) out[mint] = value;
  }
  return out;
}

// Relative gap between two quotes in basis points, taken against their midpoint
// so it is symmetric. Used to catch a manipulated or thinly-traded mint where
// one source has drifted far from the other.
export function priceDivergenceBps(a: number, b: number): number {
  const mid = (a + b) / 2;
  if (!(mid > 0)) return 0;
  return (Math.abs(a - b) / mid) * 10_000;
}

export interface PriceCheck {
  mint: string;
  jupiter: number;
  birdeye: number;
  divergenceBps: number;
}

// Fetch the same mints from both sources and report divergence for those each
// source priced. This is the cross-check the single-source usdPrices cannot do,
// because there Birdeye only runs for mints Jupiter could not resolve.
export async function crossCheckPrices(mints: string[], opts: PriceOpts = {}): Promise<PriceCheck[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  if (!opts.birdeyeApiKey) {
    throw new EngineError("PRICE_UNAVAILABLE", "crossCheckPrices needs a second source (Birdeye key)");
  }
  const [jup, be] = await Promise.all([
    fetchJupiterPrices(mints, fetchImpl).catch(() => ({}) as Record<string, number>),
    fetchBirdeyePrices(mints, opts.birdeyeApiKey, fetchImpl).catch(() => ({}) as Record<string, number>),
  ]);
  const checks: PriceCheck[] = [];
  for (const mint of mints) {
    const a = jup[mint];
    const b = be[mint];
    if (typeof a === "number" && typeof b === "number") {
      checks.push({ mint, jupiter: a, birdeye: b, divergenceBps: priceDivergenceBps(a, b) });
    }
  }
  return checks;
}

// Block a critical path when any cross-checked mint diverges past maxBps.
export function assertPricesAgree(checks: PriceCheck[], maxBps: number): void {
  for (const c of checks) {
    if (c.divergenceBps > maxBps) {
      throw new EngineError("PRICE_DISAGREEMENT", `${c.mint}: sources diverge ${c.divergenceBps.toFixed(0)} bps`, {
        mint: c.mint,
        divergenceBps: Math.round(c.divergenceBps),
        maxBps,
      });
    }
  }
}

export async function usdPrices(mints: string[], opts: PriceOpts = {}): Promise<PriceMap> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const usd: Record<string, number> = {};
  const source: Record<string, PriceSource> = {};
  const remaining = new Set(mints);

  try {
    const jup = await fetchJupiterPrices([...remaining], fetchImpl);
    for (const [mint, price] of Object.entries(jup)) {
      usd[mint] = price;
      source[mint] = "jupiter";
      remaining.delete(mint);
    }
  } catch {
    // fall through to the next source
  }

  if (remaining.size > 0 && opts.birdeyeApiKey) {
    try {
      const be = await fetchBirdeyePrices([...remaining], opts.birdeyeApiKey, fetchImpl);
      for (const [mint, price] of Object.entries(be)) {
        usd[mint] = price;
        source[mint] = "birdeye";
        remaining.delete(mint);
      }
    } catch {
      // fall through to stale
    }
  }

  for (const mint of remaining) {
    usd[mint] = 0;
    source[mint] = "stale";
  }
  return { usd, source, fetchedAtUnix: opts.nowUnix ?? Math.floor(Date.now() / 1000) };
}
