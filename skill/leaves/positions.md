# Positions

Goal: produce a normalised list of the user's positions and show their current state.

## The normalised shape

Every venue maps to `Position` in `engine/model.ts`:

- `venue`: `orca`, `raydium`, `meteora-dlmm`, or `kamino`.
- `kind`: `clmm`, `vault`, `lending`, or `staking`.
- `ref`: the pool, pair, vault, or obligation address.
- `band`: range bounds, tagged `tick` (Orca, Raydium) or `bin` (Meteora). CLMM bounds are half-open, DLMM bounds are inclusive. Never compare bounds across venues.
- `inRange`: whether the live tick or active bin sits inside the band.
- `legs`: token amounts in raw base units (`bigint`).
- `unclaimed`: fees per token, kept per mint. Do not sum fees across different mints.
- `health`: present for lending positions.

## Reading positions

Each venue reader in `engine/sources/` exposes `read(owner, opts, fetcher?)`. Pass a `fetcher` to inject
decoded account data, or wire the live path described in `data-sources.md`.

```ts
import * as orca from "../engine/sources/orca.ts";
const positions = await orca.read(owner, {}, myFetcher);
```

The pure mappers (`toPosition`) are the tested core. The live fetch wraps an optional venue SDK and
throws a clear error when that SDK is not installed.

## Taking a snapshot

To enable P&L and fee velocity later, append a snapshot with current prices:

```ts
import { appendSnapshot } from "../engine/ledger.ts";
appendSnapshot({ takenAtUnix, wallet, priceUsd, priceSource, positions });
```

Prices and their source come from `engine/prices.ts`. See `data-sources.md`.

## Present it

Show one row per position: venue, kind, value in USD, unclaimed fees, in-range flag. Use
`engine/report.ts` `renderReport(snapshot)` to produce the table and the alert banner in one call. Then
route to `risk.md` if the user wants impermanent loss, or `rebalance-decision.md` for an action.
