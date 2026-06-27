---
name: position-manager
description: Track and manage Solana liquidity, lending, and staking positions across Orca Whirlpools, Raydium CLMM, Meteora DLMM, and Kamino. Computes impermanent loss, out-of-range alerts, a tax-aware rebalance expected-value decision, FIFO/HIFO/SpecID tax lots, time-weighted P&L from a local snapshot ledger, and a portfolio health report. Analysis and planning only. It never signs or submits transactions.
user-invocable: true
---

# Solana Position Manager

Turns raw on-chain positions into a health report and a tax-aware rebalance decision. The judgement
layer is a small TypeScript engine under `engine/` with unit tests and no network dependency, so every
number is reproducible. Signing and submission are delegated to the core `solana-dev` skill and the
Jupiter skill. This skill plans, it does not execute.

## What this skill does

- Normalises positions across Orca, Raydium, Meteora DLMM, and Kamino into one shape.
- Computes impermanent loss with the concentrated-liquidity value function, not a constant-product approximation.
- Decides whether to rebalance by expected value: projected fees against impermanent loss, gas, slippage, and tax drag.
- Keeps a local append-only snapshot ledger so P&L and fee velocity are measured, not assumed.
- Tracks cost basis with FIFO, HIFO, or specific identification.
- Flags out-of-range positions, low lending health, concentration, Token-2022 mints, locked positions, thin liquidity, and inverted price orientation.
- Renders a position health report as Markdown and JSON.

## What this skill does not do

- It does not hold keys, sign, or submit transactions.
- It does not run unattended. Alerts are informational.
- It does not give tax advice. The tax-drag figure is a record-keeping aid; ambiguous lots are flagged for a CPA.
- It does not act as a price oracle. It consumes prices and labels their source and staleness.

## Source precedence

1. On-chain account state is ground truth.
2. SDK quote or simulation is next, used for pricing and sizing.
3. Cached values are last resort and must be labelled stale.
4. Always simulate before any submit. Never sign without an explicit typed human confirmation.
5. Caps for slippage, notional, position size, and daily loss are required before a plan is handed off.

## Task routing guide

Open one leaf per task.

| User asks about | Open |
| --- | --- |
| list, show, or track positions | `leaves/positions.md` |
| impermanent loss, in range, out of range | `leaves/risk.md` |
| should I rebalance, when, how wide | `leaves/rebalance-decision.md` |
| is this pool safe to provide liquidity to | `leaves/pool-safety.md` |
| lending health, liquidation price | `leaves/lending.md` |
| staking, liquid staking tokens, unlocks | `leaves/staking.md` |
| P&L, cost basis, tax lots | `leaves/pnl-and-tax.md` |
| portfolio allocation, health score | `leaves/portfolio.md` |
| fetch on-chain data, RPC, prices | `leaves/data-sources.md` |
| build, sign, or submit a transaction | `leaves/delegation.md` |
| mistakes to avoid before acting | `leaves/pitfalls.md` |
| which SDK or version | `leaves/stack.md` |
| caps, confirm gate, kill switch | `leaves/safety.md` |

## Operating procedure

1. Read positions first. Present current state with exact numbers before any suggestion.
2. Assess risk second. Impermanent loss, out-of-range status, lending health, concentration.
3. Suggest actions third. Frame options with trade-offs. Always read `leaves/pitfalls.md` first.
4. Confirm before execute. Show the plan, simulate it, and require a typed confirmation. Submission goes through `solana-dev`.

## The engine

The leaves call importable functions in `engine/`. Each pure module has unit tests that run with
`node --test` and no network.

| Module | Purpose |
| --- | --- |
| `engine/model.ts` | normalised `Position` and `Snapshot` types |
| `engine/il.ts` | CLMM value, impermanent loss with edge cases, break-even fee APR, realised and EWMA volatility, out-of-range probability |
| `engine/ledger.ts` | append and read the local snapshot ledger |
| `engine/pnl.ts` | portfolio value, fee velocity, time-weighted return, pair price series |
| `engine/decide.ts` | tax-aware rebalance expected value |
| `engine/taxlots.ts` | FIFO, HIFO, and SpecID cost basis |
| `engine/health.ts` | escalations (range, lending, concentration, Token-2022, locked, thin liquidity, orientation) and portfolio score |
| `engine/plan.ts` | build a rebalance plan, no transaction is built |
| `engine/safety.ts` | the execution guard |
| `engine/report.ts` | render the health report |
| `engine/prices.ts` | USD prices with source and staleness labels |
| `engine/errors.ts` | typed `EngineError` with remediation and secret redaction |
| `engine/sources/*.ts` | per-venue readers, an injectable fetcher, and pure transforms |
| `engine/sources/rpc.ts` | read-only JSON-RPC client and position-NFT discovery |
| `engine/sources/registry.ts` | venue registry: program ids, SDKs, limitations, roadmap |

## Default stack (June 2026)

| Layer | Choice |
| --- | --- |
| Runtime | Node 22+ (engine runs on native TypeScript type stripping) |
| Position math | the local `engine/` modules |
| Prices | Jupiter price API, Birdeye fallback |
| RPC and assets | Helius |
| Venue SDKs | optional, imported lazily: `@orca-so/whirlpools`, `@raydium-io/raydium-sdk-v2`, `@meteora-ag/dlmm`, `@kamino-finance/kliquidity-sdk` |
| Signing | delegated to `solana-dev`; swaps to the Jupiter skill |

See `leaves/stack.md` for version notes.

## Agents

| Agent | Use when |
| --- | --- |
| `desk-analyst` | fetch positions and render the health report (sonnet) |
| `rebalance-strategist` | run the decision, propose a band, write a plan (opus) |
| `stream-sentinel` | wire or debug realtime out-of-range alerts (sonnet) |

## Commands

| Command | Does |
| --- | --- |
| `/lp-report` | render the health report for a wallet |
| `/lp-decide` | run the rebalance decision for a position |
| `/lp-plan` | build a simulate-first, confirm-gated plan |
| `/lp-watch` | start a realtime out-of-range watcher |
| `/lp-snapshot` | append a snapshot to the ledger |
