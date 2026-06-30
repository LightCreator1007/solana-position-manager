import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMintTraits, withTokenTraits, getMintTraits, annotateMints } from "./mint.ts";
import { RpcClient, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "./rpc.ts";
import { EngineError } from "../errors.ts";
import { escalations } from "../health.ts";
import type { Position, Snapshot } from "../model.ts";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const HOOK = "HookMint1111111111111111111111111111111111";
const FEE = "FeeMint11111111111111111111111111111111111";

// A fake fetch that dispatches getAccountInfo by the mint in params[0].
function mintRouter(byMint: Record<string, unknown>): typeof fetch {
  return (async (_url: string, init?: { body?: string }) => {
    const req = JSON.parse(init?.body ?? "{}") as { method: string; params: unknown[] };
    if (req.method !== "getAccountInfo") {
      return { ok: true, status: 200, json: async () => ({ result: null }) };
    }
    const mint = req.params[0] as string;
    return { ok: true, status: 200, json: async () => ({ result: { value: byMint[mint] ?? null } }) };
  }) as unknown as typeof fetch;
}

const splMint = { owner: TOKEN_PROGRAM_ID, data: { parsed: { info: { decimals: 6 } } } };
const feeMint = {
  owner: TOKEN_2022_PROGRAM_ID,
  data: { parsed: { info: { decimals: 6, extensions: [
    { extension: "transferFeeConfig", state: { newerTransferFee: { transferFeeBasisPoints: 250 } } },
  ] } } },
};
const hookMint = {
  owner: TOKEN_2022_PROGRAM_ID,
  data: { parsed: { info: { decimals: 9, extensions: [
    { extension: "transferHook", state: { programId: "Hook9999999999999999999999999999999999999" } },
  ] } } },
};

test("parseMintTraits reads the owning program from the account owner", () => {
  assert.equal(parseMintTraits(splMint).tokenProgram, "spl-token");
  assert.equal(parseMintTraits(hookMint).tokenProgram, "token-2022");
});

test("parseMintTraits extracts a transfer fee and a transfer hook from extensions", () => {
  const fee = parseMintTraits(feeMint);
  assert.equal(fee.transferFeeBps, 250);
  assert.equal(fee.hasTransferHook, false);

  const hook = parseMintTraits(hookMint);
  assert.equal(hook.hasTransferHook, true);
  assert.equal(hook.transferFeeBps, 0);
});

test("a transfer hook set to the default program id is not an active hook", () => {
  const noHook = parseMintTraits({
    owner: TOKEN_2022_PROGRAM_ID,
    data: { parsed: { info: { extensions: [
      { extension: "transferHook", state: { programId: "11111111111111111111111111111111" } },
    ] } } },
  });
  assert.equal(noHook.hasTransferHook, false);
});

test("getMintTraits reads a mint account over the rpc client", async () => {
  const rpc = new RpcClient("https://rpc.test", { fetchImpl: mintRouter({ [FEE]: feeMint }) });
  const traits = await getMintTraits(rpc, FEE);
  assert.equal(traits.tokenProgram, "token-2022");
  assert.equal(traits.transferFeeBps, 250);
});

test("withTokenTraits stamps the program and fee onto the matching legs", () => {
  const positions: Position[] = [{
    venue: "orca", kind: "clmm", ref: "P",
    legs: { a: { mint: HOOK, decimals: 9, raw: 1n }, b: { mint: USDC, decimals: 6, raw: 1n } },
    unclaimed: { a: 0n, b: 0n },
  }];
  withTokenTraits(positions, {
    [HOOK]: { tokenProgram: "token-2022", transferFeeBps: 0, hasTransferHook: true },
    [USDC]: { tokenProgram: "spl-token", transferFeeBps: 0, hasTransferHook: false },
  });
  assert.equal(positions[0].legs.a.tokenProgram, "token-2022");
  assert.equal(positions[0].legs.a.hasTransferHook, true);
  assert.equal(positions[0].legs.b?.tokenProgram, "spl-token");
});

test("annotateMints reads each leg mint and makes the token-2022 escalation fire", async () => {
  const positions: Position[] = [{
    venue: "orca", kind: "clmm", ref: "P",
    legs: { a: { mint: HOOK, decimals: 9, raw: 1n }, b: { mint: USDC, decimals: 6, raw: 1n } },
    unclaimed: { a: 0n, b: 0n },
  }];
  await annotateMints(positions, "https://rpc.test", mintRouter({ [HOOK]: hookMint, [USDC]: splMint }));
  const snap: Snapshot = {
    takenAtUnix: 1, wallet: "W",
    priceUsd: { [HOOK]: 1, [USDC]: 1 }, priceSource: { [HOOK]: "jupiter", [USDC]: "jupiter" },
    positions,
  };
  assert.ok(escalations(snap).some((a) => a.code === "token-2022"));
});

test("annotateMints throws a typed error rather than presenting an unverified mint as safe", async () => {
  const positions: Position[] = [{
    venue: "orca", kind: "clmm", ref: "P",
    legs: { a: { mint: HOOK, decimals: 9, raw: 1n } },
    unclaimed: { a: 0n },
  }];
  const downFetch = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
  await assert.rejects(
    () => annotateMints(positions, "https://rpc.test", downFetch),
    (e: unknown) => e instanceof EngineError,
  );
});
