// Cost-basis tracking. Amounts are UI token units (number); USD figures are estimates.
// LP add/remove taxability is unsettled, so closes are flagged ambiguous.

export type TaxMethod = "fifo" | "hifo" | "specid";

export interface AcquireEvent {
  kind: "acquire";
  mint: string;
  amountUi: number;
  priceUsd: number;
  atUnix: number;
  lotId?: string;
}

export interface DisposeEvent {
  kind: "dispose";
  mint: string;
  amountUi: number;
  priceUsd: number;
  atUnix: number;
  lotRef?: string;
}

export type LotEvent = AcquireEvent | DisposeEvent;

export interface OpenLot {
  lotId: string;
  mint: string;
  amountUi: number;
  priceUsd: number;
  atUnix: number;
}

export interface Disposal {
  mint: string;
  atUnix: number;
  amountUi: number;
  proceedsUsd: number;
  costUsd: number;
  gainUsd: number;
  holdingDays: number;
  term: "short" | "long";
}

export interface LotResult {
  realizedGainUsd: number;
  disposals: Disposal[];
  openLots: OpenLot[];
  notes: string[];
}

const LONG_TERM_DAYS = 365;

function orderLots(lots: OpenLot[], method: TaxMethod, lotRef?: string): OpenLot[] {
  const indexed = lots.map((lot, i) => ({ lot, i }));
  if (method === "hifo") {
    indexed.sort((a, b) => b.lot.priceUsd - a.lot.priceUsd || a.i - b.i);
  } else if (method === "specid" && lotRef) {
    indexed.sort((a, b) => {
      if (a.lot.lotId === lotRef) return -1;
      if (b.lot.lotId === lotRef) return 1;
      return a.lot.atUnix - b.lot.atUnix || a.i - b.i;
    });
  } else {
    indexed.sort((a, b) => a.lot.atUnix - b.lot.atUnix || a.i - b.i);
  }
  return indexed.map((x) => x.lot);
}

function applyDisposal(
  openLots: OpenLot[],
  dispose: DisposeEvent,
  method: TaxMethod,
): { disposals: Disposal[]; notes: string[] } {
  let remaining = dispose.amountUi;
  const disposals: Disposal[] = [];
  const notes: string[] = [];
  const pool = openLots.filter((l) => l.mint === dispose.mint);
  const ordered = orderLots(pool, method, dispose.lotRef);

  for (const lot of ordered) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, lot.amountUi);
    if (take <= 0) continue;
    const proceedsUsd = take * dispose.priceUsd;
    const costUsd = take * lot.priceUsd;
    const holdingDays = (dispose.atUnix - lot.atUnix) / 86400;
    disposals.push({
      mint: dispose.mint,
      atUnix: dispose.atUnix,
      amountUi: take,
      proceedsUsd,
      costUsd,
      gainUsd: proceedsUsd - costUsd,
      holdingDays,
      term: holdingDays > LONG_TERM_DAYS ? "long" : "short",
    });
    lot.amountUi -= take;
    remaining -= take;
  }

  if (remaining > 1e-9) {
    const proceedsUsd = remaining * dispose.priceUsd;
    disposals.push({
      mint: dispose.mint,
      atUnix: dispose.atUnix,
      amountUi: remaining,
      proceedsUsd,
      costUsd: 0,
      gainUsd: proceedsUsd,
      holdingDays: 0,
      term: "short",
    });
    notes.push(`disposal of ${dispose.mint} exceeds tracked lots; missing cost basis treated as zero`);
  }

  return { disposals, notes };
}

export function buildLots(events: LotEvent[], method: TaxMethod): LotResult {
  const sorted = [...events].sort((a, b) => a.atUnix - b.atUnix);
  const openLots: OpenLot[] = [];
  const disposals: Disposal[] = [];
  const notes: string[] = [];
  let autoId = 0;

  for (const ev of sorted) {
    if (ev.kind === "acquire") {
      openLots.push({
        lotId: ev.lotId ?? `lot-${autoId++}`,
        mint: ev.mint,
        amountUi: ev.amountUi,
        priceUsd: ev.priceUsd,
        atUnix: ev.atUnix,
      });
    } else {
      const result = applyDisposal(openLots, ev, method);
      disposals.push(...result.disposals);
      notes.push(...result.notes);
    }
  }

  const realizedGainUsd = disposals.reduce((acc, d) => acc + d.gainUsd, 0);
  const remaining = openLots.filter((l) => l.amountUi > 1e-9);
  return { realizedGainUsd, disposals, openLots: remaining, notes };
}

export interface LpClose {
  depositedUsd: number; // USD value of the tokens deposited: the position's cost basis
  withdrawnUsd: number; // USD value of the tokens withdrawn at close
  feesUsd?: number; // fees collected over the position's life, added to proceeds
}

// LP-position-as-a-unit cost basis. Impermanent loss shifts the token ratio, so
// the amounts withdrawn differ from those deposited and per-token lot matching
// surfaces spurious missing-basis flags. Treating the whole position as one asset
// (proceeds minus basis, both in USD) is the clean method for an LP open/close.
// Taxability of an LP add/remove is unsettled; confirm treatment with a CPA.
export function lpUnitRealizedGain(close: LpClose): {
  basisUsd: number;
  proceedsUsd: number;
  gainUsd: number;
} {
  const basisUsd = close.depositedUsd;
  const proceedsUsd = close.withdrawnUsd + (close.feesUsd ?? 0);
  return { basisUsd, proceedsUsd, gainUsd: proceedsUsd - basisUsd };
}

export function realizedGainIfClosed(
  legs: { mint: string; amountUi: number; priceUsd: number }[],
  openLots: OpenLot[],
  method: TaxMethod,
  atUnix: number,
): { gainUsd: number; disposals: Disposal[]; ambiguous: boolean; notes: string[] } {
  const working = openLots.map((l) => ({ ...l }));
  const disposals: Disposal[] = [];
  const notes: string[] = ["closing an LP position may or may not be a taxable event; confirm with a CPA"];
  for (const leg of legs) {
    const ev: DisposeEvent = {
      kind: "dispose",
      mint: leg.mint,
      amountUi: leg.amountUi,
      priceUsd: leg.priceUsd,
      atUnix,
    };
    const result = applyDisposal(working, ev, method);
    disposals.push(...result.disposals);
    notes.push(...result.notes);
  }
  const gainUsd = disposals.reduce((acc, d) => acc + d.gainUsd, 0);
  return { gainUsd, disposals, ambiguous: true, notes };
}
