/**
 * Audit + attestation module barrel — Phase 14.
 *
 * Append-only hash-chained audit, forensic lifecycle reconstruction, and attestation via
 * an abstract adapter (attestation failure is isolated from payment truth).
 */
export { AuditService } from "./audit.service.js";
export type { AppendAuditInput } from "./audit.service.js";
export { AttestationService, MockAttestationAdapter } from "./attestation.service.js";
export type { AttestationAdapter, AttestationPayload, AdapterOutcome } from "./attestation.service.js";
export { ForensicReconstructionService } from "./forensic.service.js";
export type { ForensicRecord } from "./forensic.service.js";
