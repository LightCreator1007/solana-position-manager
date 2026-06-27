import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Position, Snapshot, TokenLeg } from "./model.ts";
import { EngineError, classifyError } from "./errors.ts";

// JSON-safe shapes. bigint base units are stored as decimal strings.
interface TokenLegDto {
  mint: string;
  decimals: number;
  raw: string;
  tokenProgram?: TokenLeg["tokenProgram"];
  transferFeeBps?: number;
  hasTransferHook?: boolean;
}

interface PositionDto {
  venue: Position["venue"];
  kind: Position["kind"];
  ref: string;
  band?: Position["band"];
  inRange?: boolean;
  legs: { a: TokenLegDto; b?: TokenLegDto };
  unclaimed: { a: string; b?: string };
  health?: number;
  openedAtUnix?: number;
  locked?: boolean;
  poolLiquidityUsd?: number;
  poolVolume24hUsd?: number;
}

interface SnapshotDto {
  takenAtUnix: number;
  wallet: string;
  priceUsd: Record<string, number>;
  priceSource: Snapshot["priceSource"];
  positions: PositionDto[];
}

const legToDto = (leg: TokenLeg): TokenLegDto => {
  const dto: TokenLegDto = { mint: leg.mint, decimals: leg.decimals, raw: leg.raw.toString() };
  if (leg.tokenProgram !== undefined) dto.tokenProgram = leg.tokenProgram;
  if (leg.transferFeeBps !== undefined) dto.transferFeeBps = leg.transferFeeBps;
  if (leg.hasTransferHook !== undefined) dto.hasTransferHook = leg.hasTransferHook;
  return dto;
};

const legFromDto = (dto: TokenLegDto): TokenLeg => {
  const leg: TokenLeg = { mint: dto.mint, decimals: dto.decimals, raw: BigInt(dto.raw) };
  if (dto.tokenProgram !== undefined) leg.tokenProgram = dto.tokenProgram;
  if (dto.transferFeeBps !== undefined) leg.transferFeeBps = dto.transferFeeBps;
  if (dto.hasTransferHook !== undefined) leg.hasTransferHook = dto.hasTransferHook;
  return leg;
};

function positionToDto(p: Position): PositionDto {
  const dto: PositionDto = {
    venue: p.venue,
    kind: p.kind,
    ref: p.ref,
    legs: { a: legToDto(p.legs.a) },
    unclaimed: { a: p.unclaimed.a.toString() },
  };
  if (p.legs.b) dto.legs.b = legToDto(p.legs.b);
  if (p.unclaimed.b !== undefined) dto.unclaimed.b = p.unclaimed.b.toString();
  if (p.band) dto.band = p.band;
  if (p.inRange !== undefined) dto.inRange = p.inRange;
  if (p.health !== undefined) dto.health = p.health;
  if (p.openedAtUnix !== undefined) dto.openedAtUnix = p.openedAtUnix;
  if (p.locked !== undefined) dto.locked = p.locked;
  if (p.poolLiquidityUsd !== undefined) dto.poolLiquidityUsd = p.poolLiquidityUsd;
  if (p.poolVolume24hUsd !== undefined) dto.poolVolume24hUsd = p.poolVolume24hUsd;
  return dto;
}

function positionFromDto(dto: PositionDto): Position {
  const p: Position = {
    venue: dto.venue,
    kind: dto.kind,
    ref: dto.ref,
    legs: { a: legFromDto(dto.legs.a) },
    unclaimed: { a: BigInt(dto.unclaimed.a) },
  };
  if (dto.legs.b) p.legs.b = legFromDto(dto.legs.b);
  if (dto.unclaimed.b !== undefined) p.unclaimed.b = BigInt(dto.unclaimed.b);
  if (dto.band) p.band = dto.band;
  if (dto.inRange !== undefined) p.inRange = dto.inRange;
  if (dto.health !== undefined) p.health = dto.health;
  if (dto.openedAtUnix !== undefined) p.openedAtUnix = dto.openedAtUnix;
  if (dto.locked !== undefined) p.locked = dto.locked;
  if (dto.poolLiquidityUsd !== undefined) p.poolLiquidityUsd = dto.poolLiquidityUsd;
  if (dto.poolVolume24hUsd !== undefined) p.poolVolume24hUsd = dto.poolVolume24hUsd;
  return p;
}

export function serializeSnapshot(snap: Snapshot): string {
  const dto: SnapshotDto = {
    takenAtUnix: snap.takenAtUnix,
    wallet: snap.wallet,
    priceUsd: snap.priceUsd,
    priceSource: snap.priceSource,
    positions: snap.positions.map(positionToDto),
  };
  return JSON.stringify(dto);
}

export function deserializeSnapshot(line: string): Snapshot {
  const dto = JSON.parse(line) as SnapshotDto;
  return {
    takenAtUnix: dto.takenAtUnix,
    wallet: dto.wallet,
    priceUsd: dto.priceUsd,
    priceSource: dto.priceSource,
    positions: dto.positions.map(positionFromDto),
  };
}

export interface LedgerOpts {
  home?: string;
}

export function ledgerHome(opts: LedgerOpts = {}): string {
  return opts.home ?? process.env.LP_DESK_HOME ?? join(process.cwd(), ".lp-desk");
}

export function ledgerPath(wallet: string, opts: LedgerOpts = {}): string {
  const safe = wallet.replace(/[^A-Za-z0-9_-]/g, "_");
  return join(ledgerHome(opts), "snapshots", `${safe}.jsonl`);
}

export function appendSnapshot(snap: Snapshot, opts: LedgerOpts = {}): string {
  const path = ledgerPath(snap.wallet, opts);
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, serializeSnapshot(snap) + "\n", "utf8");
  } catch (err) {
    throw new EngineError("LEDGER_IO", `ledger: cannot write snapshot for ${snap.wallet}`, {
      cause: classifyError(err).message,
    });
  }
  return path;
}

export function readSnapshots(wallet: string, opts: LedgerOpts = {}): Snapshot[] {
  const path = ledgerPath(wallet, opts);
  if (!existsSync(path)) return [];
  let lines: string[];
  try {
    lines = readFileSync(path, "utf8").split("\n");
  } catch (err) {
    throw new EngineError("LEDGER_IO", `ledger: cannot read snapshots for ${wallet}`, {
      cause: classifyError(err).message,
    });
  }
  const out: Snapshot[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(deserializeSnapshot(trimmed));
    } catch {
      process.stderr.write(`ledger: skipping malformed snapshot line in ${path}\n`);
    }
  }
  out.sort((x, y) => x.takenAtUnix - y.takenAtUnix);
  return out;
}
