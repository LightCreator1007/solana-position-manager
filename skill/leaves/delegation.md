# Delegation

Goal: hand transaction building, signing, and submission to the right skill. This skill plans and
analyses. It does not sign.

## Division of responsibility

- This skill: read positions, compute risk, decide, build a plan, render the report.
- `solana-dev` core skill: build instructions, set priority fees, sign, simulate, and submit.
- Jupiter skill: swap quotes and swap transactions, used during a rebalance to reach the target deposit ratio.

## The handoff

1. Build the plan with `engine/plan.ts` `buildPlan(position, toBand, priceUsd)`. The plan lists the steps. No transaction is built here, and no confirm phrase is fixed yet.
2. Pass each step to `solana-dev` to construct and simulate the transaction.
3. Run the plan through `engine/safety.ts` `guard(metrics, caps, ctx)`. It derives the confirm phrase from the simulated transaction with `txConfirmPhrase`, and clears submission only when caps pass, the simulation succeeds, dry run is off, and the human typed the phrase for that exact transaction.
4. On a cleared guard, `solana-dev` signs and submits the exact transaction the guard cleared. Rebuilding the transaction after clearance voids the confirmation. On a rebalance that needs a token swap, route that leg to the Jupiter skill first.

## Rule

No path in this skill signs or submits. If a user asks it to execute directly, build the plan, show it,
and route to `solana-dev`. See `safety.md` for the gate.
