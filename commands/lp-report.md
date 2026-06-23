---
description: Render a position health report for a wallet
---

Render the health report for a wallet.

## Steps

1. Resolve the wallet from the argument or `WALLET_ADDRESS`.
2. Fetch positions across Orca, Raydium, Meteora, and Kamino. See `skill/leaves/positions.md`.
3. Price them with `engine/prices.ts`. Label stale prices.
4. Append a snapshot to the ledger with `engine/ledger.ts`.
5. Render with `engine/report.ts` `renderReport(snapshot)`. Show the Markdown report.
6. Lead with the health score and any critical alert.

Analysis only. To act on a finding, route to `/lp-decide` then `skill/leaves/delegation.md`.
