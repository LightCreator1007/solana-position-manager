import { test } from "node:test";
import assert from "node:assert/strict";
import { strOf, numOf, bigOf } from "./extract.ts";

test("strOf returns the first present key", () => {
  assert.equal(strOf({ b: "second", a: "first" }, ["a", "b"]), "first");
  assert.equal(strOf({ b: "second" }, ["a", "b"]), "second");
  assert.equal(strOf({}, ["a"], "fallback"), "fallback");
});

test("numOf coerces numbers, bigints, and numeric strings", () => {
  assert.equal(numOf({ a: 5 }, ["a"]), 5);
  assert.equal(numOf({ a: 7n }, ["a"]), 7);
  assert.equal(numOf({ a: "9.5" }, ["a"]), 9.5);
  assert.equal(numOf({}, ["a"], 3), 3);
});

test("bigOf preserves integer precision and rejects non-integers", () => {
  assert.equal(bigOf({ a: 10n }, ["a"]), 10n);
  assert.equal(bigOf({ a: "123456789012345678901234567890" }, ["a"]), 123456789012345678901234567890n);
  assert.equal(bigOf({ a: 42 }, ["a"]), 42n);
  assert.equal(bigOf({ a: 1.5 }, ["a"], 0n), 0n);
});
