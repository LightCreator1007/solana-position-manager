import { test } from "node:test";
import assert from "node:assert/strict";
import { usdPrices } from "./prices.ts";

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
