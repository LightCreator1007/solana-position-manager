# Stack

Last verified June 2026. Run `npm view <package> version` to confirm the latest before relying on a pin.

## Runtime

- Node 22 or newer. The engine runs as TypeScript through native type stripping, so `node --test` runs the suite with no build step and no install.
- `tsc` is a dev dependency for typechecking only.

## Engine

The pure modules in `engine/` have no runtime dependencies. USD figures use `number`; token base-unit
amounts use `bigint`.

## Optional venue SDKs

Imported lazily, listed in `optionalDependencies`, so the engine compiles and tests without them:

- `@orca-so/whirlpools` for Orca.
- `@raydium-io/raydium-sdk-v2` for Raydium CLMM.
- `@meteora-ag/dlmm` for Meteora DLMM.
- `@kamino-finance/kliquidity-sdk` for Kamino.

## Data and signing

- Prices: Jupiter price API, Birdeye fallback.
- RPC and assets: Helius.
- Signing and submission: the `solana-dev` core skill. Swaps: the Jupiter skill.

## Version policy

Pin alpha packages exactly. Re-verify SDK field names against the installed version, since the venue
readers extract fields defensively but assume current key names.
