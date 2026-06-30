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
  // How much of the raw width-ratio fee uplift a tighter band actually captures,
  // in (0, 1]. 1 is the old linear assumption; the default is conservative so the
  // decision does not over-credit concentration and over-recommend rebalancing.
  concentrationEfficiency?: number;
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
  concentrationEfficiency: number;
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

// Five-node Gauss-Hermite quadrature for the standard normal, rescaled from the
// physicists' nodes (weight e^{-x^2}) to N(0,1). Integrates a function of the
// terminal log-return against its driftless lognormal distribution.
const GH_NODES = [0, 1.3556262, -1.3556262, 2.8569700, -2.8569700];
const GH_WEIGHTS = [0.5333333, 0.2220759, 0.2220759, 0.0112574, 0.0112574];

// Expected impermanent loss in USD over the horizon. IL is convex and saturates
// once price leaves the band, so a single +/-1 sigma pair understates it; the
// quadrature samples the body and the tails of the terminal-price distribution.
export function expectedIlUsd(
  band: PriceBand,
  price: number,
  volAnnual: number,
  horizonDays: number,
  principalUsd: number,
): number {
  const sigma = volAnnual * Math.sqrt(horizonDays / 365);
  if (!(sigma > 0)) return 0;
  let expectedFraction = 0;
  for (let i = 0; i < GH_NODES.length; i++) {
    const exitPrice = price * Math.exp(sigma * GH_NODES[i]);
    const il = Math.abs(ilClmm({ entryPrice: price, exitPrice, band, depositValueInB: principalUsd }).ilFraction);
    expectedFraction += GH_WEIGHTS[i] * il;
  }
  return principalUsd * expectedFraction;
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
    concentrationEfficiency: clamp(input.concentrationEfficiency ?? 0.5, 0, 1),
  };
}

// Raw width ratio says a band half as wide earns twice the fees. Real capture is
// sublinear, so blend the raw multiplier toward 1 by the efficiency factor.
function effectiveConcentration(r: DecideInputsResolved): number {
  const raw = clamp(halfWidthOf(r.currentBand) / r.candidateWidth, 0.1, 10);
  return 1 + (raw - 1) * r.concentrationEfficiency;
}

function evAtHorizon(r: DecideInputsResolved, newBand: PriceBand, horizonDays: number): number {
  const fracCurrent = 1 - outOfRangeProbability(r.currentPrice, r.currentBand, r.volAnnual, horizonDays);
  const fracNew = 1 - outOfRangeProbability(r.currentPrice, newBand, r.volAnnual, horizonDays);
  const concentration = effectiveConcentration(r);
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
  const concentration = effectiveConcentration(r);

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
