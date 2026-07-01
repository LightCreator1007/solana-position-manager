// Concentrated-liquidity value and impermanent-loss math, in price space.
// Token A is priced in token B. Prices are token-B per token-A.

export interface PricePoint {
  t: number;
  price: number;
  volume?: number;
}

export interface PriceBand {
  low: number;
  high: number;
}

const sqrt = Math.sqrt;
const SECONDS_PER_YEAR = 365 * 24 * 3600;

export function bandFromWidth(center: number, width: number): PriceBand {
  if (!(center > 0)) throw new Error("bandFromWidth: center must be > 0");
  if (!(width > 0 && width < 1)) throw new Error("bandFromWidth: width must be in (0, 1)");
  return { low: center * (1 - width), high: center * (1 + width) };
}

export function ilConstantProduct(ratio: number): number {
  if (!(ratio > 0)) throw new Error("ilConstantProduct: ratio must be > 0");
  return (2 * sqrt(ratio)) / (1 + ratio) - 1;
}

export function clmmValueInB(liquidity: number, price: number, band: PriceBand): number {
  const sl = sqrt(band.low);
  const sh = sqrt(band.high);
  if (price <= band.low) return liquidity * (1 / sl - 1 / sh) * price;
  if (price >= band.high) return liquidity * (sh - sl);
  return liquidity * (2 * sqrt(price) - sl - price / sh);
}

export function liquidityForValue(valueInB: number, price: number, band: PriceBand): number {
  const unit = clmmValueInB(1, price, band);
  return unit > 0 ? valueInB / unit : 0;
}

export function clmmTokenSplit(
  liquidity: number,
  price: number,
  band: PriceBand,
): { amountA: number; amountB: number } {
  const sl = sqrt(band.low);
  const sh = sqrt(band.high);
  const s = Math.min(Math.max(sqrt(price), sl), sh);
  return { amountA: liquidity * (1 / s - 1 / sh), amountB: liquidity * (s - sl) };
}

export interface IlResult {
  ilFraction: number;
  lpValueInB: number;
  hodlValueInB: number;
  // IL the position would carry if price walked to each band edge from entry.
  // The edges are the worst in-range case, since the position fully converts there.
  ilAtLow: number;
  ilAtHigh: number;
}

export function ilClmm(params: {
  entryPrice: number;
  exitPrice: number;
  band: PriceBand;
  depositValueInB: number;
}): IlResult {
  const { entryPrice, exitPrice, band, depositValueInB } = params;
  if (!(band.low > 0 && band.high > band.low)) {
    throw new Error("ilClmm: require 0 < band.low < band.high");
  }
  if (!(depositValueInB > 0)) throw new Error("ilClmm: depositValueInB must be > 0");

  const liquidity = liquidityForValue(depositValueInB, entryPrice, band);
  const entrySplit = clmmTokenSplit(liquidity, entryPrice, band);
  const ilAt = (price: number): { il: number; lp: number; hodl: number } => {
    const hodl = entrySplit.amountA * price + entrySplit.amountB;
    const lp = clmmValueInB(liquidity, price, band);
    return { il: hodl > 0 ? lp / hodl - 1 : 0, lp, hodl };
  };
  const exit = ilAt(exitPrice);
  return {
    ilFraction: exit.il,
    lpValueInB: exit.lp,
    hodlValueInB: exit.hodl,
    ilAtLow: ilAt(band.low).il,
    ilAtHigh: ilAt(band.high).il,
  };
}

// Fee APR a position must earn to offset its impermanent loss over the holding
// period. Below this APR the position loses to holding on a risk-adjusted basis.
export function breakEvenFeeApr(ilFraction: number, horizonYears: number): number {
  if (!(horizonYears > 0)) throw new Error("breakEvenFeeApr: horizonYears must be > 0");
  return Math.max(0, -ilFraction) / horizonYears;
}

// Annualized realized volatility. Uses realized variance normalized by each
// interval's own elapsed time, so an irregularly spaced series (snapshots taken
// whenever the agent runs) is handled correctly: a return over a long gap
// contributes less per-unit variance than the same return over a short gap.
// sigma^2_annual = (sum of squared log returns / total elapsed seconds) * seconds/year.
export function realizedVolAnnualized(series: PricePoint[]): number {
  if (series.length < 3) return 0;
  let sumSq = 0;
  let sumDt = 0;
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].price;
    const curr = series[i].price;
    const dt = series[i].t - series[i - 1].t;
    if (!(prev > 0 && curr > 0 && dt > 0)) continue;
    const r = Math.log(curr / prev);
    sumSq += r * r;
    sumDt += dt;
  }
  if (!(sumDt > 0)) return 0;
  return sqrt((sumSq / sumDt) * SECONDS_PER_YEAR);
}

// EWMA volatility (RiskMetrics) annualized, spacing-aware. Weights recent
// per-second variance more than a flat realized vol, so a volatility-sized band
// reacts faster to a regime change. Each step's contribution is r^2 / dt, so an
// uneven gap does not distort the recency weighting.
export function ewmaVolAnnualized(series: PricePoint[], lambda = 0.94): number {
  if (series.length < 3) return 0;
  if (!(lambda > 0 && lambda < 1)) throw new Error("ewmaVolAnnualized: lambda must be in (0, 1)");
  let variancePerSec = 0;
  let seen = 0;
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].price;
    const curr = series[i].price;
    const dt = series[i].t - series[i - 1].t;
    if (!(prev > 0 && curr > 0 && dt > 0)) continue;
    const v = (Math.log(curr / prev) ** 2) / dt;
    variancePerSec = seen === 0 ? v : lambda * variancePerSec + (1 - lambda) * v;
    seen++;
  }
  if (seen < 2) return 0;
  return sqrt(variancePerSec * SECONDS_PER_YEAR);
}

export function stdNormCdf(x: number): number {
  // Abramowitz-Stegun 7.1.26 approximation of erf.
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const poly =
    t * (0.254829592 +
    t * (-0.284496736 +
    t * (1.421413741 +
    t * (-1.453152027 +
    t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(x * x) / 2);
  const signed = x >= 0 ? erf : -erf;
  return 0.5 * (1 + signed);
}

// Endpoint approximation: probability the price sits outside the band at the end
// of the horizon under a driftless lognormal walk. Documented in leaves/risk.md.
export function outOfRangeProbability(
  current: number,
  band: PriceBand,
  volAnnual: number,
  horizonDays: number,
): number {
  if (!(current > 0) || !(band.low > 0 && band.high > band.low)) return 1;
  const sigma = volAnnual * sqrt(horizonDays / 365);
  if (!(sigma > 0)) return current >= band.low && current <= band.high ? 0 : 1;
  const zHigh = Math.log(band.high / current) / sigma;
  const zLow = Math.log(band.low / current) / sigma;
  const inRange = stdNormCdf(zHigh) - stdNormCdf(zLow);
  return Math.min(1, Math.max(0, 1 - inRange));
}
