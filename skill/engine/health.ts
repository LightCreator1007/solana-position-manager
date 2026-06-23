import type { Snapshot } from "./model.ts";
import { positionValueUsd, portfolioValueUsd } from "./pnl.ts";

export type Severity = "info" | "medium" | "high" | "critical";

export interface Escalation {
  code: string;
  severity: Severity;
  message: string;
  ref?: string;
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
