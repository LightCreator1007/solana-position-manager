# Risk

Goal: quantify impermanent loss, out-of-range exposure, and volatility for a position.

## Impermanent loss

`engine/il.ts` works in price space, with token A priced in token B.

- `ilConstantProduct(ratio)`: the full-range result, `2*sqrt(r)/(1+r) - 1`. Use it as a sanity baseline.
- `clmmValueInB(liquidity, price, band)`: position value under the concentrated-liquidity formula, clamped to the band.
- `ilClmm({ entryPrice, exitPrice, band, depositValueInB })`: impermanent loss against holding, for a real range.

A concentrated range magnifies impermanent loss relative to full range. The narrower the band, the more
fees per dollar while in range, and the larger the loss when price moves.

## Convert ticks or bins to a price band

`engine/sources/ticks.ts` converts venue bounds to prices:

- `clmmBandToPrices(band, decimalsA, decimalsB)` for Orca and Raydium.
- `dlmmBandToPrices(band, binStepBps, decimalsA, decimalsB)` for Meteora.

The decision and impermanent-loss functions take a price band, so convert first.

## Volatility and out-of-range probability

- `realizedVolAnnualized(series)` reads a price series and returns annualised volatility from log returns.
- `outOfRangeProbability(currentPrice, band, volAnnual, horizonDays)` estimates the chance the price sits
  outside the band at the end of the horizon, under a driftless lognormal walk. This is an endpoint
  approximation, not a first-passage probability, so it understates the chance of touching a bound during
  the horizon. Treat it as directional.

Build the price series from the ledger with `pairPriceSeries(snaps, mintA, mintB)` in `engine/pnl.ts`, or
from a saved series like `engine/fixtures/series-soldusdc-90d.json`.

## Honesty rail

Studies of concentrated-liquidity pools repeatedly find that most providers underperform holding once
impermanent loss and gas are counted. Surface this when a result looks attractive. A low impermanent-loss
number on a tight range usually means low realised volatility so far, not low risk. Past fee APR does not
persist.
