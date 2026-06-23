import type { PriceSource } from "./model.ts";

export interface PriceMap {
  usd: Record<string, number>;
  source: Record<string, PriceSource>;
}

export interface PriceOpts {
  fetchImpl?: typeof fetch;
  birdeyeApiKey?: string;
}

const JUPITER_URL = "https://api.jup.ag/price/v2";
const BIRDEYE_URL = "https://public-api.birdeye.so/defi/price";

export async function fetchJupiterPrices(
  mints: string[],
  fetchImpl: typeof fetch,
): Promise<Record<string, number>> {
  if (mints.length === 0) return {};
  const res = await fetchImpl(`${JUPITER_URL}?ids=${mints.join(",")}`);
  if (!res.ok) throw new Error(`jupiter price http ${res.status}`);
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
  return { usd, source };
}
