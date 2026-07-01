import { test } from "node:test";
import assert from "node:assert/strict";
import { usdPrices, assertFresh, priceDivergenceBps, crossCheckPrices, assertPricesAgree } from "./prices.ts";
import { EngineError } from "./errors.ts";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function fakeFetch(handler: (url: string) => { ok: boolean; status: number; body: unknown }): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    const r = handler(url);
    return { ok: r.ok, status: r.status, json: async () => r.body } as Response;
  }) as typeof fetch;
}

test("jupiter prices are labeled with their source", async () => {
  const fetchImpl = fakeFetch(() => ({
    ok: true,
    status: 200,
    body: { data: { [SOL]: { price: "150.5" }, [USDC]: { price: 1 } } },
  }));
  const result = await usdPrices([SOL, USDC], { fetchImpl });
  assert.equal(result.usd[SOL], 150.5);
  assert.equal(result.source[SOL], "jupiter");
  assert.equal(result.source[USDC], "jupiter");
});

test("missing mints fall back to birdeye", async () => {
  const fetchImpl = fakeFetch((url) => {
    if (url.includes("jup.ag")) return { ok: true, status: 200, body: { data: { [SOL]: { price: 150 } } } };
    return { ok: true, status: 200, body: { data: { value: 1 } } };
  });
  const result = await usdPrices([SOL, USDC], { fetchImpl, birdeyeApiKey: "key" });
  assert.equal(result.source[SOL], "jupiter");
  assert.equal(result.source[USDC], "birdeye");
  assert.equal(result.usd[USDC], 1);
});

test("unresolved mints are marked stale with zero", async () => {
  const fetchImpl = fakeFetch(() => ({ ok: false, status: 500, body: {} }));
  const result = await usdPrices([SOL], { fetchImpl });
  assert.equal(result.source[SOL], "stale");
  assert.equal(result.usd[SOL], 0);
});

test("a Jupiter API key is sent as a header to lift the public rate limit", async () => {
  let sentKey: string | undefined;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("jup")) sentKey = (init?.headers as Record<string, string> | undefined)?.["x-api-key"];
    return { ok: true, status: 200, json: async () => ({ data: { [SOL]: { price: 150 } } }) } as Response;
  }) as typeof fetch;
  await usdPrices([SOL], { fetchImpl, jupiterApiKey: "jk-123" });
  assert.equal(sentKey, "jk-123");
});

test("usdPrices stamps the fetch time so freshness can be checked", async () => {
  const fetchImpl = fakeFetch(() => ({ ok: true, status: 200, body: { data: { [SOL]: { price: 150 } } } }));
  const result = await usdPrices([SOL], { fetchImpl, nowUnix: 1_000_000 });
  assert.equal(result.fetchedAtUnix, 1_000_000);
});

test("assertFresh throws on a price older than the limit and passes on a fresh one", async () => {
  const fetchImpl = fakeFetch(() => ({ ok: true, status: 200, body: { data: { [SOL]: { price: 150 } } } }));
  const prices = await usdPrices([SOL], { fetchImpl, nowUnix: 1_000_000 });
  assert.throws(
    () => assertFresh(prices, 30, 1_000_100),
    (e: unknown) => e instanceof EngineError && e.code === "STALE_PRICE",
  );
  assert.doesNotThrow(() => assertFresh(prices, 30, 1_000_010));
});

test("priceDivergenceBps measures the gap between two sources", () => {
  assert.equal(priceDivergenceBps(100, 100), 0);
  assert.ok(Math.abs(priceDivergenceBps(100, 101) - 99.5) < 0.5);
});

test("crossCheckPrices reports divergence for mints both sources priced", async () => {
  const fetchImpl = fakeFetch((url) => {
    if (url.includes("jup.ag")) return { ok: true, status: 200, body: { data: { [SOL]: { price: 100 } } } };
    return { ok: true, status: 200, body: { data: { value: 130 } } };
  });
  const checks = await crossCheckPrices([SOL], { fetchImpl, birdeyeApiKey: "key" });
  assert.equal(checks.length, 1);
  assert.ok(checks[0].divergenceBps > 2000);
});

test("assertPricesAgree throws when a manipulated source diverges past the limit", async () => {
  const fetchImpl = fakeFetch((url) => {
    if (url.includes("jup.ag")) return { ok: true, status: 200, body: { data: { [SOL]: { price: 100 } } } };
    return { ok: true, status: 200, body: { data: { value: 130 } } };
  });
  const checks = await crossCheckPrices([SOL], { fetchImpl, birdeyeApiKey: "key" });
  assert.throws(
    () => assertPricesAgree(checks, 500),
    (e: unknown) => e instanceof EngineError && e.code === "PRICE_DISAGREEMENT",
  );
  assert.doesNotThrow(() => assertPricesAgree(checks, 5000));
});
