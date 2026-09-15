/**
 * api.v1 response envelope + pagination helpers — Backend/Core product surface.
 *
 * Every /v1 endpoint returns the canonical shape:
 *   { schema_version: "api.v1", request_id, data, error, meta }
 * so the Dashboard and SDK can consume responses uniformly. Errors are structured
 * codes (never raw stack traces). This builds on the Phase 1 correlation context.
 */
import type { FastifyRequest } from "fastify";
import type { CoreError } from "../../shared/errors/index.js";

export const API_SCHEMA_VERSION = "api.v1";

export interface ApiMeta {
  [key: string]: unknown;
}

export interface ApiEnvelope<T> {
  schema_version: typeof API_SCHEMA_VERSION;
  request_id: string;
  data: T | null;
  error: ReturnType<CoreError["toPayload"]> | null;
  meta: ApiMeta;
}

function baseMeta(req: FastifyRequest, extra: ApiMeta = {}): ApiMeta {
  const ctx = req.context;
  return {
    correlation_id: ctx?.correlation_id ?? "corr_unknown",
    ...extra,
  };
}

/** Build a success envelope. */
export function ok<T>(req: FastifyRequest, data: T, meta: ApiMeta = {}): ApiEnvelope<T> {
  return {
    schema_version: API_SCHEMA_VERSION,
    request_id: req.context?.request_id ?? "req_unknown",
    data,
    error: null,
    meta: baseMeta(req, meta),
  };
}

/** Build an error envelope from a CoreError. */
export function fail(req: FastifyRequest, error: CoreError): ApiEnvelope<never> {
  return {
    schema_version: API_SCHEMA_VERSION,
    request_id: req.context?.request_id ?? "req_unknown",
    data: null,
    error: error.toPayload(),
    meta: baseMeta(req),
  };
}

// --------------------------------------------------------------------------- //
// Pagination
// --------------------------------------------------------------------------- //

export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/** Parse `page` / `page_size` query params into a bounded pagination window. */
export function parsePagination(query: Record<string, unknown>): Pagination {
  const rawPage = Number(query.page ?? 1);
  const rawSize = Number(query.page_size ?? DEFAULT_PAGE_SIZE);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const pageSize =
    Number.isFinite(rawSize) && rawSize >= 1 ? Math.min(Math.floor(rawSize), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Pagination meta for a list response. */
export function pageMeta(pagination: Pagination, total: number): ApiMeta {
  return {
    page: pagination.page,
    page_size: pagination.pageSize,
    total,
    total_pages: Math.max(1, Math.ceil(total / pagination.pageSize)),
  };
}
