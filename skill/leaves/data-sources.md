# Data Sources

Goal: fetch on-chain positions and prices, and wire them into the engine. TypeScript throughout, to match
the engine.

## Prices

`engine/prices.ts` `usdPrices(mints, opts)` tries Jupiter, falls back to Birdeye, and labels anything it
cannot resolve as stale with a zero value. Pass a `fetchImpl` to test without network.

```ts
import { usdPrices } from "../engine/prices.ts";
const { usd, source } = await usdPrices([solMint, usdcMint], { birdeyeApiKey });
```

Critical operations need a fresh price, under about 30 seconds old. Never price a liquidation check from
cache.

## Positions

Two ways to find a wallet's positions:

- Helius `getAssetsByOwner` returns token accounts and program-owned accounts in one call. It is cheaper than scanning a program.
- `getProgramAccounts` with a memcmp filter on the owner field returns every position account for a program. It is heavier and some RPCs throttle it.

Decode the account into the fields each venue reader expects, then pass a fetcher to `read`:

```ts
import * as orca from "../engine/sources/orca.ts";
const positions = await orca.read(owner, {}, async () => decodedRawRecords);
```

The reader maps each raw record with defensive field extraction, so minor SDK key changes do not break
it. Set decimals from the mint account with `getMint`, do not hardcode them.

## Program IDs

| Venue | Program ID |
| --- | --- |
| Orca Whirlpools | `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` |
| Raydium CLMM | `CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK` |
| Meteora DLMM | `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo` |

Verify these against the explorer before relying on them.

## Realtime

`accountSubscribe` over a websocket fires on every slot change for an account. Subscribe to the pool
account, decode the current tick or active bin, and compare against the stored band. Debounce, and
reconnect on a dropped socket. See `stream-sentinel` and `/lp-watch`.

## Caching

Cache prices for under a minute, account data for a few seconds, token metadata for a day. Tag cached
values so the agent can tell fresh from stale.
