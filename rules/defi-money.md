---
globs:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
exclude:
  - "**/node_modules/**"
---

# DeFi Money Rules

Standards for any code that touches token amounts or USD figures in this skill.

## Token amounts

Token base-unit amounts are `bigint`. Never hold a base-unit amount in a float.

```ts
// wrong
const raw = 1_500_000_000;
// right
const raw = 1_500_000_000n;
```

Convert to a display amount only at the edge, dividing by `10 ** decimals`. Read `decimals` from the
mint account, do not hardcode it.

## USD figures

USD values are derived estimates. They use `number` and are labelled as estimates. Do not construct an
on-chain instruction amount from a USD `number`. Size in base units.

## Fees

Keep unclaimed fees per mint. Do not sum fees across different tokens. Summing raw units of different
mints is dimensionally wrong.

## Ranges

Tick bounds and bin bounds are venue specific. CLMM bounds are half-open, DLMM bounds are inclusive. Do
not compare bounds across venues. Convert to a price band before any impermanent-loss or decision math.

## Prices

Critical paths, liquidation and sizing, use a fresh price under about 30 seconds old. Cached prices are
for display only. Label every price with its source and staleness.

## Failure

Validate inputs and return explicit errors. Never return `NaN` or a silent zero where a real value was
expected.

## Execution

Always simulate before submit. Never sign without a typed human confirmation. Caps for slippage,
notional, position size, and daily loss are required arguments.
