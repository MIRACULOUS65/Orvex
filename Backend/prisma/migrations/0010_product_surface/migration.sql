-- Product surface — intent / action_proposal / security_assessment persistence (§17-§19, §25).

-- CreateEnum
CREATE TYPE "IntentRecordStatus" AS ENUM ('VALID', 'NEEDS_CLARIFICATION', 'EXPIRED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ProposalRecordStatus" AS ENUM ('RECEIVED', 'VALIDATING', 'EVALUATING', 'APPROVED_CANDIDATE', 'REVIEW_REQUIRED', 'DENIED', 'COMPLETED');

-- CreateTable
CREATE TABLE "intents" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL DEFAULT 'intent.v1',
    "user_goal" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "desired_outcome" TEXT NOT NULL DEFAULT '',
    "intent_json" JSONB NOT NULL,
    "autonomy_level" TEXT NOT NULL DEFAULT 'MANUAL',
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "status" "IntentRecordStatus" NOT NULL DEFAULT 'VALID',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_proposals" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "intent_id" TEXT NOT NULL,
    "trace_id" TEXT,
    "schema_version" TEXT NOT NULL DEFAULT 'action_proposal.v1',
    "action_type" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "proposal_json" JSONB NOT NULL,
    "payment_method" TEXT,
    "network" TEXT,
    "evidence_refs_json" JSONB,
    "trajectory_refs_json" JSONB,
    "status" "ProposalRecordStatus" NOT NULL DEFAULT 'RECEIVED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_assessments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "proposal_id" TEXT NOT NULL,
    "trace_id" TEXT,
    "schema_version" TEXT NOT NULL DEFAULT 'security_assessment.v1',
    "assessment_json" JSONB NOT NULL,
    "overall_status" TEXT NOT NULL,
    "recommended_handling" TEXT NOT NULL,
    "assessment_hash" TEXT NOT NULL,
    "model_metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intents_company_id_idx" ON "intents"("company_id");
CREATE INDEX "intents_agent_id_idx" ON "intents"("agent_id");
CREATE INDEX "intents_status_idx" ON "intents"("status");
CREATE INDEX "action_proposals_company_id_idx" ON "action_proposals"("company_id");
CREATE INDEX "action_proposals_agent_id_idx" ON "action_proposals"("agent_id");
CREATE INDEX "action_proposals_intent_id_idx" ON "action_proposals"("intent_id");
CREATE INDEX "action_proposals_trace_id_idx" ON "action_proposals"("trace_id");
CREATE INDEX "action_proposals_status_idx" ON "action_proposals"("status");
CREATE INDEX "security_assessments_company_id_idx" ON "security_assessments"("company_id");
CREATE INDEX "security_assessments_proposal_id_idx" ON "security_assessments"("proposal_id");

-- AddForeignKey
ALTER TABLE "intents" ADD CONSTRAINT "intents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "action_proposals" ADD CONSTRAINT "action_proposals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "security_assessments" ADD CONSTRAINT "security_assessments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
