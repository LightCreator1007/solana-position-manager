import { test } from "node:test";
import assert from "node:assert/strict";
import { lpUnitRealizedGain } from "./taxlots.ts";

test("lpUnitRealizedGain treats the LP position as one asset, avoiding per-token basis mismatch", () => {
  // Deposited $1000, withdrew $950 of (now differently-weighted) tokens, plus $80
  // of collected fees. Per-token lot tracking would flag missing basis because the
  // withdrawn token amounts differ from the deposited ones; the unit method does not.
  const r = lpUnitRealizedGain({ depositedUsd: 1000, withdrawnUsd: 950, feesUsd: 80 });
  assert.equal(r.basisUsd, 1000);
  assert.equal(r.proceedsUsd, 1030);
  assert.equal(r.gainUsd, 30);
});

test("lpUnitRealizedGain defaults fees to zero and reports a loss as negative", () => {
  const r = lpUnitRealizedGain({ depositedUsd: 1000, withdrawnUsd: 900 });
  assert.equal(r.proceedsUsd, 900);
  assert.equal(r.gainUsd, -100);
});
