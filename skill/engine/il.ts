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
  const hodlValueInB = entrySplit.amountA * exitPrice + entrySplit.amountB;
  const lpValueInB = clmmValueInB(liquidity, exitPrice, band);
  const ilFraction = hodlValueInB > 0 ? lpValueInB / hodlValueInB - 1 : 0;
  return { ilFraction, lpValueInB, hodlValueInB };
}

export function realizedVolAnnualized(series: PricePoint[]): number {
  if (series.length < 3) return 0;
  const returns: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].price;
    const curr = series[i].price;
    if (prev > 0 && curr > 0) returns.push(Math.log(curr / prev));
  }
  if (returns.length < 2) return 0;
  const mean = returns.reduce((acc, r) => acc + r, 0) / returns.length;
  const variance = returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (returns.length - 1);
  const stepStd = sqrt(variance);
  const spanSec = series[series.length - 1].t - series[0].t;
  const stepSec = spanSec / (series.length - 1);
  if (!(stepSec > 0)) return 0;
  const stepsPerYear = (365 * 24 * 3600) / stepSec;
  return stepStd * sqrt(stepsPerYear);
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
