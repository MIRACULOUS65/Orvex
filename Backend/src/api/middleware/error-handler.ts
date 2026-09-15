/**
 * Global error handler + envelope helpers — Phase 1, Task 1.6.
 *
 * Maps every thrown error to the canonical error envelope (BACKEND_API.md §12).
 * CoreErrors map directly; Fastify validation errors map to SCHEMA_ERROR/INVALID_INPUT;
 * everything else becomes a generic INTERNAL_ERROR with no stack trace or secret
 * leakage (BACKEND_SECURITY.md §80).
 */
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { CoreError, isCoreError } from "../../shared/errors/index.js";

interface EnvelopeMeta {
  request_id: string;
  correlation_id: string;
}

export function successEnvelope<T>(data: T, req: FastifyRequest, extraMeta: Record<string, unknown> = {}) {
  return {
    data,
    meta: metaOf(req, extraMeta),
  };
}

export function errorEnvelope(error: CoreError, req: FastifyRequest) {
  // Canonical api.v1 envelope so success and error responses share one shape.
  return {
    schema_version: "api.v1" as const,
    request_id: req.context?.request_id ?? "req_unknown",
    data: null,
    error: error.toPayload(),
    meta: metaOf(req),
  };
}

function metaOf(req: FastifyRequest, extra: Record<string, unknown> = {}): EnvelopeMeta & Record<string, unknown> {
  const ctx = req.context;
  return {
    request_id: ctx?.request_id ?? "req_unknown",
    correlation_id: ctx?.correlation_id ?? "corr_unknown",
    ...extra,
  };
}

/** Normalize any thrown value into a CoreError. */
function toCoreError(err: unknown): CoreError {
  if (isCoreError(err)) return err;

  // Fastify schema/validation errors.
  const fe = err as FastifyError;
  if (fe && (fe.validation || fe.code === "FST_ERR_VALIDATION")) {
    return CoreError.of("SCHEMA_ERROR", "Request failed schema validation.", {
      severity: "LOW",
      httpStatus: 422,
      details: { issues: fe.validation ?? [] },
    });
  }
  if (fe && typeof fe.statusCode === "number" && fe.statusCode >= 400 && fe.statusCode < 500) {
    return CoreError.of("INVALID_INPUT", fe.message || "Invalid request.", {
      severity: "LOW",
      httpStatus: fe.statusCode,
    });
  }

  // Unknown/unexpected — never expose internals.
  return CoreError.of("INTERNAL_ERROR", "An internal error occurred.", {
    severity: "HIGH",
    httpStatus: 500,
  });
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: unknown, req: FastifyRequest, reply: FastifyReply) => {
    const coreError = toCoreError(err);

    // Log server-side with full (redacted) context; never send stack to client.
    const logger = req.log_ctx ?? undefined;
    const logData = {
      code: coreError.code,
      severity: coreError.severity,
      http_status: coreError.httpStatus,
    };
    if (coreError.code === "INTERNAL_ERROR") {
      logger?.error("unhandled_error", { ...logData, original: String((err as Error)?.name ?? "unknown") });
    } else {
      logger?.warn("handled_error", logData);
    }

    reply.code(coreError.httpStatus).send(errorEnvelope(coreError, req));
  });

  // 404 handler in envelope form.
  app.setNotFoundHandler((req: FastifyRequest, reply: FastifyReply) => {
    const err = CoreError.of("NOT_FOUND", "Resource not found.", { severity: "LOW" });
    reply.code(err.httpStatus).send(errorEnvelope(err, req));
  });
}
