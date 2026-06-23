import type { RangeBand } from "../model.ts";
import type { PriceBand } from "../il.ts";

export function tickToUiPrice(tick: number, decimalsA: number, decimalsB: number): number {
  return Math.pow(1.0001, tick) * Math.pow(10, decimalsA - decimalsB);
}

export function binToUiPrice(binId: number, binStepBps: number, decimalsA: number, decimalsB: number): number {
  return Math.pow(1 + binStepBps / 10_000, binId) * Math.pow(10, decimalsA - decimalsB);
}

export function clmmBandToPrices(band: RangeBand, decimalsA: number, decimalsB: number): PriceBand {
  return {
    low: tickToUiPrice(band.lower, decimalsA, decimalsB),
    high: tickToUiPrice(band.upper, decimalsA, decimalsB),
  };
}

export function dlmmBandToPrices(
  band: RangeBand,
  binStepBps: number,
  decimalsA: number,
  decimalsB: number,
): PriceBand {
  return {
    low: binToUiPrice(band.lower, binStepBps, decimalsA, decimalsB),
    high: binToUiPrice(band.upper, binStepBps, decimalsA, decimalsB),
  };
}
