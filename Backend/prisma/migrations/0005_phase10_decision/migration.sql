-- Phase 10 — decisions (§35/§36).

-- CreateEnum
CREATE TYPE "DecisionResultEnum" AS ENUM ('ALLOW', 'REVIEW', 'DENY');

-- CreateTable
CREATE TABLE "decisions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "intent_id" TEXT NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "policy_id" TEXT,
    "policy_version_id" TEXT,
    "security_assessment_id" TEXT,
    "transaction_id" TEXT,
    "simulation_result_id" TEXT,
    "approval_request_id" TEXT,
    "result" "DecisionResultEnum" NOT NULL,
    "reasons_json" JSONB NOT NULL,
    "determinant" TEXT NOT NULL,
    "decision_context_hash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "decisions_company_id_idx" ON "decisions"("company_id");

-- CreateIndex
CREATE INDEX "decisions_agent_id_idx" ON "decisions"("agent_id");

-- CreateIndex
CREATE INDEX "decisions_proposal_id_idx" ON "decisions"("proposal_id");

-- CreateIndex
CREATE INDEX "decisions_result_idx" ON "decisions"("result");

-- CreateIndex
CREATE INDEX "decisions_created_at_idx" ON "decisions"("created_at");

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
