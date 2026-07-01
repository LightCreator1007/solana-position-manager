import type { Position } from "./model.ts";
import { positionValueUsd } from "./pnl.ts";
import type { PriceBand } from "./il.ts";

export type StepKind = "collectFees" | "withdraw" | "close" | "swap" | "open" | "deposit";

export interface PlanStep {
  kind: StepKind;
  venue: string;
  ref: string;
  summary: string;
  // Machine-readable values for the executor (solana-dev), so it builds the exact
  // transaction the engine modelled rather than re-deriving it from the summary.
  params?: Record<string, unknown>;
}

export interface RebalancePlan {
  venue: string;
  ref: string;
  fromBand?: Position["band"];
  toBand: PriceBand;
  steps: PlanStep[];
  estNotionalUsd: number;
  estPositionUsd: number;
  // The confirm phrase is not fixed here. It is issued by safety.ts
  // `txConfirmPhrase` once the transaction is built and simulated, so it binds to
  // the exact bytes. Building it before the tx exists would let a swapped tx pass.
  confirmNote: string;
}

export function buildPlan(
  position: Position,
  toBand: PriceBand,
  priceUsd: Record<string, number>,
  opts: { includeSwap?: boolean } = {},
): RebalancePlan {
  if (!(toBand.low > 0 && toBand.high > toBand.low)) {
    throw new Error("buildPlan: require 0 < toBand.low < toBand.high");
  }
  const value = positionValueUsd(position, priceUsd);
  const venue = position.venue;
  const ref = position.ref;

  const steps: PlanStep[] = [
    { kind: "collectFees", venue, ref, summary: "collect unclaimed fees" },
    { kind: "withdraw", venue, ref, summary: "withdraw liquidity from the current range" },
    { kind: "close", venue, ref, summary: "close the current position" },
  ];
  if (opts.includeSwap) {
    steps.push({ kind: "swap", venue, ref, summary: "swap to the target deposit ratio" });
  }
  steps.push(
    {
      kind: "open",
      venue,
      ref,
      summary: `open a position over [${toBand.low.toFixed(4)}, ${toBand.high.toFixed(4)}]`,
      params: { low: toBand.low, high: toBand.high },
    },
    { kind: "deposit", venue, ref, summary: "deposit liquidity into the new range" },
  );

  return {
    venue,
    ref,
    fromBand: position.band,
    toBand,
    steps,
    estNotionalUsd: value,
    estPositionUsd: value,
    confirmNote: "confirm phrase is issued after simulation and binds to the transaction; see safety.ts txConfirmPhrase",
  };
}
