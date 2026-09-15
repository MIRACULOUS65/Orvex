/**
 * Blockchain/Execution error taxonomy.
 *
 * These map onto the failure boundary in BLOCKCHAIN_ARCHITECTURE.md §15. They are
 * deterministic and safe to surface to Core (no secrets, no keys, no raw payloads with
 * sensitive material). `UNKNOWN` is explicitly distinct from `FAILED`.
 */

export type ExecutionErrorCode =
  | "CONFIG_ERROR"
  | "CHAIN_MISMATCH"
  | "RPC_ERROR"
  | "BUILD_ERROR"
  | "VALIDATION_FAILED"
  | "SIMULATION_FAILED"
  | "STALE_SIMULATION"
  | "SUBMISSION_FAILED"
  | "VERIFICATION_FAILED"
  | "MAINNET_BLOCKED"
  | "SIGNER_UNAVAILABLE"
  | "UNSUPPORTED"
  | "UNKNOWN";

export interface ExecutionErrorOptions {
  code: ExecutionErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

/**
 * The single error type thrown across the execution boundary. `details` must never carry
 * signing material — see `redactSecrets` in shared/redaction.ts for the enforced rule.
 */
export class ExecutionError extends Error {
  readonly code: ExecutionErrorCode;
  readonly details: Record<string, unknown>;

  constructor(opts: ExecutionErrorOptions) {
    super(opts.message);
    this.name = "ExecutionError";
    this.code = opts.code;
    this.details = opts.details ?? {};
    if (opts.cause !== undefined) {
      (this as { cause?: unknown }).cause = opts.cause;
    }
  }

  static of(
    code: ExecutionErrorCode,
    message: string,
    details?: Record<string, unknown>,
    cause?: unknown,
  ): ExecutionError {
    return new ExecutionError({ code, message, details, cause });
  }

  toJSON(): { code: ExecutionErrorCode; message: string; details: Record<string, unknown> } {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export function isExecutionError(e: unknown): e is ExecutionError {
  return e instanceof ExecutionError;
}
