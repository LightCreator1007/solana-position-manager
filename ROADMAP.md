# Roadmap

Planned work, kept small and concrete. The current build covers four venues with
depth. Breadth comes next, only once the readers can be tested to the same bar.

## Two more pool surfaces

The venue registry (`skill/engine/sources/registry.ts`) already lists these as
`planned`, with the program id source and the fields a reader needs.

### Raydium CPMM

- Family: constant product, full range. The concentrated-liquidity range math does
  not apply. Use share-of-pool accounting: position value is `lpTokens / lpSupply`
  of each reserve.
- Reader: `engine/sources/raydium-cpmm.ts` with a pure `toPosition` and the same
  injectable fetcher seam as the others.
- IL: the full-range `ilConstantProduct` already in `engine/il.ts` is the right
  model here, so no new math is needed.
- Tests: a fixture position plus the share-of-pool valuation, in the style of the
  existing per-venue tests.

### Meteora DAMM v2

- Family: constant product. Same share-of-pool accounting as Raydium CPMM.
- Confirm the program id on an explorer before wiring the reader. The registry entry
  is intentionally marked unverified.
- SDK: `@meteora-ag/cp-amm-sdk`, imported lazily like the other venue SDKs.

## Definition of done for each

1. A pure `toPosition` transform with unit tests.
2. A normalized example snapshot in `engine/fixtures/examples/` with a golden verdict.
3. A registry entry promoted from `planned` to `sdk_adapter`.
4. The validator and the full test suite stay green.

## Not planned

- Holding keys, signing, or unattended execution. Signing stays delegated to
  `solana-dev`. This skill analyses and plans.
