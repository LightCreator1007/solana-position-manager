# Pool Safety

Goal: decide whether a pool is safe to provide liquidity to, before any capital goes in. Impermanent
loss math assumes the pool itself is sound. Often it is not.

## Checklist

Run all of these and report each as pass, warn, or fail.

- Token mint. Verify the exact mint address on Solscan or Birdeye. Copycat tokens reuse names and symbols. Match the mint, not the ticker.
- Pair age. Pools younger than seven days carry elevated risk. New pools see thin liquidity and erratic price.
- Holder concentration. If the top ten wallets hold more than half the supply, a single exit can move price hard against your range.
- Supply overhang. A wide gap between fully diluted value and market cap signals locked supply that can unlock and dilute.
- Depth against volume. Low pool depth with high 24 hour volume means large price impact and slippage when you enter or exit.
- Fee tier fit. Match the fee tier to the pair. Stable pairs want low fee tiers, volatile pairs want higher tiers to offset impermanent loss.

## How to gather the data

- Token and holder data: Helius `getAssetsByOwner` and the mint account, plus an explorer. See `data-sources.md`.
- Price, liquidity, and volume: Birdeye, Jupiter, or the pool account directly.
- Pair age: the pool account creation slot, or the explorer.

## Decision

If any check fails, say so plainly and recommend a small test position before committing size, or no
position at all. A high advertised APR on a young or concentrated pool is a warning, not an invitation.
Route to `risk.md` for the impermanent-loss picture once the pool clears these checks.
