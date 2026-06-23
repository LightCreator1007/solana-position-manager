import { test } from "node:test";
import assert from "node:assert/strict";
import { guard, type SafetyCaps, type PlanMetrics, type SafetyContext } from "./safety.ts";

const caps: SafetyCaps = {
  maxSlippageBps: 50,
  maxNotionalUsd: 10_000,
  maxPositionUsd: 10_000,
  maxDailyLossUsd: 500,
};

const metrics: PlanMetrics = {
  notionalUsd: 3000,
  positionUsd: 3000,
  slippageBps: 20,
  txBase64: "AA==",
};

function ctx(over: Partial<SafetyContext> = {}): SafetyContext {
  return {
    dryRun: false,
    requireConfirm: true,
    killSwitch: false,
    typedPhrase: "CONFIRM REBALANCE orca Whirl123",
    expectedPhrase: "CONFIRM REBALANCE orca Whirl123",
    dailyRealizedLossUsd: 0,
    simulate: async () => ({ err: null }),
    ...over,
  };
}

test("kill switch is a hard stop", async () => {
  await assert.rejects(() => guard(metrics, caps, ctx({ killSwitch: true })), /kill switch/);
});

test("missing caps throw", async () => {
  await assert.rejects(() => guard(metrics, { ...caps, maxNotionalUsd: 0 }, ctx()), /maxNotionalUsd/);
});

test("cap breaches throw", async () => {
  await assert.rejects(() => guard({ ...metrics, slippageBps: 80 }, caps, ctx()), /slippage/);
  await assert.rejects(() => guard({ ...metrics, notionalUsd: 20_000 }, caps, ctx()), /notional/);
  await assert.rejects(() => guard(metrics, caps, ctx({ dailyRealizedLossUsd: 600 })), /daily loss/);
});

test("a failed simulation throws", async () => {
  await assert.rejects(() => guard(metrics, caps, ctx({ simulate: async () => ({ err: { code: 1 } }) })), /simulation failed/);
});

test("dry run simulates but does not clear submission", async () => {
  const r = await guard(metrics, caps, ctx({ dryRun: true }));
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /DRY_RUN/);
});

test("a wrong confirmation phrase blocks submission", async () => {
  const r = await guard(metrics, caps, ctx({ typedPhrase: "nope" }));
  assert.equal(r.ok, false);
});

test("correct phrase with live mode clears submission", async () => {
  const r = await guard(metrics, caps, ctx());
  assert.deepEqual(r, { ok: true });
});
