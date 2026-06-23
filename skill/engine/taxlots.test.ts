import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLots, realizedGainIfClosed, type LotEvent } from "./taxlots.ts";

const day = 86400;

const twoLotsThenSell: LotEvent[] = [
  { kind: "acquire", mint: "X", amountUi: 10, priceUsd: 100, atUnix: 0 },
  { kind: "acquire", mint: "X", amountUi: 10, priceUsd: 200, atUnix: day },
  { kind: "dispose", mint: "X", amountUi: 10, priceUsd: 250, atUnix: 2 * day },
];

test("fifo and hifo realize different gains on the same events", () => {
  const fifo = buildLots(twoLotsThenSell, "fifo");
  const hifo = buildLots(twoLotsThenSell, "hifo");
  assert.equal(fifo.realizedGainUsd, 1500);
  assert.equal(hifo.realizedGainUsd, 500);
  assert.equal(fifo.openLots.reduce((a, l) => a + l.amountUi, 0), 10);
});

test("holding period sets short vs long term", () => {
  const short = buildLots(
    [
      { kind: "acquire", mint: "X", amountUi: 1, priceUsd: 10, atUnix: 0 },
      { kind: "dispose", mint: "X", amountUi: 1, priceUsd: 12, atUnix: 30 * day },
    ],
    "fifo",
  );
  assert.equal(short.disposals[0].term, "short");

  const long = buildLots(
    [
      { kind: "acquire", mint: "X", amountUi: 1, priceUsd: 10, atUnix: 0 },
      { kind: "dispose", mint: "X", amountUi: 1, priceUsd: 12, atUnix: 400 * day },
    ],
    "fifo",
  );
  assert.equal(long.disposals[0].term, "long");
});

test("disposing more than tracked flags missing basis", () => {
  const result = buildLots(
    [
      { kind: "acquire", mint: "X", amountUi: 5, priceUsd: 100, atUnix: 0 },
      { kind: "dispose", mint: "X", amountUi: 10, priceUsd: 150, atUnix: day },
    ],
    "fifo",
  );
  assert.equal(result.realizedGainUsd, 250 + 750);
  assert.ok(result.notes.some((n) => n.includes("missing cost basis")));
});

test("realizedGainIfClosed is flagged ambiguous and matches open lots", () => {
  const built = buildLots(
    [{ kind: "acquire", mint: "SOL", amountUi: 10, priceUsd: 100, atUnix: 0 }],
    "fifo",
  );
  const close = realizedGainIfClosed(
    [{ mint: "SOL", amountUi: 10, priceUsd: 150 }],
    built.openLots,
    "fifo",
    day,
  );
  assert.equal(close.gainUsd, 500);
  assert.ok(close.ambiguous);
  assert.ok(close.notes.some((n) => n.includes("CPA")));
});
