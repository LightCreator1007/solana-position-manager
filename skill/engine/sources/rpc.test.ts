import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RpcClient,
  getParsedTokenAccounts,
  getMintDecimals,
  isPositionNft,
} from "./rpc.ts";
import { EngineError } from "../errors.ts";

function router(routes: Record<string, unknown>): typeof fetch {
  return (async (_url: string, init?: { body?: string }) => {
    const method = JSON.parse(init?.body ?? "{}").method as string;
    if (!(method in routes)) {
      return { ok: true, status: 200, json: async () => ({ error: { message: `no route for ${method}` } }) };
    }
    return { ok: true, status: 200, json: async () => ({ result: routes[method] }) };
  }) as unknown as typeof fetch;
}

const tokenAccountsPayload = {
  value: [
    { account: { data: { parsed: { info: { mint: "PosMint1", tokenAmount: { amount: "1", decimals: 0 } } } } } },
    { account: { data: { parsed: { info: { mint: "UsdcAta", tokenAmount: { amount: "5000000", decimals: 6 } } } } } },
  ],
};

test("RpcClient returns the result on success", async () => {
  const rpc = new RpcClient("https://rpc.test", { fetchImpl: router({ getHealth: "ok" }) });
  assert.equal(await rpc.call("getHealth"), "ok");
});

test("RpcClient surfaces a typed error on a json-rpc error", async () => {
  const rpc = new RpcClient("https://rpc.test/?api-key=SECRET", { fetchImpl: router({}) });
  await assert.rejects(
    () => rpc.call("getThing"),
    (e: unknown) => e instanceof EngineError && e.code === "RPC_FAILED" && e.details?.endpoint === "https://rpc.test",
  );
});

test("RpcClient surfaces a typed error on a non-200", async () => {
  const fetchImpl = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
  const rpc = new RpcClient("https://rpc.test", { fetchImpl });
  await assert.rejects(() => rpc.call("getHealth"), (e: unknown) => e instanceof EngineError && e.code === "RPC_FAILED");
});

test("getParsedTokenAccounts maps the parsed shape", async () => {
  const rpc = new RpcClient("https://rpc.test", { fetchImpl: router({ getTokenAccountsByOwner: tokenAccountsPayload }) });
  const accounts = await getParsedTokenAccounts(rpc, "owner");
  assert.equal(accounts.length, 2);
  assert.equal(accounts[0].mint, "PosMint1");
  assert.equal(accounts[0].decimals, 0);
});

test("isPositionNft keeps single indivisible units only", () => {
  assert.ok(isPositionNft({ mint: "m", amount: "1", decimals: 0 }));
  assert.ok(!isPositionNft({ mint: "m", amount: "5000000", decimals: 6 }));
  assert.ok(!isPositionNft({ mint: "m", amount: "2", decimals: 0 }));
});

test("getMintDecimals reads decimals and fails clearly when absent", async () => {
  const ok = new RpcClient("https://rpc.test", {
    fetchImpl: router({ getAccountInfo: { value: { data: { parsed: { info: { decimals: 6 } } } } } }),
  });
  assert.equal(await getMintDecimals(ok, "mint"), 6);

  const bad = new RpcClient("https://rpc.test", { fetchImpl: router({ getAccountInfo: { value: null } }) });
  await assert.rejects(() => getMintDecimals(bad, "mint"), (e: unknown) => e instanceof EngineError);
});
