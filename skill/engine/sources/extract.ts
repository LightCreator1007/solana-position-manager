// Defensive field readers for SDK objects whose key names vary across versions.

export function strOf(obj: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) return v;
    if (v != null && typeof (v as { toString?: () => string }).toString === "function") {
      const s = String(v);
      if (s && s !== "[object Object]") return s;
    }
  }
  return fallback;
}

export function numOf(obj: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "bigint") return Number(v);
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return fallback;
}

export function bigOf(obj: Record<string, unknown>, keys: string[], fallback = 0n): bigint {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "bigint") return v;
    if (typeof v === "number" && Number.isInteger(v)) return BigInt(v);
    if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return BigInt(v.trim());
  }
  return fallback;
}
