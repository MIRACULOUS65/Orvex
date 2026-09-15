/**
 * Audit + Attestation contracts — Phase 2, Task 2.1.
 *
 * Mirrors CONTRACTS.md §39/§40:
 *   - AuditEvent        (§39) tamper-evident record of important state transitions
 *   - AttestationRecord (§40) minimal cryptographic commitment for on-chain registry
 *
 * Both are Core-owned, `.strict()`. Per §40, the attestation carries only hashes/roots,
 * NEVER private business data, credentials, full prompts, or raw evidence content.
 */
import { z } from "zod";
import { idString, isoTimestamp } from "./primitives.js";

export const AuditEvent = z
  .object({
    schema_version: z.literal("audit_event.v1").default("audit_event.v1"),
    audit_id: idString,
    event_type: z.string(),
    entity_type: z.string(),
    entity_id: idString,
    actor_type: z.string(),
    actor_id: idString,
    timestamp: isoTimestamp,
    result: z.string().nullish(),
    references: z.record(z.string(), z.unknown()).default({}),
    // Tamper-evident hash chain (mirrors trajectory chaining).
    previous_event_hash: z.string(),
    event_hash: z.string(),
  })
  .strict();
export type AuditEvent = z.infer<typeof AuditEvent>;

export const AttestationRecord = z
  .object({
    schema_version: z.literal("attestation.v1").default("attestation.v1"),
    attestation_id: idString,
    agent_id: idString,
    transaction_id: idString,
    trace_merkle_root: z.string(),
    policy_hash: z.string(),
    decision: z.enum(["ALLOW", "REVIEW", "DENY"]),
    transaction_hash: z.string().nullish(),
    timestamp: isoTimestamp,
    registry_tx_hash: z.string().nullish(),
  })
  .strict();
export type AttestationRecord = z.infer<typeof AttestationRecord>;
