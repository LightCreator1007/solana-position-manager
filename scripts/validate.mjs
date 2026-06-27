#!/usr/bin/env node
// Skill linter. Checks structure, frontmatter, routing links, placeholder text,
// and that the example fixtures still produce their expected verdicts. No deps.
// Run: node scripts/validate.mjs

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const engineUrl = (rel) => new URL(`./skill/engine/${rel}`, `file://${ROOT}/`).href;

let failures = 0;
const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  failures += 1;
};

const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const REQUIRED = [
  "README.md",
  "CLAUDE.md",
  "LICENSE",
  "install.sh",
  "install-custom.sh",
  "skill/SKILL.md",
  "skill/resources.md",
  "rules/defi-money.md",
  "skill/engine/model.ts",
  "skill/engine/il.ts",
  "skill/engine/decide.ts",
  "skill/engine/health.ts",
  "skill/engine/errors.ts",
  "skill/engine/sources/rpc.ts",
  "skill/engine/sources/registry.ts",
  "skill/engine/fixtures/examples/orca-clmm.json",
  "skill/engine/fixtures/examples/raydium-clmm.json",
  "skill/engine/fixtures/examples/meteora-dlmm.json",
  "skill/engine/fixtures/examples/kamino-vault.json",
  "evals/trigger-queries.json",
  "evals/evals.json",
  "evals/README.md",
];

const LEAVES = [
  "positions", "risk", "rebalance-decision", "pool-safety", "lending", "staking",
  "pnl-and-tax", "portfolio", "data-sources", "delegation", "pitfalls", "stack", "safety",
];

function checkRequired() {
  for (const rel of REQUIRED) {
    if (!existsSync(path.join(ROOT, rel))) fail(`missing required file: ${rel}`);
  }
  for (const leaf of LEAVES) {
    if (!existsSync(path.join(ROOT, `skill/leaves/${leaf}.md`))) fail(`missing leaf: ${leaf}.md`);
  }
}

function checkFrontmatter() {
  const skill = read("skill/SKILL.md");
  if (!skill.startsWith("---")) fail("SKILL.md is missing frontmatter");
  const front = skill.slice(3, skill.indexOf("---", 3));
  if (!/\bname:/.test(front)) fail("SKILL.md frontmatter has no name");
  if (!/\bdescription:/.test(front)) fail("SKILL.md frontmatter has no description");
}

function checkRoutingLinks() {
  const sources = ["CLAUDE.md", "skill/SKILL.md"];
  for (const src of sources) {
    const text = read(src);
    for (const match of text.matchAll(/(?:skill\/)?leaves\/([a-z0-9-]+)\.md/g)) {
      const leaf = match[1];
      if (!existsSync(path.join(ROOT, `skill/leaves/${leaf}.md`))) {
        fail(`${src} links to missing leaf: ${leaf}.md`);
      }
    }
  }
}

function checkPlaceholders() {
  const targets = [
    "README.md", "CLAUDE.md", "skill/SKILL.md", "skill/resources.md",
    ...LEAVES.map((l) => `skill/leaves/${l}.md`),
  ];
  const pattern = /\b(TODO|FIXME|TKTK|XXX|lorem ipsum)\b/i;
  for (const rel of targets) {
    if (existsSync(path.join(ROOT, rel)) && pattern.test(read(rel))) {
      fail(`placeholder text in ${rel}`);
    }
  }
}

async function checkGoldenVerdicts() {
  const { deserializeSnapshot } = await import(engineUrl("ledger.ts"));
  const { escalations } = await import(engineUrl("health.ts"));
  const { renderReport } = await import(engineUrl("report.ts"));

  const load = (name) =>
    deserializeSnapshot(read(`skill/engine/fixtures/examples/${name}.json`));
  const has = (snap, code) => escalations(snap).some((a) => a.code === code);

  const orca = load("orca-clmm");
  if (has(orca, "out-of-range")) fail("orca example should be in range");
  if (renderReport(orca).json.totalValueUsd <= 0) fail("orca example has no value");

  if (!has(load("raydium-clmm"), "thin-liquidity")) fail("raydium example should flag thin liquidity");
  if (!has(load("meteora-dlmm"), "out-of-range")) fail("meteora example should be out of range");

  const kamino = renderReport(load("kamino-vault")).json;
  if (kamino.rows[0]?.kind !== "vault") fail("kamino example should be a vault");
}

async function main() {
  checkRequired();
  checkFrontmatter();
  checkRoutingLinks();
  checkPlaceholders();
  await checkGoldenVerdicts();

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("PASS: position-manager skill is valid");
}

main().catch((err) => {
  console.error(`FAIL: validator crashed: ${err.message}`);
  process.exit(1);
});
