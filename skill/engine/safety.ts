// Execution gate. throws on a hard violation; returns { ok: false } when simulated
// only or awaiting confirmation; returns { ok: true } only when cleared to submit.

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
  typedPhrase: string | null;
  expectedPhrase: string;
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
  if (ctx.requireConfirm && ctx.typedPhrase !== ctx.expectedPhrase) {
    return { ok: false, reason: `awaiting typed confirmation: ${ctx.expectedPhrase}` };
  }
  return { ok: true };
}
