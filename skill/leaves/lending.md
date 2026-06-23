# Lending

Goal: track borrow positions and their distance from liquidation.

## Health factor

Health factor is `collateral_value * liquidation_threshold / borrow_value`. Below 1 the position is
liquidatable. The `Position.health` field carries this value for lending positions.

`engine/health.ts` escalates by tier:

- below 1.5: high, the position is close to risk.
- below 1.2: critical, liquidation is near. Recommend repaying or adding collateral now.

## Liquidation price

Solve for the collateral price at which health reaches 1. Below that price the position is liquidatable.
Always compute this from a fresh price, never a cached one. A stale price hides real liquidation risk.

## Supported protocols

| Protocol | Program ID | Risk metric |
| --- | --- | --- |
| Kamino | `KendFsFG6vFpYMV1QubitgVCZGKawdGQXeFbMYqKLGWE` | health factor |
| Marginfi | `MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA` | health factor |
| Solend | `So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo` | health factor |

Verify program IDs against the explorer before relying on them.

## Present it

Show collateral, borrow, health factor, and liquidation price. If health is low, lead with the alert and
the protective action. Route to `portfolio.md` to see lending exposure as a share of the whole portfolio.
