import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EngineError,
  classifyError,
  errorEnvelope,
  redactSecrets,
  safeEndpoint,
} from "./errors.ts";

test("EngineError carries a code, a remediation, and a json envelope", () => {
  const e = new EngineError("RPC_FAILED", "fetch failed", { endpoint: "https://x.test" });
  assert.equal(e.code, "RPC_FAILED");
  assert.ok(e.remediation.length > 0);
  const json = e.toJSON();
  assert.equal(json.ok, false);
  assert.equal(json.code, "RPC_FAILED");
  assert.equal(json.message, "fetch failed");
  assert.deepEqual(json.details, { endpoint: "https://x.test" });
});

test("redactSecrets removes secret-named keys and keeps public ones", () => {
  const out = redactSecrets({ apiKey: "abc", seed: "x", tokenMint: "So111", method: "getProgramAccounts" });
  assert.equal(out?.apiKey, "[redacted]");
  assert.equal(out?.seed, "[redacted]");
  assert.equal(out?.tokenMint, "So111");
  assert.equal(out?.method, "getProgramAccounts");
});

test("safeEndpoint keeps the origin and drops a key in the query or path", () => {
  assert.equal(safeEndpoint("https://mainnet.helius-rpc.com/?api-key=SECRET"), "https://mainnet.helius-rpc.com");
  assert.equal(safeEndpoint("https://rpc.test/v1/SECRETKEY"), "https://rpc.test");
  assert.equal(safeEndpoint("not a url"), "[unparseable-url]");
});

test("classifyError maps common failures to stable codes", () => {
  assert.equal(classifyError(new Error("Cannot find package '@orca-so/whirlpools'")).code, "DEPENDENCY_MISSING");
  assert.equal(classifyError(new Error("fetch failed")).code, "RPC_FAILED");
  assert.equal(classifyError(new Error("ENOENT: no such file")).code, "LEDGER_IO");
  assert.equal(classifyError("weird").code, "UNKNOWN");
  const passthrough = new EngineError("INVALID_INPUT", "bad");
  assert.equal(classifyError(passthrough), passthrough);
});

test("errorEnvelope returns a failure envelope", () => {
  const env = errorEnvelope(new Error("ETIMEDOUT"));
  assert.equal(env.ok, false);
  assert.equal(env.code, "RPC_FAILED");
});
