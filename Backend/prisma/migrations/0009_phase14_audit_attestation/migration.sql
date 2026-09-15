-- Phase 14 — audit + attestation (§48-§50).

-- CreateEnum
CREATE TYPE "AttestationStatus" AS ENUM ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "correlation_id" TEXT,
    "request_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "previous_event_hash" TEXT NOT NULL,
    "event_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attestation_records" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "execution_request_id" TEXT NOT NULL,
    "decision_id" TEXT NOT NULL,
    "trace_merkle_root" TEXT NOT NULL,
    "policy_hash" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "transaction_hash" TEXT,
    "status" "AttestationStatus" NOT NULL DEFAULT 'PENDING',
    "registry_tx_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "attestation_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_company_id_idx" ON "audit_events"("company_id");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_event_hash_key" ON "audit_events"("event_hash");

-- CreateIndex
CREATE INDEX "attestation_records_company_id_idx" ON "attestation_records"("company_id");

-- CreateIndex
CREATE INDEX "attestation_records_execution_request_id_idx" ON "attestation_records"("execution_request_id");

-- CreateIndex
CREATE INDEX "attestation_records_status_idx" ON "attestation_records"("status");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation_records" ADD CONSTRAINT "attestation_records_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation_records" ADD CONSTRAINT "attestation_records_execution_request_id_fkey" FOREIGN KEY ("execution_request_id") REFERENCES "execution_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
