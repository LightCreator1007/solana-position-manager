// Token-program and Token-2022 trait detection. Without this, the `token-2022`
// escalation in health.ts can never fire on a fetched position: the readers only
// set mint, decimals, and raw amount. A transfer hook can block an exit and a
// transfer fee shaves what settles, so these traits are read from the mint
// account and stamped onto each leg before any sizing or exit decision.

import type { Position, TokenProgram } from "../model.ts";
import { EngineError } from "../errors.ts";
import { RpcClient, TOKEN_2022_PROGRAM_ID } from "./rpc.ts";

export interface MintTraits {
  tokenProgram: TokenProgram;
  transferFeeBps: number;
  hasTransferHook: boolean;
  // interest-bearing or scaled-ui-amount: the decoded raw amount is not the true
  // balance, so a USD figure from raw/decimals is wrong until the multiplier is applied.
  hasScaledAmount: boolean;
}

// The system program id is the "unset" value for an optional program pointer.
const DEFAULT_PROGRAM_ID = "11111111111111111111111111111111";

interface ParsedMintInfo {
  extensions?: Array<Record<string, unknown>>;
  // jsonParsed mint info carries other fields (decimals, authorities); only
  // extensions are read here, but allow the rest so callers can pass the raw shape.
  [key: string]: unknown;
}

interface ParsedMintValue {
  owner?: string;
  data?: { parsed?: { info?: ParsedMintInfo } };
}

// Pure parse of a jsonParsed mint account value into trait flags. The owning
// program is ground truth for the token standard; extensions carry the fee and
// the hook. Unknown shapes degrade to a plain SPL mint with no fee and no hook.
export function parseMintTraits(value: ParsedMintValue): MintTraits {
  const tokenProgram: TokenProgram = value?.owner === TOKEN_2022_PROGRAM_ID ? "token-2022" : "spl-token";
  const extensions = value?.data?.parsed?.info?.extensions ?? [];

  let transferFeeBps = 0;
  let hasTransferHook = false;
  let hasScaledAmount = false;
  for (const ext of extensions) {
    if (ext.extension === "transferFeeConfig") {
      const state = ext.state as { newerTransferFee?: { transferFeeBasisPoints?: number | string } } | undefined;
      const bps = state?.newerTransferFee?.transferFeeBasisPoints;
      const n = typeof bps === "string" ? Number(bps) : bps;
      if (typeof n === "number" && Number.isFinite(n) && n > 0) transferFeeBps = n;
    } else if (ext.extension === "transferHook") {
      const state = ext.state as { programId?: string | null } | undefined;
      const programId = state?.programId;
      if (typeof programId === "string" && programId.length > 0 && programId !== DEFAULT_PROGRAM_ID) {
        hasTransferHook = true;
      }
    } else if (ext.extension === "interestBearingConfig" || ext.extension === "scaledUiAmountConfig") {
      hasScaledAmount = true;
    }
  }
  return { tokenProgram, transferFeeBps, hasTransferHook, hasScaledAmount };
}

export async function getMintTraits(rpc: RpcClient, mint: string): Promise<MintTraits> {
  const result = await rpc.call<{ value?: ParsedMintValue | null }>("getAccountInfo", [
    mint,
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]);
  if (!result.value) {
    throw new EngineError("RPC_FAILED", `getMintTraits: ${mint} returned no account`, { mint });
  }
  return parseMintTraits(result.value);
}

// Stamp traits onto every matching leg. Always records the program (even plain
// SPL) so a clean report means "verified", not "never checked".
export function withTokenTraits(positions: Position[], traits: Record<string, MintTraits>): Position[] {
  for (const p of positions) {
    for (const leg of [p.legs.a, p.legs.b]) {
      if (!leg) continue;
      const t = traits[leg.mint];
      if (!t) continue;
      leg.tokenProgram = t.tokenProgram;
      if (t.transferFeeBps > 0) leg.transferFeeBps = t.transferFeeBps;
      if (t.hasTransferHook) leg.hasTransferHook = true;
      if (t.hasScaledAmount) leg.hasScaledAmount = true;
    }
  }
  return positions;
}

// Read each distinct leg mint once and annotate. A failed read throws rather
// than silently leaving a mint unverified: a report that quietly skipped
// Token-2022 detection is worse than one that names the blocker.
export async function annotateMints(
  positions: Position[],
  rpcUrl: string,
  fetchImpl?: typeof fetch,
): Promise<Position[]> {
  const rpc = new RpcClient(rpcUrl, { fetchImpl });
  const mints = new Set<string>();
  for (const p of positions) {
    mints.add(p.legs.a.mint);
    if (p.legs.b) mints.add(p.legs.b.mint);
  }
  const traits: Record<string, MintTraits> = {};
  for (const mint of mints) {
    traits[mint] = await getMintTraits(rpc, mint);
  }
  return withTokenTraits(positions, traits);
}
