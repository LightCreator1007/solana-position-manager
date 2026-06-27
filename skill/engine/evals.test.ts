import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const evalsPath = (name: string): string => fileURLToPath(new URL(`../../evals/${name}`, import.meta.url));
function loadEvals(name: string): unknown {
  return JSON.parse(readFileSync(evalsPath(name), "utf8"));
}

// The evals folder is repo tooling, not part of an installed skill. Skip the lint
// when it is not reachable so the suite still passes from an installed copy.
const present = existsSync(evalsPath("trigger-queries.json")) && existsSync(evalsPath("evals.json"));

test("trigger queries are balanced and well formed", { skip: !present }, () => {
  const queries = loadEvals("trigger-queries.json") as Array<{ query: string; should_trigger: boolean }>;
  assert.ok(Array.isArray(queries));
  for (const q of queries) {
    assert.equal(typeof q.query, "string");
    assert.ok(q.query.length > 0);
    assert.equal(typeof q.should_trigger, "boolean");
  }
  const positive = queries.filter((q) => q.should_trigger).length;
  const negative = queries.filter((q) => !q.should_trigger).length;
  assert.ok(positive >= 10, `want >=10 positive, got ${positive}`);
  assert.ok(negative >= 10, `want >=10 negative, got ${negative}`);
});

test("output evals carry a prompt, expected output, and gradable assertions", { skip: !present }, () => {
  const doc = loadEvals("evals.json") as {
    skill_name: string;
    evals: Array<{ id: number; prompt: string; expected_output: string; files: unknown[]; assertions: string[] }>;
  };
  assert.equal(doc.skill_name, "position-manager");
  assert.ok(doc.evals.length >= 5);
  const ids = new Set<number>();
  for (const e of doc.evals) {
    assert.equal(typeof e.id, "number");
    assert.ok(!ids.has(e.id), `duplicate eval id ${e.id}`);
    ids.add(e.id);
    assert.ok(e.prompt.length > 0);
    assert.ok(e.expected_output.length > 0);
    assert.ok(Array.isArray(e.files));
    assert.ok(e.assertions.length >= 3);
    for (const a of e.assertions) assert.ok(typeof a === "string" && a.length > 0);
  }
});
