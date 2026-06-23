import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deserializeSnapshot } from "./ledger.ts";
import type { Snapshot } from "./model.ts";
import { renderReport } from "./report.ts";

function loadDemo(): Snapshot[] {
  const path = fileURLToPath(new URL("./fixtures/snapshots-demo.jsonl", import.meta.url));
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map(deserializeSnapshot);
}

test("report renders markdown and structured json together", () => {
  const { md, json } = renderReport(loadDemo()[2]);
  assert.match(md, /# Position Health Report/);
  assert.match(md, /## Positions/);
  assert.equal(json.rows.length, 1);
  assert.ok(Math.abs(json.totalValueUsd - 3010.125) < 1e-6);
});

test("an out-of-range snapshot surfaces an alert in both outputs", () => {
  const { md, json } = renderReport(loadDemo()[2]);
  assert.match(md, /## Alerts/);
  assert.match(md, /out of range/);
  assert.ok(json.escalations.some((a) => a.code === "out-of-range"));
});

test("a clean snapshot omits the alerts section text for out-of-range", () => {
  const { md } = renderReport(loadDemo()[0]);
  assert.ok(!md.includes("out of range"));
});
