/**
 * CoreError — Phase 1, Task 1.6.
 *
 * The single application error type. Carries a machine-readable code, HTTP status,
 * retryability, and structured (non-secret) details. Serializes to the canonical
 * error envelope from BACKEND_API.md §12. Never embeds secrets or stack traces in
 * the client-facing payload.
 */
import { redactValue } from "../logging/redaction.js";
import {
  type ErrorCode,
  type ErrorSeverity,
  ERROR_HTTP_STATUS,
  ERROR_RETRYABLE,
} from "./codes.js";

export interface CoreErrorOptions {
  message: string;
  severity?: ErrorSeverity;
  retryable?: boolean;
  httpStatus?: number;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
}

export class CoreError extends Error {
  readonly code: ErrorCode;
  readonly severity: ErrorSeverity;
  readonly retryable: boolean;
  readonly httpStatus: number;
  readonly details: Record<string, unknown>;

  constructor(code: ErrorCode, options: CoreErrorOptions) {
    super(options.message);
    this.name = "CoreError";
    this.code = code;
    this.severity = options.severity ?? "MEDIUM";
    this.retryable = options.retryable ?? ERROR_RETRYABLE[code] ?? false;
    this.httpStatus = options.httpStatus ?? ERROR_HTTP_STATUS[code] ?? 500;
    this.details = options.details ?? {};
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }

  /** Convenience factory. */
  static of(code: ErrorCode, message: string, options: Omit<CoreErrorOptions, "message"> = {}): CoreError {
    return new CoreError(code, { message, ...options });
  }

  /** Client-facing, redacted error payload (no stack trace, no secrets). */
  toPayload(): ErrorPayload {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: redactValue(this.details) as Record<string, unknown>,
    };
  }
}

/** Type guard. */
export function isCoreError(value: unknown): value is CoreError {
  return value instanceof CoreError;
}
