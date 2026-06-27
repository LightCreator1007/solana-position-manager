import { test } from "node:test";
import assert from "node:assert/strict";
import { VENUES, getVenue, listVenues, supportedVenues, plannedVenues } from "./registry.ts";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

test("the four built readers are present and supported", () => {
  for (const id of ["orca", "raydium", "meteora-dlmm", "kamino"]) {
    const v = getVenue(id);
    assert.ok(v, `missing ${id}`);
    assert.notEqual(v!.discoveryStatus, "planned");
  }
});

test("the roadmap venues are listed as planned, not supported", () => {
  const planned = plannedVenues().map((v) => v.id);
  assert.deepEqual(planned.sort(), ["meteora-damm-v2", "raydium-cpmm"]);
  assert.ok(!supportedVenues().some((v) => v.discoveryStatus === "planned"));
});

test("any declared program id is a plausible base58 address", () => {
  for (const v of listVenues()) {
    if (v.programId !== undefined) assert.ok(BASE58.test(v.programId), `${v.id} program id ${v.programId}`);
  }
});

test("every entry is read-only and documents its program id source and limitations", () => {
  for (const v of Object.values(VENUES)) {
    assert.equal(v.readOnly, true);
    assert.ok(v.programIdSource.length > 0);
    assert.ok(v.requiredFields.length > 0);
    assert.ok(v.limitations.length > 0);
  }
});
