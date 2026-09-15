/**
 * Evidence contract — Phase 2, Task 2.1.
 *
 * Mirrors CONTRACTS.md §11/§12 and Orvex/ML/schemas/evidence.py. Evidence carries
 * provenance (source, trust_level, derived_from) so the Epistemic Independence layer
 * can distinguish genuine independent corroboration from repetition. Consumer-side:
 * `.passthrough()` for forward-compat.
 */
import { z } from "zod";
import { idString, isoTimestamp } from "./primitives.js";
import { TrustLevel } from "./trajectory.js";

/** Evidence trust levels reuse the shared trajectory trust vocabulary. */
export const EvidenceTrustLevel = TrustLevel;
export type EvidenceTrustLevel = z.infer<typeof EvidenceTrustLevel>;

export const ContentType = z.enum([
  "TEXT",
  "JSON",
  "IMAGE",
  "DOCUMENT",
  "CHAIN_DATA",
  "STRUCTURED",
]);
export type ContentType = z.infer<typeof ContentType>;

export const EvidenceSource = z
  .object({
    source_id: idString,
    source_type: z.string(),
    trust_level: EvidenceTrustLevel,
  })
  .passthrough();
export type EvidenceSource = z.infer<typeof EvidenceSource>;

export const Evidence = z
  .object({
    schema_version: z.literal("evidence.v1").default("evidence.v1"),
    evidence_id: idString,
    source: EvidenceSource,
    content_type: ContentType.default("TEXT"),
    content_hash: z.string(),
    claim: z.string().nullish(),
    raw_reference: z.string().nullish(),
    timestamp: isoTimestamp,
    derived_from: z.array(z.string()).default([]),
    trajectory_event_ids: z.array(z.string()).default([]),
  })
  .passthrough();
export type Evidence = z.infer<typeof Evidence>;
