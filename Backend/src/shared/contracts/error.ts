/**
 * Error contract — Phase 2, Task 2.1.
 *
 * The structured cross-service error shape (CONTRACTS.md §44). It REUSES the Phase 1
 * error vocabulary (`ERROR_CODES` from src/shared/errors/codes.ts) rather than
 * defining a second, incompatible enum (Phase 2 requirement 14). This keeps the wire
 * contract and the internal `CoreError` taxonomy in lockstep.
 */
import { z } from "zod";
import { ERROR_CODES } from "../errors/codes.js";

/**
 * Zod enum derived from the canonical Phase 1 ERROR_CODES tuple. `ERROR_CODES` is a
 * readonly string tuple, so `z.enum` accepts it directly and the resulting values
 * match the `ErrorCode` type exactly.
 */
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCodeSchema = z.infer<typeof ErrorCodeSchema>;

export const ErrorSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type ErrorSeveritySchema = z.infer<typeof ErrorSeveritySchema>;

export const ErrorContract = z
  .object({
    schema_version: z.literal("error.v1").default("error.v1"),
    code: ErrorCodeSchema,
    message: z.string(),
    severity: ErrorSeveritySchema.default("MEDIUM"),
    retryable: z.boolean().default(false),
    details: z.record(z.string(), z.unknown()).default({}),
    correlation_id: z.string().nullish(),
  })
  .passthrough();
export type ErrorContract = z.infer<typeof ErrorContract>;
