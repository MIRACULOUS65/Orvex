-- Phase 11 — human approval (§37/§38).

-- CreateEnum
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalResultEnum" AS ENUM ('APPROVED', 'DENIED', 'EXPIRED');

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "decision_id" TEXT NOT NULL,
    "transaction_id" TEXT,
    "policy_version_id" TEXT,
    "required_role" TEXT NOT NULL,
    "summary_json" JSONB NOT NULL,
    "context_hash" TEXT NOT NULL,
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_results" (
    "id" TEXT NOT NULL,
    "approval_request_id" TEXT NOT NULL,
    "decision_id" TEXT NOT NULL,
    "approver_id" TEXT NOT NULL,
    "approver_role" TEXT NOT NULL,
    "result" "ApprovalResultEnum" NOT NULL,
    "context_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_requests_company_id_idx" ON "approval_requests"("company_id");

-- CreateIndex
CREATE INDEX "approval_requests_decision_id_idx" ON "approval_requests"("decision_id");

-- CreateIndex
CREATE INDEX "approval_requests_status_idx" ON "approval_requests"("status");

-- CreateIndex
CREATE INDEX "approval_requests_expires_at_idx" ON "approval_requests"("expires_at");

-- CreateIndex
CREATE INDEX "approval_results_approval_request_id_idx" ON "approval_results"("approval_request_id");

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_results" ADD CONSTRAINT "approval_results_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
