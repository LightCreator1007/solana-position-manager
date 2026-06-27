// Share-of-pool accounting for constant-product (full-range) LP positions. The
// holder owns lpTokens of lpSupply, which entitles them to that fraction of each
// reserve. Exact bigint math, no rounding beyond integer division.

export function ammAmountsFromShare(
  lpTokens: bigint,
  lpSupply: bigint,
  reserveA: bigint,
  reserveB: bigint,
): { amountA: bigint; amountB: bigint } {
  if (lpSupply <= 0n || lpTokens <= 0n) return { amountA: 0n, amountB: 0n };
  return {
    amountA: (reserveA * lpTokens) / lpSupply,
    amountB: (reserveB * lpTokens) / lpSupply,
  };
}
