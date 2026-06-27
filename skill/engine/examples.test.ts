import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deserializeSnapshot } from "./ledger.ts";
import { renderReport } from "./report.ts";
import { escalations } from "./health.ts";

function loadExample(name: string) {
  const path = fileURLToPath(new URL(`./fixtures/examples/${name}.json`, import.meta.url));
  return deserializeSnapshot(readFileSync(path, "utf8"));
}

const NAMES = ["orca-clmm", "raydium-clmm", "meteora-dlmm", "kamino-vault", "raydium-cpmm", "meteora-damm-v2"];

test("every example renders a non-empty report", () => {
  for (const name of NAMES) {
    const report = renderReport(loadExample(name));
    assert.ok(report.json.totalValueUsd > 0, `${name} has zero value`);
    assert.equal(report.json.rows.length, 1);
    assert.ok(report.md.includes("Position Health Report"));
  }
});

test("orca example is in range with a healthy pool", () => {
  const alerts = escalations(loadExample("orca-clmm"));
  assert.ok(!alerts.some((a) => a.code === "out-of-range"));
  assert.ok(!alerts.some((a) => a.code === "thin-liquidity"));
});

test("raydium example flags thin liquidity", () => {
  assert.ok(escalations(loadExample("raydium-clmm")).some((a) => a.code === "thin-liquidity"));
});

test("meteora example is out of range", () => {
  assert.ok(escalations(loadExample("meteora-dlmm")).some((a) => a.code === "out-of-range"));
});

test("kamino example is a vault that is in range", () => {
  const report = renderReport(loadExample("kamino-vault"));
  assert.equal(report.json.rows[0].kind, "vault");
  assert.equal(report.json.rows[0].inRange, true);
});

test("constant-product examples are amm positions with no range and no out-of-range alert", () => {
  for (const name of ["raydium-cpmm", "meteora-damm-v2"]) {
    const snap = loadExample(name);
    const report = renderReport(snap);
    assert.equal(report.json.rows[0].kind, "amm");
    assert.equal(report.json.rows[0].inRange, null);
    assert.ok(report.json.totalValueUsd > 0);
    assert.ok(!escalations(snap).some((a) => a.code === "out-of-range"));
  }
});
