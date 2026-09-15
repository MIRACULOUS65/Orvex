-- Phase 4 — Policy lifecycle tables (§13-§16).

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "PolicyVersionStatus" AS ENUM ('DRAFT', 'VALIDATING', 'SIMULATED', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'DISABLED');

-- CreateTable
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "current_version" INTEGER NOT NULL DEFAULT 0,
    "status" "PolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_versions" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PolicyVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "compiled_policy_json" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "source_type" TEXT,
    "source_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3),
    "deactivated_at" TIMESTAMP(3),
    "approved_by" TEXT,

    CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_rules" (
    "id" TEXT NOT NULL,
    "policy_version_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "rule_type" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "configuration_json" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "policies_company_id_idx" ON "policies"("company_id");

-- CreateIndex
CREATE INDEX "policies_agent_id_idx" ON "policies"("agent_id");

-- CreateIndex
CREATE INDEX "policies_status_idx" ON "policies"("status");

-- CreateIndex
CREATE INDEX "policy_versions_policy_id_idx" ON "policy_versions"("policy_id");

-- CreateIndex
CREATE INDEX "policy_versions_status_idx" ON "policy_versions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "policy_versions_policy_id_version_key" ON "policy_versions"("policy_id", "version");

-- CreateIndex
CREATE INDEX "policy_rules_policy_version_id_idx" ON "policy_rules"("policy_version_id");

-- CreateIndex
CREATE INDEX "policy_rules_rule_type_idx" ON "policy_rules"("rule_type");

-- CreateIndex
CREATE UNIQUE INDEX "policy_rules_policy_version_id_rule_id_key" ON "policy_rules"("policy_version_id", "rule_id");

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
