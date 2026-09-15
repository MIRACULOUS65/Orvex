/**
 * Attestation service + adapter — Phase 14 (Tasks 14.5/14.6).
 *
 * Builds a minimal cryptographic commitment from verified state (trace merkle root,
 * policy hash, decision, transaction hash, timestamp, agent) and submits it through an
 * ABSTRACT attestation adapter. Core does NOT implement raw blockchain attestation; the
 * real registry submission belongs to Person 4's Blockchain subsystem.
 *
 * CRITICAL isolation (Task 14.6 / §50): attestation is INDEPENDENT of payment truth. If
 * a payment is already CONFIRMED + VERIFIED and attestation FAILS, the payment stays
 * VERIFIED and only the attestation is marked FAILED/PENDING for independent retry. The
 * two states never overwrite each other.
 */
import type { AttestationRecord, PrismaClient } from "@prisma/client";
import { sha256Json } from "../shared/hash.js";

export interface AttestationPayload {
  companyId: string;
  agentId: string;
  executionRequestId: string;
  decisionId: string;
  traceMerkleRoot: string;
  policyHash: string;
  decision: string;
  transactionHash?: string | null;
}

export type AdapterOutcome =
  | { status: "SUBMITTED" | "CONFIRMED"; registryTxHash: string }
  | { status: "FAILED"; error: string };

/** Abstract attestation/registry adapter (Person 4 implements the real one). */
export interface AttestationAdapter {
  submit(payload: AttestationPayload): Promise<AdapterOutcome>;
}

/** Deterministic mock adapter. Configurable to simulate submit success/failure. */
export class MockAttestationAdapter implements AttestationAdapter {
  constructor(private readonly config: { fail?: boolean } = {}) {}
  async submit(payload: AttestationPayload): Promise<AdapterOutcome> {
    if (this.config.fail) return { status: "FAILED", error: "registry unavailable" };
    return { status: "CONFIRMED", registryTxHash: sha256Json(payload) };
  }
}

export class AttestationService {
  constructor(
    private readonly db: PrismaClient,
    private readonly adapter: AttestationAdapter,
  ) {}

  /**
   * Create a PENDING attestation record then submit via the adapter. On adapter FAILURE
   * the record is marked FAILED — but this NEVER touches the payment/verification state.
   */
  async attest(payload: AttestationPayload): Promise<AttestationRecord> {
    const record = await this.db.attestationRecord.create({
      data: {
        companyId: payload.companyId,
        agentId: payload.agentId,
        executionRequestId: payload.executionRequestId,
        decisionId: payload.decisionId,
        traceMerkleRoot: payload.traceMerkleRoot,
        policyHash: payload.policyHash,
        decision: payload.decision,
        transactionHash: payload.transactionHash ?? null,
        status: "PENDING",
      },
    });

    const outcome = await this.adapter.submit(payload);
    if (outcome.status === "FAILED") {
      return this.db.attestationRecord.update({ where: { id: record.id }, data: { status: "FAILED" } });
    }
    return this.db.attestationRecord.update({
      where: { id: record.id },
      data: {
        status: outcome.status,
        registryTxHash: outcome.registryTxHash,
        confirmedAt: outcome.status === "CONFIRMED" ? new Date() : null,
      },
    });
  }

  /** Independently retry a FAILED/PENDING attestation (does not touch payment state). */
  async retry(companyId: string, attestationId: string, payload: AttestationPayload): Promise<AttestationRecord> {
    const record = await this.db.attestationRecord.findFirst({ where: { id: attestationId, companyId } });
    if (!record) throw new Error("attestation not found");
    if (record.status === "CONFIRMED") return record;
    const outcome = await this.adapter.submit(payload);
    if (outcome.status === "FAILED") {
      return this.db.attestationRecord.update({ where: { id: record.id }, data: { status: "FAILED" } });
    }
    return this.db.attestationRecord.update({
      where: { id: record.id },
      data: { status: outcome.status, registryTxHash: outcome.registryTxHash, confirmedAt: new Date() },
    });
  }

  async get(companyId: string, attestationId: string): Promise<AttestationRecord | null> {
    return this.db.attestationRecord.findFirst({ where: { id: attestationId, companyId } });
  }
}
