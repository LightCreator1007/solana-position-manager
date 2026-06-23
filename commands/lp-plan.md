---
description: Build a simulate-first, confirm-gated rebalance plan
---

Build a rebalance plan. This never signs or submits.

## Steps

1. Take the position and a target band, from `/lp-decide` or the user.
2. Build the plan with `engine/plan.ts` `buildPlan(position, toBand, priceUsd)`. It lists the steps and a confirm phrase.
3. Hand each step to `solana-dev` to construct and simulate the transaction.
4. Run `engine/safety.ts` `guard(metrics, caps, ctx)` with caps from the environment. It clears submission only when caps pass, the simulation succeeds, dry run is off, and the typed phrase matches.
5. Show the plan, the simulation result, and the confirm phrase. Ask the user to type the phrase exactly.
6. On a cleared guard, route signing and submission to `solana-dev`. For a swap leg, route to the Jupiter skill first.

Defaults are `DRY_RUN=true` and `REQUIRE_CONFIRM=true`. No flag bypasses the gate. See `skill/leaves/safety.md`.
