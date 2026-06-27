import { bandFromWidth, ilClmm, breakEvenFeeApr, outOfRangeProbability, type PriceBand } from "./il.ts";

export interface DecideInput {
  currentPrice: number;
  currentBand: PriceBand;
  depositValueUsd: number;
  feeVelocityUsdPerDay: number;
  volAnnual: number;
  horizonDays?: number;
  gasCostUsd?: number;
  slippageBps?: number;
  rebalanceNotionalUsd?: number;
  candidateWidth?: number;
  realizedGainUsd?: number;
  taxRateBps?: number;
  holdingDays?: number;
  safetyMarginUsd?: number;
}

export interface DecideInputsResolved {
  currentPrice: number;
  currentBand: PriceBand;
  depositValueUsd: number;
  feeVelocityUsdPerDay: number;
  volAnnual: number;
  horizonDays: number;
  gasCostUsd: number;
  slippageBps: number;
  rebalanceNotionalUsd: number;
  candidateWidth: number;
  realizedGainUsd: number;
  taxRateBps: number;
  safetyMarginUsd: number;
}

export interface Decision {
  action: "REBALANCE" | "HOLD";
  evDeltaUsd: number;
  breakEvenHorizonDays: number | null;
  recommendedBand: PriceBand;
  recommendedWidth: number;
  outOfRangeProbCurrent: number;
  projectedFeesStayUsd: number;
  projectedFeesRebalanceUsd: number;
  expectedExtraIlUsd: number;
  frictionUsd: number;
  taxDragUsd: number;
  // Worst in-range IL in USD if price walks to either edge of the recommended band.
  recommendedIlAtEdgesUsd: { low: number; high: number };
  // Fee APR the recommended band must earn to offset its expected IL over the horizon.
  breakEvenFeeAprPct: number;
  confidence: "low" | "medium" | "high";
  notes: string[];
  inputs: DecideInputsResolved;
}

const MIN_WIDTH = 0.02;
const MAX_WIDTH = 0.5;

export function widthFromVol(volAnnual: number, horizonDays: number): number {
  const raw = volAnnual * Math.sqrt(horizonDays / 365);
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, raw));
}

function halfWidthOf(band: PriceBand): number {
  return (band.high - band.low) / (band.high + band.low);
}

function expectedIlUsd(
  band: PriceBand,
  price: number,
  volAnnual: number,
  horizonDays: number,
  principalUsd: number,
): number {
  const sigma = volAnnual * Math.sqrt(horizonDays / 365);
  if (!(sigma > 0)) return 0;
  const up = price * Math.exp(sigma);
  const down = price * Math.exp(-sigma);
  const ilUp = Math.abs(ilClmm({ entryPrice: price, exitPrice: up, band, depositValueInB: principalUsd }).ilFraction);
  const ilDown = Math.abs(ilClmm({ entryPrice: price, exitPrice: down, band, depositValueInB: principalUsd }).ilFraction);
  return principalUsd * ((ilUp + ilDown) / 2);
}

function resolve(input: DecideInput): DecideInputsResolved {
  const horizonDays = input.horizonDays ?? 14;
  return {
    currentPrice: input.currentPrice,
    currentBand: input.currentBand,
    depositValueUsd: input.depositValueUsd,
    feeVelocityUsdPerDay: input.feeVelocityUsdPerDay,
    volAnnual: input.volAnnual,
    horizonDays,
    gasCostUsd: input.gasCostUsd ?? 2,
    slippageBps: input.slippageBps ?? 30,
    rebalanceNotionalUsd: input.rebalanceNotionalUsd ?? input.depositValueUsd,
    candidateWidth: input.candidateWidth ?? widthFromVol(input.volAnnual, horizonDays),
    realizedGainUsd: input.realizedGainUsd ?? 0,
    taxRateBps: input.taxRateBps ?? 0,
    safetyMarginUsd: input.safetyMarginUsd ?? 0,
  };
}

