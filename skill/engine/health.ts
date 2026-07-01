import type { Position, Snapshot } from "./model.ts";
import { positionValueUsd, portfolioValueUsd } from "./pnl.ts";
import { tickToUiPrice } from "./sources/ticks.ts";

export type Severity = "info" | "medium" | "high" | "critical";

export interface Escalation {
  code: string;
  severity: Severity;
  message: string;
  ref?: string;
}

const THIN_LIQUIDITY_USD = 50_000;
const LOW_TURNOVER_RATIO = 0.05;
// A band-implied price this far from the oracle ratio is structural (wrong token
// order or wrong decimals), not market drift. Decimals slips are >=1000x and an
// inverted pair is larger still, while even an extreme out-of-range stays well under.
const ORIENTATION_FACTOR = 20;

// True when the band-implied price and the oracle price ratio disagree by more
// than `factor`, which points at an inverted pair or a decimals mistake.
export function orientationLooksOff(impliedPrice: number, refPrice: number, factor = ORIENTATION_FACTOR): boolean {
  if (!(impliedPrice > 0 && refPrice > 0)) return false;
  const ratio = impliedPrice / refPrice;
  return ratio > factor || ratio < 1 / factor;
}

function tokenFlags(p: Position): Escalation[] {
  const out: Escalation[] = [];
  const legs = [p.legs.a, p.legs.b].filter((l) => l !== undefined);
  const token2022 = legs.some((l) => l!.tokenProgram === "token-2022" || l!.hasTransferHook);
  const transferFee = legs.some((l) => (l!.transferFeeBps ?? 0) > 0);
  if (token2022 || transferFee) {
    out.push({
      code: "token-2022",
      severity: "medium",
      message: `position on ${p.venue} holds a Token-2022 mint; verify transfer hook and transfer fee before sizing or exit`,
      ref: p.ref,
    });
  }
  if (legs.some((l) => l!.hasScaledAmount)) {
    out.push({
      code: "scaled-amount",
      severity: "medium",
      message: `position on ${p.venue} holds an interest-bearing or scaled-amount mint; the raw amount understates value, apply the accrued multiplier before valuing`,
      ref: p.ref,
    });
  }
  return out;
}

function orientationFlag(p: Position, priceUsd: Record<string, number>): Escalation | null {
  if (!p.band || p.band.unit !== "tick" || !p.legs.b) return null;
  const midTick = (p.band.lower + p.band.upper) / 2;
  const implied = tickToUiPrice(midTick, p.legs.a.decimals, p.legs.b.decimals);
  const priceA = priceUsd[p.legs.a.mint] ?? 0;
  const priceB = priceUsd[p.legs.b.mint] ?? 0;
  if (!(priceA > 0 && priceB > 0)) return null;
  if (!orientationLooksOff(implied, priceA / priceB)) return null;
  return {
    code: "price-orientation",
    severity: "medium",
    message: `band-implied price on ${p.venue} diverges from the oracle ratio; check token order and decimals`,
    ref: p.ref,
  };
}

export function venueShares(snap: Snapshot): Record<string, number> {
  const total = portfolioValueUsd(snap);
  const shares: Record<string, number> = {};
  if (total <= 0) return shares;
  for (const p of snap.positions) {
    shares[p.venue] = (shares[p.venue] ?? 0) + positionValueUsd(p, snap.priceUsd) / total;
  }
  return shares;
}

export function escalations(snap: Snapshot): Escalation[] {
  const out: Escalation[] = [];

  for (const p of snap.positions) {
    if ((p.kind === "clmm" || p.kind === "vault") && p.inRange === false) {
      out.push({
        code: "out-of-range",
        severity: "high",
        message: `position on ${p.venue} is out of range and not earning fees`,
        ref: p.ref,
      });
    }
    if (p.kind === "lending" && p.health !== undefined) {
      if (p.health < 1.2) {
        out.push({
          code: "liquidation-imminent",
          severity: "critical",
          message: `lending health factor ${p.health.toFixed(2)} is near liquidation`,
          ref: p.ref,
        });
      } else if (p.health < 1.5) {
        out.push({
          code: "liquidation-risk",
          severity: "high",
          message: `lending health factor ${p.health.toFixed(2)} is low`,
          ref: p.ref,
        });
      }
    }

    if (p.locked === true) {
      out.push({
        code: "locked",
        severity: "high",
        message: `position on ${p.venue} is locked and cannot be withdrawn or rebalanced until it unlocks`,
        ref: p.ref,
      });
    }

    if (p.poolLiquidityUsd !== undefined && p.poolLiquidityUsd < THIN_LIQUIDITY_USD) {
      out.push({
        code: "thin-liquidity",
        severity: "medium",
        message: `pool liquidity $${p.poolLiquidityUsd.toFixed(0)} is thin; an exit may move the price`,
        ref: p.ref,
      });
    }
    if (
      p.poolVolume24hUsd !== undefined &&
      p.poolLiquidityUsd !== undefined &&
      p.poolLiquidityUsd > 0 &&
      p.poolVolume24hUsd / p.poolLiquidityUsd < LOW_TURNOVER_RATIO
    ) {
      out.push({
        code: "low-turnover",
        severity: "info",
        message: `pool turnover is low; fees may not justify a tight range on ${p.venue}`,
        ref: p.ref,
      });
    }

    out.push(...tokenFlags(p));
    const orientation = orientationFlag(p, snap.priceUsd);
    if (orientation) out.push(orientation);
  }

  for (const [venue, share] of Object.entries(venueShares(snap))) {
    if (share > 0.6) {
      out.push({
        code: "concentration",
        severity: "medium",
        message: `${(share * 100).toFixed(0)}% of portfolio value sits in ${venue}`,
        ref: venue,
      });
    }
  }

  return out;
}

export interface ScoreComponent {
  category: string;
  score: number;
  weight: number;
}

export interface PortfolioScore {
  score: number;
  components: ScoreComponent[];
}

// Score is 0..100, higher is healthier.
export function portfolioScore(snap: Snapshot): PortfolioScore {
  const clmm = snap.positions.filter((p) => p.kind === "clmm" || p.kind === "vault");
  const inRangeCount = clmm.filter((p) => p.inRange !== false).length;
  const rangeHealth = clmm.length > 0 ? (inRangeCount / clmm.length) * 100 : 100;

  const lending = snap.positions.filter((p) => p.kind === "lending" && p.health !== undefined);
  const minHealth = lending.length > 0 ? Math.min(...lending.map((p) => p.health ?? Infinity)) : Infinity;
  const liquidationSafety = minHealth === Infinity ? 100 : clampScore((minHealth - 1) / 1 * 100);

  const shares = Object.values(venueShares(snap));
  const maxShare = shares.length > 0 ? Math.max(...shares) : 0;
  const concentrationSafety = clampScore((1 - maxShare) * 100);

  const components: ScoreComponent[] = [
    { category: "range-health", score: rangeHealth, weight: 0.4 },
    { category: "liquidation-safety", score: liquidationSafety, weight: 0.35 },
    { category: "concentration", score: concentrationSafety, weight: 0.25 },
  ];
  const score = components.reduce((acc, c) => acc + c.score * c.weight, 0);
  return { score, components };
}

function clampScore(x: number): number {
  return Math.min(100, Math.max(0, x));
}
