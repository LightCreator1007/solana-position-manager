// One place that records, per venue, how a position is discovered, which program
// owns it, the SDK that decodes it, and what is not done yet. Program ids are
// facts to verify on an explorer, not trusted blindly. `planned` venues are on
// the roadmap and have no reader yet.

export type DiscoveryStatus = "direct_rpc" | "sdk_adapter" | "planned";
export type Family = "concentrated_liquidity" | "constant_product" | "vault";

export interface VenueInfo {
  id: string;
  label: string;
  family: Family;
  discoveryStatus: DiscoveryStatus;
  readOnly: true;
  programId?: string;
  programIdSource: string;
  sdkPackage: string;
  requiredFields: string[];
  limitations: string[];
}

export const VENUES: Record<string, VenueInfo> = {
  orca: {
    id: "orca",
    label: "Orca Whirlpools",
    family: "concentrated_liquidity",
    discoveryStatus: "direct_rpc",
    readOnly: true,
    programId: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
    programIdSource: "Orca Whirlpools docs; verify on an explorer",
    sdkPackage: "@orca-so/whirlpools",
    requiredFields: ["whirlpool", "tickLowerIndex", "tickUpperIndex", "liquidity", "tokenMintA", "tokenMintB"],
    limitations: ["pooled amounts are derived from liquidity at the current tick, so they are float estimates"],
  },
  raydium: {
    id: "raydium",
    label: "Raydium CLMM",
    family: "concentrated_liquidity",
    discoveryStatus: "sdk_adapter",
    readOnly: true,
    programId: "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
    programIdSource: "Raydium CLMM SDK v2; verify on an explorer",
    sdkPackage: "@raydium-io/raydium-sdk-v2",
    requiredFields: ["poolId", "tickLower", "tickUpper", "liquidity", "tokenMintA", "tokenMintB"],
    limitations: ["locked positions must be identified before any exit or rebalance"],
  },
  "meteora-dlmm": {
    id: "meteora-dlmm",
    label: "Meteora DLMM",
    family: "concentrated_liquidity",
    discoveryStatus: "sdk_adapter",
    readOnly: true,
    programId: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    programIdSource: "Meteora DLMM docs; verify on an explorer",
    sdkPackage: "@meteora-ag/dlmm",
    requiredFields: ["lbPair", "lowerBinId", "upperBinId", "activeId", "tokenXMint", "tokenYMint"],
    limitations: ["bin bounds are inclusive and use bin step, not ticks; convert before any cross-venue compare"],
  },
  kamino: {
    id: "kamino",
    label: "Kamino Liquidity",
    family: "vault",
    discoveryStatus: "sdk_adapter",
    readOnly: true,
    programIdSource: "discovered through the Kamino SDK; no single CLMM program to scan",
    sdkPackage: "@kamino-finance/kliquidity-sdk",
    requiredFields: ["strategy", "tokenAMint", "tokenBMint"],
    limitations: ["a vault may or may not expose a range band; treat the band as optional"],
  },
  "raydium-cpmm": {
    id: "raydium-cpmm",
    label: "Raydium CPMM",
    family: "constant_product",
    discoveryStatus: "planned",
    readOnly: true,
    programId: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
    programIdSource: "Raydium SDK v2 CPMM program; confirm before implementing",
    sdkPackage: "@raydium-io/raydium-sdk-v2",
    requiredFields: ["poolId", "lpMint", "tokenMintA", "tokenMintB"],
    limitations: ["full-range constant product, so range math does not apply; use share-of-pool accounting"],
  },
  "meteora-damm-v2": {
    id: "meteora-damm-v2",
    label: "Meteora DAMM v2",
    family: "constant_product",
    discoveryStatus: "planned",
    readOnly: true,
    programIdSource: "confirm the program id before implementing",
    sdkPackage: "@meteora-ag/cp-amm-sdk",
    requiredFields: ["pool", "tokenAMint", "tokenBMint"],
    limitations: ["reader not built yet; on the roadmap alongside Raydium CPMM"],
  },
};

export function listVenues(): VenueInfo[] {
  return Object.values(VENUES);
}

export function getVenue(id: string): VenueInfo | undefined {
  return VENUES[id];
}

export function supportedVenues(): VenueInfo[] {
  return listVenues().filter((v) => v.discoveryStatus !== "planned");
}

export function plannedVenues(): VenueInfo[] {
  return listVenues().filter((v) => v.discoveryStatus === "planned");
}
