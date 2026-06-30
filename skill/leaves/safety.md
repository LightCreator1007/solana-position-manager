# Safety

This skill plans and never signs. Every fund-moving path goes through the guard before submission.

## The canon

1. Never sign or submit without an explicit typed human confirmation.
2. Always simulate before submit. Reject on a simulation error.
3. Caps are required arguments, not optional config: slippage, notional, position size, daily loss.
4. Defaults are `DRY_RUN=true` and `REQUIRE_CONFIRM=true`.
5. No flag bypasses the gate.

## The guard

`engine/safety.ts` `guard(metrics, caps, ctx)`:

- Throws on a hard violation: kill switch engaged, a missing or zero cap, a cap breach, or a failed simulation.
- Returns `{ ok: false, reason }` when it simulated only (dry run) or is awaiting the typed confirmation.
- Returns `{ ok: true }` only when caps pass, the simulation succeeds, dry run is off, and the typed phrase matches.

```ts
const result = await guard(metrics, caps, ctx);
if (result.ok) { /* hand to solana-dev to sign and submit */ }
```

`metrics` carries the plan's notional, resulting position size, slippage, and the base64 transaction.
`ctx` carries the dry-run and confirm flags, the kill switch, the typed phrase, the venue and ref, the
running daily loss, and the simulate function.

## The confirm phrase binds to the transaction

The expected phrase is not stored in the plan. The guard derives it from the exact bytes it just
simulated with `txConfirmPhrase(venue, ref, txBase64)`, which appends a hash of the transaction:

```
CONFIRM REBALANCE <venue> <ref8> <txhash8>
```

This closes two gaps. The phrase cannot be precomputed before the transaction exists, and a transaction
swapped between the human reading the plan and submission no longer matches the phrase they typed. Submit
only the exact transaction the guard cleared; rebuilding it after clearance voids the confirmation.

## Operational notes

- The kill switch is checked first and halts every path. Read it fresh from a persisted source each call, not once at startup.
- Track realised daily loss across runs. An in-memory counter that resets on restart would defeat the cap. Use the ledger-backed daily-loss tracker (`engine/ledger.ts`).
