---
description: Start a realtime out-of-range watcher for a wallet
---

Watch a wallet's positions and alert when one goes out of range.

## Steps

1. Resolve the wallet and read its positions to get the pool accounts and bands.
2. Subscribe to each pool account with `accountSubscribe`, or a gRPC stream for many positions.
3. On each update, decode the current tick or active bin and compare against the stored band, using `engine/sources/ticks.ts` to match units.
4. Fire an informational alert when the live value crosses a bound.
5. Reconnect on a dropped socket. Keep a heartbeat.

Alerts never start a transaction. To act, route to `/lp-decide`. See the stream-sentinel agent.
