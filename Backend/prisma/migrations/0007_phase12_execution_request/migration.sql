-- Phase 12 — execution requests (§39).

-- CreateEnum
CREATE TYPE "ExecutionRequestStatus" AS ENUM ('CREATED', 'AUTHORIZED', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'UNKNOWN', 'CANCELLED');

-- CreateTable
CREATE TABLE "execution_requests" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "decision_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "policy_version_id" TEXT,
    "authorization_context_hash" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "executor_type" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "status" "ExecutionRequestStatus" NOT NULL DEFAULT 'CREATED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorized_at" TIMESTAMP(3),

    CONSTRAINT "execution_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "execution_requests_company_id_idx" ON "execution_requests"("company_id");

-- CreateIndex
CREATE INDEX "execution_requests_agent_id_idx" ON "execution_requests"("agent_id");

-- CreateIndex
CREATE INDEX "execution_requests_status_idx" ON "execution_requests"("status");

-- CreateIndex
CREATE INDEX "execution_requests_idempotency_key_idx" ON "execution_requests"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "execution_requests_company_id_idempotency_key_key" ON "execution_requests"("company_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "execution_requests" ADD CONSTRAINT "execution_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
