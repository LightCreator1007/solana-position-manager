import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deserializeSnapshot } from "./ledger.ts";
import type { Snapshot } from "./model.ts";
import type { PricePoint } from "./il.ts";
import { realizedVolAnnualized } from "./il.ts";
import { renderReport } from "./report.ts";
import { feeVelocityUsdPerDay, positionValueUsd } from "./pnl.ts";
import { clmmBandToPrices } from "./sources/ticks.ts";
import { decideRebalance } from "./decide.ts";

function load<T>(rel: string): T {
  const path = fileURLToPath(new URL(rel, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const snaps: Snapshot[] = readFileSync(fileURLToPath(new URL("./fixtures/snapshots-demo.jsonl", import.meta.url)), "utf8")
  .split("\n")
  .filter(Boolean)
  .map(deserializeSnapshot);

const last = snaps[snaps.length - 1];
const report = renderReport(last);
console.log(report.md);
console.log("");

const series = load<PricePoint[]>("./fixtures/series-soldusdc-90d.json");
const position = last.positions[0];
const band = position.band;
if (!band) throw new Error("demo position has no band");

const currentPrice = last.priceUsd[position.legs.a.mint] / (last.priceUsd[position.legs.b!.mint] || 1);
const currentBand = clmmBandToPrices(band, position.legs.a.decimals, position.legs.b!.decimals);

const decision = decideRebalance({
  currentPrice,
  currentBand,
  depositValueUsd: positionValueUsd(position, last.priceUsd),
  feeVelocityUsdPerDay: feeVelocityUsdPerDay(snaps),
  volAnnual: realizedVolAnnualized(series),
  horizonDays: 14,
  realizedGainUsd: 1200,
  taxRateBps: 0,
});

console.log("## Rebalance Decision");
console.log(`action: ${decision.action}`);
console.log(`EV delta: $${decision.evDeltaUsd.toFixed(2)}`);
console.log(`out-of-range probability (current): ${(decision.outOfRangeProbCurrent * 100).toFixed(1)}%`);
console.log(`recommended band: [${decision.recommendedBand.low.toFixed(2)}, ${decision.recommendedBand.high.toFixed(2)}]`);
console.log(`break-even horizon: ${decision.breakEvenHorizonDays ?? "none within 365d"} days`);
console.log(`confidence: ${decision.confidence}`);

const taxed = decideRebalance({
  currentPrice,
  currentBand,
  depositValueUsd: positionValueUsd(position, last.priceUsd),
  feeVelocityUsdPerDay: feeVelocityUsdPerDay(snaps),
  volAnnual: realizedVolAnnualized(series),
  horizonDays: 14,
  realizedGainUsd: 1200,
  taxRateBps: 3000,
});
console.log("");
console.log(`with a 30% tax rate on a $1200 realized gain: ${taxed.action} (EV $${taxed.evDeltaUsd.toFixed(2)}, tax drag $${taxed.taxDragUsd.toFixed(2)})`);
