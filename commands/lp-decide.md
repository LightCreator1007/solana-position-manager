---
description: Run the tax-aware rebalance decision for a position
---

Decide whether to rebalance a position.

## Steps

1. Identify the position from the argument or the latest snapshot.
2. Convert its band to a price band with `engine/sources/ticks.ts`.
3. Gather inputs: deposit value, fee velocity from the ledger, realised volatility from a price series, and realised gain if closed from `engine/taxlots.ts`.
4. Run `engine/decide.ts` `decideRebalance(input)`.
5. Present the action, the expected-value delta, the recommended band, the break-even horizon, and the out-of-range probability.
6. If a gain is involved, show the result with and without tax. Set `taxRateBps` from `TAX_RATE_BPS`.

Read `skill/leaves/pitfalls.md` before recommending action. To build a plan, use `/lp-plan`.
