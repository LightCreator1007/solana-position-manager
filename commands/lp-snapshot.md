---
description: Append a position snapshot to the local ledger
---

Append a snapshot so P&L and fee velocity improve over time.

## Steps

1. Resolve the wallet from the argument or `WALLET_ADDRESS`.
2. Fetch current positions and prices. Label stale prices.
3. Build a `Snapshot` and append it with `engine/ledger.ts` `appendSnapshot(snapshot)`.
4. Confirm the path written and the snapshot count for the wallet.

The ledger is append-only and lives under `LP_DESK_HOME`, default `./.lp-desk`. Snapshots feed
`engine/pnl.ts` for measured fee velocity and time-weighted return.
