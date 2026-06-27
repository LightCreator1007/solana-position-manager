# position-manager-skill

A Claude Code and Codex skill that turns raw Solana positions into a health report and a tax-aware
rebalance decision. The judgement layer is a small TypeScript engine with unit tests and no network
dependency, so every number is reproducible. The skill plans and analyses. It does not sign or submit
transactions.

Built for the Superteam Brazil position-manager bounty for the Solana AI Kit.

## The problem

Liquidity providers run positions across several venues and tools: one dashboard per DEX, a spreadsheet
for impermanent loss, a bot for alerts, and a separate exporter at tax time. The common failure is acting
on partial information. People rebalance out of reflex when price leaves the range, pay gas and slippage,
concentrate more impermanent-loss risk, and sometimes trigger a taxable event, all for a move that loses
value. Most concentrated-liquidity providers underperform holding once impermanent loss and gas are
counted.

## What it does

- Normalises positions across Orca Whirlpools, Raydium CLMM, Meteora DLMM, and Kamino into one shape.
- Computes impermanent loss with the concentrated-liquidity value function, not a constant-product approximation.
- Decides whether to rebalance by expected value: projected fees against impermanent loss, gas, slippage, and tax drag.
- Tracks cost basis with FIFO, HIFO, or specific identification.
- Keeps a local append-only snapshot ledger, so P&L and fee velocity are measured rather than assumed.
- Flags out-of-range positions, low lending health, concentration, Token-2022 mints, locked positions, thin liquidity, and inverted price orientation.
- Renders a position health report as Markdown and JSON.

## What is new here

Three things the existing approaches leave on the table:

1. A tax-aware rebalance decision. The engine nets projected fees against impermanent loss, gas, slippage, and the tax drag of realising a gain when the position closes. A rebalance that looks worthwhile before tax can be negative after it. The decision exposes both.
2. A file-backed snapshot ledger. P&L, fee velocity, and the volatility that drives the decision are measured from a local append-only history, with no background process.
3. Offline, fixture-first determinism. The whole engine runs and tests on saved fixtures with no network, so results are reproducible and the demo is real, not hand-written.

Supporting this build:

- An eval harness: 10 positive and 10 near-miss trigger queries for description precision, plus output evals with gradable assertions tuned to the tax-aware decision, the IL math, and the no-signing posture.
- A skill validator that checks structure, frontmatter, routing links, placeholder text, and the example fixtures' golden verdicts.
- Typed `EngineError` at the IO boundaries, with a remediation per code and secret redaction, so a failed fetch reports a clear blocker rather than inventing data.
- A read-only JSON-RPC client and position-NFT discovery that use parsed account methods, with no hand-rolled byte decoding.
- A cross-runtime install for Claude Code (`.claude`) and Codex (`.agents`).

## What it does not do

- It does not hold keys, sign, or submit transactions. Signing is delegated to the `solana-dev` skill and swaps to the Jupiter skill.
- It does not run unattended. Alerts are informational.
- It does not give tax advice. The tax-drag figure is a record-keeping aid; ambiguous lots are flagged for a CPA.
- It does not act as a price oracle. It consumes prices and labels their source and staleness.

## Install

```bash
git clone https://github.com/LightCreator1007/position-manager-skill
cd position-manager-skill
./install.sh          # Claude Code, ~/.claude, use -y to skip the prompt
./install.sh --agents # Codex, ~/.agents
# or
./install-custom.sh   # choose runtime (Claude or Codex) and personal or project-local
```

Or as a plugin, from inside Claude Code:

```
/plugin marketplace add LightCreator1007/position-manager-skill
/plugin install position-manager-skill
```

## Run the engine

The engine runs on Node 22+ with native TypeScript type stripping, so the tests need no install:

```bash
cd skill/engine
node --test          # unit tests, no network
npm install          # only for the typecheck and the optional venue SDKs
npx tsc -p .         # strict typecheck
node demo.ts         # reproducible health report and rebalance decision from fixtures
```

From the repository root, validate the whole skill:

```bash
node scripts/validate.mjs   # structure, frontmatter, links, placeholders, golden verdicts
```

The eval set lives in `evals/`. See `evals/README.md` for the trigger and output eval workflow.

The demo loads a sample ledger and a 90 day price series and prints a health report, a rebalance
decision, and the same decision after a 30 percent tax rate on a realised gain, which flips it from
rebalance to hold.

## Usage

Inside Claude Code with the skill installed:

```
"Render the health report for my wallet."
"My SOL/USDC Orca position is out of range. Should I rebalance? Show the EV with and without tax."
"Build a rebalance plan, simulate it, and ask me to confirm before anything is signed."
"Watch my positions and alert me when one goes out of range."
```

## Structure

```
position-manager-skill/
  CLAUDE.md                 persona and config
  README.md
  install.sh, install-custom.sh
  .claude-plugin/marketplace.json
  skill/
    SKILL.md                router
    leaves/                 focused topic docs
    resources.md
    engine/                 tested TypeScript core
      model.ts il.ts ledger.ts pnl.ts decide.ts taxlots.ts
      health.ts plan.ts safety.ts report.ts prices.ts errors.ts
      sources/              per-venue readers, rpc client, registry
      fixtures/             sample ledger, price series, per-venue examples
      demo.ts
  agents/                   desk-analyst, rebalance-strategist, stream-sentinel, openai.yaml
  commands/                 lp-report, lp-decide, lp-plan, lp-watch, lp-snapshot
  rules/                    defi-money
  scripts/                  validate.mjs (skill linter)
  evals/                    trigger queries and output evals
  ROADMAP.md                planned venues: Raydium CPMM, Meteora DAMM v2
```

## Verify before trusting

Program IDs and SDK versions in the docs are current as of June 2026. Verify program IDs against an
explorer and SDK field names against the installed version before relying on them. The venue readers
extract fields defensively but assume current key names.

## License

MIT. See LICENSE, retained from the upstream seed.
