-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('CREATED', 'CONFIGURED', 'ACTIVE', 'PAUSED', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ExecutionMode" AS ENUM ('SIMULATE', 'REVIEW_ONLY', 'TESTNET', 'AUTONOMOUS');

-- CreateEnum
CREATE TYPE "ConstitutionStatus" AS ENUM ('DRAFT', 'VALIDATING', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CapabilityStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "status" "AgentStatus" NOT NULL DEFAULT 'CREATED',
    "execution_mode" "ExecutionMode" NOT NULL DEFAULT 'SIMULATE',
    "active_constitution_id" TEXT,
    "active_policy_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "constitutions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ConstitutionStatus" NOT NULL DEFAULT 'DRAFT',
    "purpose" TEXT NOT NULL DEFAULT '',
    "configuration_json" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3),
    "deactivated_at" TIMESTAMP(3),

    CONSTRAINT "constitutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capabilities" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "parent_capability_id" TEXT,
    "action" TEXT NOT NULL,
    "asset" TEXT,
    "network" TEXT,
    "category_scope_json" JSONB,
    "recipient_scope_json" JSONB,
    "single_transaction_limit" DECIMAL(38,18),
    "daily_limit" DECIMAL(38,18),
    "weekly_limit" DECIMAL(38,18),
    "monthly_limit" DECIMAL(38,18),
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "status" "CapabilityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "companies_status_idx" ON "companies"("status");

-- CreateIndex
CREATE INDEX "agents_company_id_idx" ON "agents"("company_id");

-- CreateIndex
CREATE INDEX "agents_status_idx" ON "agents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "agents_company_id_name_key" ON "agents"("company_id", "name");

-- CreateIndex
CREATE INDEX "constitutions_company_id_idx" ON "constitutions"("company_id");

-- CreateIndex
CREATE INDEX "constitutions_agent_id_idx" ON "constitutions"("agent_id");

-- CreateIndex
CREATE INDEX "constitutions_status_idx" ON "constitutions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "constitutions_agent_id_version_key" ON "constitutions"("agent_id", "version");

-- CreateIndex
CREATE INDEX "capabilities_company_id_idx" ON "capabilities"("company_id");

-- CreateIndex
CREATE INDEX "capabilities_agent_id_idx" ON "capabilities"("agent_id");

-- CreateIndex
CREATE INDEX "capabilities_status_idx" ON "capabilities"("status");

-- CreateIndex
CREATE INDEX "capabilities_parent_capability_id_idx" ON "capabilities"("parent_capability_id");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_active_constitution_id_fkey" FOREIGN KEY ("active_constitution_id") REFERENCES "constitutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "constitutions" ADD CONSTRAINT "constitutions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "constitutions" ADD CONSTRAINT "constitutions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capabilities" ADD CONSTRAINT "capabilities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capabilities" ADD CONSTRAINT "capabilities_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capabilities" ADD CONSTRAINT "capabilities_parent_capability_id_fkey" FOREIGN KEY ("parent_capability_id") REFERENCES "capabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

