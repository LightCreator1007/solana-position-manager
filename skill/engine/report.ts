import type { Snapshot } from "./model.ts";
import { positionValueUsd, unclaimedFeesUsd, portfolioValueUsd } from "./pnl.ts";
import { escalations, portfolioScore, type Escalation } from "./health.ts";

export interface ReportRow {
  venue: string;
  kind: string;
  ref: string;
  valueUsd: number;
  feesUsd: number;
  inRange: boolean | null;
}

export interface ReportJson {
  wallet: string;
  takenAtUnix: number;
  totalValueUsd: number;
  score: number;
  rows: ReportRow[];
  escalations: Escalation[];
}

export interface Report {
  md: string;
  json: ReportJson;
}

const shorten = (s: string): string => (s.length > 12 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s);

const severityMark: Record<Escalation["severity"], string> = {
  info: "info",
  medium: "warn",
  high: "high",
  critical: "critical",
};

export function renderReport(snap: Snapshot): Report {
  const rows: ReportRow[] = snap.positions.map((p) => ({
    venue: p.venue,
    kind: p.kind,
    ref: p.ref,
    valueUsd: positionValueUsd(p, snap.priceUsd),
    feesUsd: unclaimedFeesUsd(p, snap.priceUsd),
    inRange: p.inRange ?? null,
  }));
  const totalValueUsd = portfolioValueUsd(snap);
  const score = portfolioScore(snap).score;
  const alerts = escalations(snap);

  const json: ReportJson = {
    wallet: snap.wallet,
    takenAtUnix: snap.takenAtUnix,
    totalValueUsd,
    score,
    rows,
    escalations: alerts,
  };

  const lines: string[] = [];
  lines.push(`# Position Health Report`);
  lines.push("");
  lines.push(`Wallet: ${shorten(snap.wallet)}`);
  lines.push(`As of: ${new Date(snap.takenAtUnix * 1000).toISOString()}`);
  lines.push(`Total value: $${totalValueUsd.toFixed(2)}`);
  lines.push(`Health score: ${score.toFixed(0)} / 100`);
  lines.push("");

  if (alerts.length > 0) {
    lines.push(`## Alerts`);
    lines.push("");
    for (const a of alerts) {
      lines.push(`- [${severityMark[a.severity]}] ${a.message}`);
    }
    lines.push("");
  }

  lines.push(`## Positions`);
  lines.push("");
  lines.push(`| Venue | Kind | Ref | Value (USD) | Fees (USD) | In range |`);
  lines.push(`| --- | --- | --- | --- | --- | --- |`);
  for (const r of rows) {
    const range = r.inRange === null ? "n/a" : r.inRange ? "yes" : "no";
    lines.push(
      `| ${r.venue} | ${r.kind} | ${shorten(r.ref)} | ${r.valueUsd.toFixed(2)} | ${r.feesUsd.toFixed(2)} | ${range} |`,
    );
  }
  lines.push("");

  return { md: lines.join("\n"), json };
}
