import { test } from "node:test";
import assert from "node:assert/strict";
import { VENUES, getVenue, listVenues, supportedVenues, plannedVenues } from "./registry.ts";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

test("the six built readers are present and supported", () => {
  for (const id of ["orca", "raydium", "raydium-cpmm", "meteora-dlmm", "meteora-damm-v2", "kamino"]) {
    const v = getVenue(id);
    assert.ok(v, `missing ${id}`);
    assert.notEqual(v!.discoveryStatus, "planned");
  }
  assert.equal(supportedVenues().length, 6);
  assert.equal(plannedVenues().length, 0);
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
