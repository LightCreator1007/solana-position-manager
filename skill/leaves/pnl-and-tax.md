# P&L and Tax Lots

Goal: report profit and loss from the snapshot ledger, and estimate cost basis.

## P&L from the ledger

`engine/pnl.ts` reads a list of snapshots and returns:

- `portfolioValueUsd(snapshot)`: total value at one point in time.
- `valueSeries(snaps)`: value over time.
- `feeVelocityUsdPerDay(snaps)`: measured fee accrual rate, counting only positive changes so a fee claim does not read as a loss.
- `simpleReturn(snaps)`: last value against first value. This ignores deposits and withdrawals between snapshots, so label it as such.
- `holdingPeriodDays(snaps)`: elapsed time across the ledger.

The ledger is append-only and lives under `LP_DESK_HOME` (default `./.lp-desk`). Take a snapshot with
`appendSnapshot` whenever you read positions, so these metrics improve over time. The ledger is the
backbone that makes P&L measured rather than guessed.

## Tax lots

`engine/taxlots.ts` builds cost basis from acquire and dispose events.

- `buildLots(events, method)` with method `fifo`, `hifo`, or `specid`. It returns realised gain, the
  disposals with holding period and short or long term, the remaining open lots, and notes.
- `realizedGainIfClosed(legs, openLots, method, atUnix)` estimates the gain if you closed a position now.
  It returns `ambiguous: true`, because whether providing or removing liquidity is a disposal is unsettled.

Per-wallet cost-basis tracking is the current standard for US filers. Method choice changes the realised
gain, so state which method you used. Feed `realizedGainIfClosed` into the rebalance decision to capture
tax drag, see `rebalance-decision.md`.

## Honesty rail

This is a record-keeping aid, not tax advice. Flag ambiguous lots and recommend a CPA for anything that
affects a filing.
