// Typed errors for engine IO boundaries. A caller gets a stable code, a one-line
// remediation, and details with secrets removed. Use this instead of throwing bare
// Error so the agent can report a blocker rather than guess or invent data.

export type EngineErrorCode =
  | "DEPENDENCY_MISSING"
  | "RPC_FAILED"
  | "INVALID_INPUT"
  | "NOT_IMPLEMENTED"
  | "LEDGER_IO"
  | "PRICE_UNAVAILABLE"
  | "UNKNOWN";

const REMEDIATION: Record<EngineErrorCode, string> = {
  DEPENDENCY_MISSING: "Install the optional venue SDK in engine/ before using the live path.",
  RPC_FAILED: "Check the RPC URL, network access, and rate limits, then retry the read-only call.",
  INVALID_INPUT: "Fix the offending field named in the message, then retry.",
  NOT_IMPLEMENTED: "Pass a fetcher to read(), or wire the live path in leaves/data-sources.md.",
  LEDGER_IO: "Check the ledger path and write permissions under LP_DESK_HOME.",
  PRICE_UNAVAILABLE: "Provide a price source or a Birdeye key. Unresolved mints are left stale at zero.",
  UNKNOWN: "Report the code and message. Do not retry blindly or fill the gap with invented data.",
};

// Redact by key name as defense in depth. The values we attach are public
// (mints, methods, hosts), but a caller might pass a secret-named field.
const SECRET_KEY = /\b(secret|seed|mnemonic|private[_-]?key|keypair|api[_-]?key|authorization|password)\b/i;

export function redactSecrets(
  details?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    out[key] = SECRET_KEY.test(key) ? "[redacted]" : value;
  }
  return out;
}

// RPC providers embed keys in the URL (a Helius endpoint carries the key in the
// query string). Keep only the origin so the key never reaches a log or report.
export function safeEndpoint(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "[unparseable-url]";
  }
}

export interface EngineErrorJson {
  ok: false;
  code: EngineErrorCode;
  message: string;
  remediation: string;
  details?: Record<string, unknown>;
}

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly remediation: string;
  readonly details?: Record<string, unknown>;

  constructor(code: EngineErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "EngineError";
    this.code = code;
    this.remediation = REMEDIATION[code];
    this.details = redactSecrets(details);
  }

  toJSON(): EngineErrorJson {
    return {
      ok: false,
      code: this.code,
      message: this.message,
      remediation: this.remediation,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export function classifyError(err: unknown): EngineError {
  if (err instanceof EngineError) return err;
  const message = err instanceof Error ? err.message : String(err);
  if (/Cannot find package|Cannot find module|ERR_MODULE_NOT_FOUND/i.test(message)) {
    return new EngineError("DEPENDENCY_MISSING", message);
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|abort|HTTP \d{3}/i.test(message)) {
    return new EngineError("RPC_FAILED", message);
  }
  if (/ENOENT|EACCES|EPERM|EISDIR|EROFS/i.test(message)) {
    return new EngineError("LEDGER_IO", message);
  }
  return new EngineError("UNKNOWN", message);
}

export function errorEnvelope(err: unknown): EngineErrorJson {
  return classifyError(err).toJSON();
}
