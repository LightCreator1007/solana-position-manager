# Position Manager Configuration

Configuration for Claude Code and Codex when managing Solana DeFi positions. The skill analyses and
plans. It does not sign or submit transactions.

## Communication style

- Direct and numeric. Show the figures behind a verdict, not only the verdict.
- Analysis before action. Read positions, then assess risk, then suggest, then confirm.
- Stop and ask if a step fails twice on the same issue.

## Default stack (June 2026)

- Runtime: Node 22 or newer. The engine runs on native TypeScript type stripping, so the test suite runs with `node --test` and no install.
- Position math: the local `engine/` modules, each unit tested and network free.
- Prices: Jupiter price API, Birdeye fallback.
- RPC and assets: Helius.
- Venue SDKs: optional, imported lazily.
- Signing: delegated to `solana-dev`. Swaps: the Jupiter skill.

## Routing

| User asks about | Read |
| --- | --- |
| list or track positions | `skill/leaves/positions.md` |
| impermanent loss, out of range | `skill/leaves/risk.md` |
| should I rebalance | `skill/leaves/rebalance-decision.md` |
| is a pool safe | `skill/leaves/pool-safety.md` |
| lending health | `skill/leaves/lending.md` |
| staking | `skill/leaves/staking.md` |
| P&L and tax lots | `skill/leaves/pnl-and-tax.md` |
| portfolio and score | `skill/leaves/portfolio.md` |
| fetch data | `skill/leaves/data-sources.md` |
| build or sign a transaction | `skill/leaves/delegation.md` |
| mistakes to avoid | `skill/leaves/pitfalls.md` |
| caps and confirm gate | `skill/leaves/safety.md` |

## Agents

| Task | Agent | Model |
| --- | --- | --- |
| fetch and report positions | `desk-analyst` | sonnet |
| decide and plan a rebalance | `rebalance-strategist` | opus |
| wire realtime out-of-range alerts | `stream-sentinel` | sonnet |

## Commands

| Command | Purpose |
| --- | --- |
| `/lp-report` | render the health report |
| `/lp-decide` | run the rebalance decision |
| `/lp-plan` | build a confirm-gated plan |
| `/lp-watch` | start a realtime watcher |
| `/lp-snapshot` | append a snapshot to the ledger |

## Calculation rules

- Token base-unit amounts are `bigint`. USD figures are `number` and labelled as estimates.
- Set token decimals from the mint account. Do not hardcode them.
- Use a fresh price for liquidation checks and for sizing. Cached prices are for display only.
- Return explicit errors, never `NaN`.
- Convert ticks or bins to a price band before any impermanent-loss or decision math.

## Security

- Never expose keys or seed phrases.
- Never auto-execute. Build a plan, simulate, require a typed confirmation, then delegate signing to `solana-dev`.
- Always show exact amounts and destinations before any action.
- Caps for slippage, notional, position size, and daily loss are required before a plan is cleared.

## Repository structure

```
position-manager-skill/
  CLAUDE.md
  README.md
  install.sh         Claude (.claude) or Codex (--agents, .agents)
  install-custom.sh
  .claude-plugin/marketplace.json
  skill/
    SKILL.md
    leaves/        focused topic docs
    resources.md
    engine/        tested TypeScript core, with errors.ts and sources/ (readers, rpc, registry)
  agents/          includes openai.yaml for Codex
  commands/
  rules/
  scripts/         validate.mjs, the skill linter
  evals/           trigger queries and output evals
```

## Branch workflow

```
git checkout -b feat/<scope>
```

Main skill entry: `skill/SKILL.md`.
