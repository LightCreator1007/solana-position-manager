# Rebalance Decision

Goal: answer "should I rebalance, when, and how wide" as an expected-value question, not a reflex.

Out of range does not always mean rebalance. Rebalancing costs gas and slippage, concentrates more
impermanent-loss risk, and can realise a taxable gain. The decision compares the value of acting now
against the value of waiting.

## The model

`decideRebalance(input)` in `engine/decide.ts` returns an action and the full breakdown.

```
EV(rebalance) - EV(hold) =
    projected_fees(new band)        // re-centering, scaled by concentration
  - projected_fees(current band)    // what staying earns, near zero when out of range
  - expected_extra_impermanent_loss // a tighter band carries more risk
  - gas - expected_slippage         // friction
  - tax_drag                        // realised gain * tax rate, only on gains
```

`action` is `REBALANCE` when the expected-value delta clears the safety margin, otherwise `HOLD`.

## Inputs

Required: `currentPrice`, `currentBand` (price space), `depositValueUsd`, `feeVelocityUsdPerDay`,
`volAnnual`. Optional: `horizonDays` (default 14), `gasCostUsd`, `slippageBps`, `rebalanceNotionalUsd`,
`candidateWidth`, `realizedGainUsd`, `taxRateBps`, `safetyMarginUsd`, `concentrationEfficiency`.

`concentrationEfficiency` (default 0.5, range 0 to 1) governs how much of the raw width-ratio fee uplift a
tighter band is assumed to capture. A narrower range does not earn fees in linear proportion to how much
tighter it is, so the default discounts the uplift; 1 restores the old linear assumption. Raise it from
measured post-rebalance fee velocity, do not assume it.

Derive the live inputs from the rest of the engine:

- `currentBand` from `clmmBandToPrices` or `dlmmBandToPrices`.
- `feeVelocityUsdPerDay` from `pairPriceSeries` plus `feeVelocityUsdPerDay` in `engine/pnl.ts`.
- `volAnnual` from `realizedVolAnnualized`.
- `realizedGainUsd` from `realizedGainIfClosed` in `engine/taxlots.ts`.

When `candidateWidth` is omitted, the engine derives a volatility-adjusted width.

## Output

`action`, `evDeltaUsd`, `breakEvenHorizonDays`, `recommendedBand`, `recommendedWidth`,
`outOfRangeProbCurrent`, the fee and impermanent-loss components, `frictionUsd`, `taxDragUsd`,
`confidence`, `notes`, and `inputs` echoed back. Show the components, not only the verdict. The break-even
horizon is the number of days at which acting turns positive, or none within a year.

## Tax awareness

This is the part most tools miss. Set `taxRateBps` and `realizedGainUsd` to fold the cost of realising a
gain into the decision. A rebalance that looks worthwhile before tax can be negative after it, because
closing the position disposes tokens. The engine applies tax drag only to positive realised gains and
labels the result an estimate. Confirm taxability with a CPA, see `pnl-and-tax.md`.

## Present it

State the action, the expected-value delta in dollars, the recommended band, the break-even horizon, and
the out-of-range probability. Offer the no-tax and after-tax figures side by side when a gain is
involved. Then route to `pitfalls.md`, and to `delegation.md` only if the user wants to act.
