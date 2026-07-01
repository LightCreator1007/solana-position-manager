// Cross-venue position contract. Token amounts are bigint base units.
// USD figures elsewhere are derived estimates and use number.

export type Venue = "orca" | "raydium" | "raydium-cpmm" | "meteora-dlmm" | "meteora-damm-v2" | "kamino";
// "amm" is a constant-product, full-range LP position, valued by share of pool.
export type PositionKind = "clmm" | "amm" | "vault" | "lending" | "staking";
export type TokenProgram = "spl-token" | "token-2022";

export interface TokenLeg {
  mint: string;
  decimals: number;
  raw: bigint;
  tokenProgram?: TokenProgram;
  // Token-2022 traits that change what actually settles. A transfer hook can
  // block or gate a move; a transfer fee shaves the amount that arrives.
  transferFeeBps?: number;
  hasTransferHook?: boolean;
  // Token-2022 interest-bearing or scaled-ui-amount: the raw base-unit amount
  // understates the real balance, which must be scaled by an accrued multiplier
  // before valuing. Flagged so USD figures are not taken at face value.
  hasScaledAmount?: boolean;
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
  // Operational context for risk flags. Optional; set from chain or pool data.
  locked?: boolean;
  poolLiquidityUsd?: number;
  poolVolume24hUsd?: number;
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
