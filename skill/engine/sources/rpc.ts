// Minimal read-only JSON-RPC client. Uses parsed account methods so there is no
// manual account decoding. Injectable fetch for offline tests. Failures surface
// as typed EngineError with the endpoint origin only, never the full URL.

import { EngineError, safeEndpoint } from "../errors.ts";

export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export interface RpcOpts {
  fetchImpl?: typeof fetch;
}

interface JsonRpcResponse<T> {
  result?: T;
  error?: { code?: number; message?: string };
}

export class RpcClient {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private id = 0;

  constructor(endpoint: string, opts: RpcOpts = {}) {
    this.endpoint = endpoint;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const where = { endpoint: safeEndpoint(this.endpoint), method };
    let res: Response;
    try {
      res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: (this.id += 1), method, params }),
      });
    } catch (err) {
      throw new EngineError("RPC_FAILED", `rpc ${method}: ${(err as Error).message}`, where);
    }
    if (!res.ok) throw new EngineError("RPC_FAILED", `rpc ${method}: http ${res.status}`, where);
    const body = (await res.json()) as JsonRpcResponse<T>;
    if (body.error) throw new EngineError("RPC_FAILED", `rpc ${method}: ${body.error.message ?? "error"}`, where);
    if (body.result === undefined) throw new EngineError("RPC_FAILED", `rpc ${method}: empty result`, where);
    return body.result;
  }
}

export interface ParsedTokenAccount {
  mint: string;
  amount: string;
  decimals: number;
}

interface TokenAccountsResult {
  value?: Array<{
    account?: { data?: { parsed?: { info?: { mint?: string; tokenAmount?: { amount?: string; decimals?: number } } } } };
  }>;
}

export async function getParsedTokenAccounts(
  rpc: RpcClient,
  owner: string,
  programId: string = TOKEN_PROGRAM_ID,
): Promise<ParsedTokenAccount[]> {
  const result = await rpc.call<TokenAccountsResult>("getTokenAccountsByOwner", [
    owner,
    { programId },
    { encoding: "jsonParsed" },
  ]);
  const out: ParsedTokenAccount[] = [];
  for (const entry of result.value ?? []) {
    const info = entry.account?.data?.parsed?.info;
    const mint = info?.mint;
    const amount = info?.tokenAmount?.amount;
    const decimals = info?.tokenAmount?.decimals;
    if (typeof mint === "string" && typeof amount === "string" && typeof decimals === "number") {
      out.push({ mint, amount, decimals });
    }
  }
  return out;
}

// A position NFT holds exactly one indivisible unit. CLMM position ownership is
// represented this way on Orca, Raydium, and Meteora.
export function isPositionNft(account: ParsedTokenAccount): boolean {
  return account.decimals === 0 && account.amount === "1";
}

export async function getMintDecimals(rpc: RpcClient, mint: string): Promise<number> {
  const result = await rpc.call<{ value?: { data?: { parsed?: { info?: { decimals?: number } } } } }>(
    "getAccountInfo",
    [mint, { encoding: "jsonParsed" }],
  );
  const decimals = result.value?.data?.parsed?.info?.decimals;
  if (typeof decimals !== "number") {
    throw new EngineError("RPC_FAILED", `getMintDecimals: ${mint} returned no decimals`, { mint });
  }
  return decimals;
}
