import type { Position, Snapshot, TokenLeg } from "./model.ts";
import { toUiAmount } from "./model.ts";
import type { PricePoint } from "./il.ts";

const legUsd = (leg: TokenLeg, priceUsd: Record<string, number>): number =>
  toUiAmount(leg) * (priceUsd[leg.mint] ?? 0);

const rawUsd = (raw: bigint, leg: TokenLeg | undefined, priceUsd: Record<string, number>): number => {
  if (!leg) return 0;
  return (Number(raw) / 10 ** leg.decimals) * (priceUsd[leg.mint] ?? 0);
};

export function unclaimedFeesUsd(p: Position, priceUsd: Record<string, number>): number {
  const a = rawUsd(p.unclaimed.a, p.legs.a, priceUsd);
  const b = p.unclaimed.b !== undefined ? rawUsd(p.unclaimed.b, p.legs.b, priceUsd) : 0;
  return a + b;
}

export function positionValueUsd(p: Position, priceUsd: Record<string, number>): number {
  const principal = legUsd(p.legs.a, priceUsd) + (p.legs.b ? legUsd(p.legs.b, priceUsd) : 0);
  return principal + unclaimedFeesUsd(p, priceUsd);
}

export function portfolioValueUsd(snap: Snapshot): number {
  return snap.positions.reduce((acc, p) => acc + positionValueUsd(p, snap.priceUsd), 0);
}

export interface ValuePoint {
  t: number;
  valueUsd: number;
}

export function valueSeries(snaps: Snapshot[]): ValuePoint[] {
  return snaps.map((s) => ({ t: s.takenAtUnix, valueUsd: portfolioValueUsd(s) }));
}

export function holdingPeriodDays(snaps: Snapshot[]): number {
  if (snaps.length < 2) return 0;
  const span = snaps[snaps.length - 1].takenAtUnix - snaps[0].takenAtUnix;
  return span / (24 * 3600);
}

// Caveat: ignores deposits and withdrawals between snapshots. See leaves/pnl-and-tax.md.
export function simpleReturn(snaps: Snapshot[]): number | null {
  if (snaps.length < 2) return null;
  const first = portfolioValueUsd(snaps[0]);
  const last = portfolioValueUsd(snaps[snaps.length - 1]);
  return first > 0 ? last / first - 1 : null;
}

export function feeVelocityUsdPerDay(snaps: Snapshot[]): number {
  if (snaps.length < 2) return 0;
  let accruedUsd = 0;
  let elapsedSec = 0;
  for (let i = 1; i < snaps.length; i++) {
    const prev = snaps[i - 1];
    const curr = snaps[i];
    const dt = curr.takenAtUnix - prev.takenAtUnix;
    if (dt <= 0) continue;
    const prevFees = prev.positions.reduce((acc, p) => acc + unclaimedFeesUsd(p, prev.priceUsd), 0);
    const currFees = curr.positions.reduce((acc, p) => acc + unclaimedFeesUsd(p, curr.priceUsd), 0);
    accruedUsd += Math.max(0, currFees - prevFees);
    elapsedSec += dt;
  }
  if (elapsedSec <= 0) return 0;
  return accruedUsd / (elapsedSec / (24 * 3600));
}

export function pairPriceSeries(snaps: Snapshot[], mintA: string, mintB: string): PricePoint[] {
  const out: PricePoint[] = [];
  for (const s of snaps) {
    const pa = s.priceUsd[mintA];
    const pb = s.priceUsd[mintB];
    if (pa === undefined || pb === undefined || pb <= 0) continue;
    out.push({ t: s.takenAtUnix, price: pa / pb });
  }
  return out;
}
