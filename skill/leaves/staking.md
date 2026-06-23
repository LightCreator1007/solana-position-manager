# Staking

Goal: track staked SOL and liquid staking tokens, and value them correctly.

## Liquid staking tokens

A liquid staking token is worth more than 1 SOL once rewards accrue. Value it at its exchange rate, not
at 1:1.

| Protocol | Token | Rate |
| --- | --- | --- |
| Marinade | mSOL | mSOL to SOL |
| Jito | JitoSOL | JitoSOL to SOL |
| Sanctum | various | per-token rate |

The exchange rate comes from the protocol state account or the protocol API. Multiply token balance by
the rate, then by the SOL price, to get USD value.

## Native stake accounts

Native stake accounts have an activation and a deactivation period. Track the epoch at which a deactivating
stake becomes withdrawable, and surface it when it is within a couple of days.

## Present it

Show each staking position, its SOL-equivalent value, the current yield, and any pending unlock. Liquid
staking tokens are also tradeable on the DEXes this skill covers, so a user may hold one both as a stake
and inside a liquidity position. Avoid double counting. Route to `portfolio.md` for the combined view.