function evAtHorizon(r: DecideInputsResolved, newBand: PriceBand, horizonDays: number): number {
  const fracCurrent = 1 - outOfRangeProbability(r.currentPrice, r.currentBand, r.volAnnual, horizonDays);
  const fracNew = 1 - outOfRangeProbability(r.currentPrice, newBand, r.volAnnual, horizonDays);
  const concentration = clamp(halfWidthOf(r.currentBand) / r.candidateWidth, 0.1, 10);
  const stayRate = r.feeVelocityUsdPerDay;
  const rebalanceRate = r.feeVelocityUsdPerDay * concentration;

  const feesStay = stayRate * horizonDays * fracCurrent;
  const feesRebalance = rebalanceRate * horizonDays * fracNew;

  const ilCurrent = expectedIlUsd(r.currentBand, r.currentPrice, r.volAnnual, horizonDays, r.depositValueUsd);
  const ilNew = expectedIlUsd(newBand, r.currentPrice, r.volAnnual, horizonDays, r.depositValueUsd);
  const extraIl = Math.max(0, ilNew - ilCurrent);

  const friction = r.gasCostUsd + (r.slippageBps / 10_000) * r.rebalanceNotionalUsd;
  const taxDrag = r.taxRateBps > 0 && r.realizedGainUsd > 0 ? r.realizedGainUsd * (r.taxRateBps / 10_000) : 0;

  return feesRebalance - feesStay - extraIl - friction - taxDrag;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function decideRebalance(input: DecideInput): Decision {
  const r = resolve(input);
  const recommendedWidth = r.candidateWidth;
  const recommendedBand = bandFromWidth(r.currentPrice, recommendedWidth);

  const fracCurrent = 1 - outOfRangeProbability(r.currentPrice, r.currentBand, r.volAnnual, r.horizonDays);
  const fracNew = 1 - outOfRangeProbability(r.currentPrice, recommendedBand, r.volAnnual, r.horizonDays);
  const concentration = clamp(halfWidthOf(r.currentBand) / r.candidateWidth, 0.1, 10);

  const projectedFeesStayUsd = r.feeVelocityUsdPerDay * r.horizonDays * fracCurrent;
  const projectedFeesRebalanceUsd = r.feeVelocityUsdPerDay * concentration * r.horizonDays * fracNew;
  const ilCurrent = expectedIlUsd(r.currentBand, r.currentPrice, r.volAnnual, r.horizonDays, r.depositValueUsd);
  const ilNew = expectedIlUsd(recommendedBand, r.currentPrice, r.volAnnual, r.horizonDays, r.depositValueUsd);
  const expectedExtraIlUsd = Math.max(0, ilNew - ilCurrent);
  const frictionUsd = r.gasCostUsd + (r.slippageBps / 10_000) * r.rebalanceNotionalUsd;
  const taxDragUsd = r.taxRateBps > 0 && r.realizedGainUsd > 0 ? r.realizedGainUsd * (r.taxRateBps / 10_000) : 0;

  const evDeltaUsd =
    projectedFeesRebalanceUsd - projectedFeesStayUsd - expectedExtraIlUsd - frictionUsd - taxDragUsd;

  const edges = ilClmm({
    entryPrice: r.currentPrice,
    exitPrice: r.currentPrice,
    band: recommendedBand,
    depositValueInB: r.depositValueUsd,
  });
  const recommendedIlAtEdgesUsd = {
    low: edges.ilAtLow * r.depositValueUsd,
    high: edges.ilAtHigh * r.depositValueUsd,
  };
  const horizonYears = r.horizonDays / 365;
  const breakEvenFeeAprPct =
    r.depositValueUsd > 0
      ? breakEvenFeeApr(-(ilNew / r.depositValueUsd), horizonYears) * 100
      : 0;

  const outOfRangeProbCurrent = 1 - fracCurrent;
  const action = evDeltaUsd > r.safetyMarginUsd ? "REBALANCE" : "HOLD";

  let breakEvenHorizonDays: number | null = null;
  for (let h = 1; h <= 365; h++) {
    if (evAtHorizon(r, recommendedBand, h) >= 0) {
      breakEvenHorizonDays = h;
      break;
    }
  }

  const notes: string[] = [];
  if (outOfRangeProbCurrent > 0.6) notes.push("current position is likely out of range over the horizon");
  if (taxDragUsd > 0) notes.push(`tax drag of $${taxDragUsd.toFixed(2)} applied on realized gain`);
  if (r.candidateWidth <= MIN_WIDTH) notes.push("candidate width hit the minimum bound");
  if (input.candidateWidth === undefined) notes.push("candidate width derived from realized volatility");

  let confidence: Decision["confidence"] = "medium";
  if (r.volAnnual <= 0 || r.feeVelocityUsdPerDay <= 0) confidence = "low";
  else if (r.horizonDays >= 7) confidence = "high";

  return {
    action,
    evDeltaUsd,
    breakEvenHorizonDays,
    recommendedBand,
    recommendedWidth,
    outOfRangeProbCurrent,
    projectedFeesStayUsd,
    projectedFeesRebalanceUsd,
    expectedExtraIlUsd,
    frictionUsd,
    taxDragUsd,
    recommendedIlAtEdgesUsd,
    breakEvenFeeAprPct,
    confidence,
    notes,
    inputs: r,
  };
}
