# Evals

Two kinds of checks: whether the skill loads at the right time, and whether its
output is correct once loaded.

## Trigger evals

`trigger-queries.json` holds 10 prompts that should load the skill and 10 near-miss
prompts that should not. Run each query in a clean agent context with skill loading
observable, and mark it triggered only if the agent opens `position-manager/SKILL.md`.

Pass criteria:

- A positive query should trigger on more than half of its runs.
- A negative near-miss should trigger on less than half.
- If a negative triggers, tighten the description boundary in `SKILL.md` rather than
  adding a one-off keyword.

The negatives are deliberate neighbours: a plain Jupiter swap, a token launch, a
signed transfer, an Anchor audit, an NFT mint, a bridge, indexing, fee-market theory,
price charting, and an airdrop. None of these is LP position management.

## Output evals

`evals.json` holds prompts with an expected output and objective assertions. For each
case, run the prompt with the skill loaded and grade the result against every
assertion. Record `passed`, the per-assertion results, and concrete evidence.

The assertions track what makes this skill specific: the tax-aware expected-value
decision, the concentrated-liquidity IL with edge cases, measured P&L from the
snapshot ledger, lending health tiers, and the confirm-gated no-signing posture.

## Shape check

`node scripts/validate.mjs` confirms the eval files exist and are well formed, and the
engine test suite (`cd skill/engine && node --test`) lints their structure. Run both
before relying on the eval set.
