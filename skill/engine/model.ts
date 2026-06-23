// Cross-venue position contract. Token amounts are bigint base units.
// USD figures elsewhere are derived estimates and use number.

export type Venue = "orca" | "raydium" | "meteora-dlmm" | "kamino";
export type PositionKind = "clmm" | "vault" | "lending" | "staking";

export interface TokenLeg {
  mint: string;
  decimals: number;
  raw: bigint;
}

// Bounds are venue-tagged. CLMM ticks are half-open [lower, upper);
// DLMM bins are inclusive. Never compare bounds across venues.
export interface RangeBand {
  unit: "tick" | "bin";
  lower: number;
  upper: number;
  inclusiveUpper: boolean;
}

export interface Position {
  venue: Venue;
  kind: PositionKind;
  ref: string;
  band?: RangeBand;
  inRange?: boolean;
  legs: { a: TokenLeg; b?: TokenLeg };
  // Unclaimed fees or rewards per token. Kept per-mint; summing across mints is invalid.
  unclaimed: { a: bigint; b?: bigint };
  health?: number;
  openedAtUnix?: number;
}

export type PriceSource = "jupiter" | "birdeye" | "pool" | "stale";

export interface Snapshot {
  takenAtUnix: number;
  wallet: string;
  priceUsd: Record<string, number>;
  priceSource: Record<string, PriceSource>;
  positions: Position[];
}

export function toUiAmount(leg: TokenLeg): number {
  return Number(leg.raw) / 10 ** leg.decimals;
}

export function legUsd(leg: TokenLeg, priceUsd: Record<string, number>): number {
  const price = priceUsd[leg.mint] ?? 0;
  return toUiAmount(leg) * price;
}

export function isClmm(p: Position): boolean {
  return p.kind === "clmm" || p.kind === "vault";
}
