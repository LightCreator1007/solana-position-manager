# Pitfalls

Read this before recommending any action.

- Impermanent loss is not realised until you close. Do not panic close during a dip if the thesis holds and the band still covers the likely range.
- Out of range does not always mean rebalance. Run the decision. A negative expected value means hold, even when the position earns nothing right now.
- A green backtest is not a forecast. Most concentrated-liquidity providers lose to holding after impermanent loss and gas. Tight ranges amplify this.
- Price can drift back in range between your check and your transaction. Re-read the live tick right before building the close.
- Closing a position can be a taxable event. Fold tax drag into the decision and flag ambiguous lots for a CPA.
- Do not sum fees across different mints. They are different tokens. The engine keeps them separate.
- Tick bounds and bin bounds are not comparable across venues. Convert to a price band first.
- Decimals come from the mint account. Hardcoding them produces silently wrong values.
- Prices go stale. Use a fresh price for liquidation and for sizing, never a cached one.
- Leave a small SOL buffer for fees. A rebalance that cannot pay its own transaction fee fails halfway.
- Never sign without a typed confirmation. There is no force flag in this skill.
