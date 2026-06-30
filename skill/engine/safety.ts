// Execution gate. throws on a hard violation; returns { ok: false } when simulated
// only or awaiting confirmation; returns { ok: true } only when cleared to submit.

import { createHash } from "node:crypto";

// The phrase a human types to authorise a submission. It binds to the exact
// transaction bytes that were simulated, so a transaction swapped after the
// human read the plan no longer matches, and the phrase cannot be precomputed
// before the transaction exists. The venue and ref keep it human-readable.
export function txConfirmPhrase(venue: string, ref: string, txBase64: string): string {
  const hash = createHash("sha256").update(txBase64).digest("hex").slice(0, 8);
  return `CONFIRM REBALANCE ${venue} ${ref.slice(0, 8)} ${hash}`;
}

export interface SafetyCaps {
  maxSlippageBps: number;
  maxNotionalUsd: number;
  maxPositionUsd: number;
  maxDailyLossUsd: number;
}

export interface PlanMetrics {
  notionalUsd: number;
  positionUsd: number;
  slippageBps: number;
  txBase64: string;
}

export interface SafetyContext {
  dryRun: boolean;
  requireConfirm: boolean;
  killSwitch: boolean;
  // The phrase the human typed. The expected phrase is derived from the
  // simulated transaction, not supplied by the caller, so it cannot drift.
  typedPhrase: string | null;
  venue: string;
  ref: string;
  dailyRealizedLossUsd: number;
  simulate: (txBase64: string) => Promise<{ err: unknown; logs?: string[] }>;
}

export type GuardResult = { ok: true } | { ok: false; reason: string };

function requirePositive(label: string, value: number): void {
  if (!(value > 0)) throw new Error(`safety: ${label} must be set and greater than zero`);
}

export async function guard(
  metrics: PlanMetrics,
  caps: SafetyCaps,
  ctx: SafetyContext,
): Promise<GuardResult> {
  if (ctx.killSwitch) throw new Error("safety: kill switch engaged, refusing to proceed");

  requirePositive("maxSlippageBps", caps.maxSlippageBps);
  requirePositive("maxNotionalUsd", caps.maxNotionalUsd);
  requirePositive("maxPositionUsd", caps.maxPositionUsd);
  requirePositive("maxDailyLossUsd", caps.maxDailyLossUsd);

  if (metrics.slippageBps > caps.maxSlippageBps) throw new Error("safety: slippage exceeds cap");
  if (metrics.notionalUsd > caps.maxNotionalUsd) throw new Error("safety: notional exceeds cap");
  if (metrics.positionUsd > caps.maxPositionUsd) throw new Error("safety: resulting position exceeds cap");
  if (ctx.dailyRealizedLossUsd > caps.maxDailyLossUsd) throw new Error("safety: daily loss cap reached");

  const sim = await ctx.simulate(metrics.txBase64);
  if (sim.err) throw new Error(`safety: simulation failed: ${JSON.stringify(sim.err)}`);

  if (ctx.dryRun) return { ok: false, reason: "DRY_RUN active: simulated only, not submitting" };

  // Derive the expected phrase from the bytes we just simulated. The submission
  // clears only when the human typed the phrase for this exact transaction.
  const expectedPhrase = txConfirmPhrase(ctx.venue, ctx.ref, metrics.txBase64);
  if (ctx.requireConfirm && ctx.typedPhrase !== expectedPhrase) {
    return { ok: false, reason: `awaiting typed confirmation: ${expectedPhrase}` };
  }
  return { ok: true };
}
