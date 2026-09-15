-- Phase 5 — financial state, reservations, idempotency (§43-§45, §51-§52).

-- CreateEnum
CREATE TYPE "FinancialAccountScope" AS ENUM ('AGENT', 'COMPANY', 'CATEGORY', 'RECIPIENT');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('RESERVED', 'COMMITTED', 'RELEASED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "scope" "FinancialAccountScope" NOT NULL,
    "scope_key" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "network" TEXT,
    "current_reserved" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "current_committed" DECIMAL(38,18) NOT NULL DEFAULT 0,
    "limit_amount" DECIMAL(38,18),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_reservations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "execution_request_id" TEXT,
    "financial_account_id" TEXT NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "asset" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),
    "committed_at" TIMESTAMP(3),

    CONSTRAINT "financial_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "operation_type" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "request_hash" TEXT NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "response_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_accounts_company_id_idx" ON "financial_accounts"("company_id");

-- CreateIndex
CREATE INDEX "financial_accounts_agent_id_idx" ON "financial_accounts"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_accounts_company_id_scope_scope_key_asset_network_key" ON "financial_accounts"("company_id", "scope", "scope_key", "asset", "network");

-- CreateIndex
CREATE INDEX "financial_reservations_company_id_idx" ON "financial_reservations"("company_id");

-- CreateIndex
CREATE INDEX "financial_reservations_financial_account_id_idx" ON "financial_reservations"("financial_account_id");

-- CreateIndex
CREATE INDEX "financial_reservations_status_idx" ON "financial_reservations"("status");

-- CreateIndex
CREATE INDEX "financial_reservations_execution_request_id_idx" ON "financial_reservations"("execution_request_id");

-- CreateIndex
CREATE INDEX "idempotency_records_company_id_idx" ON "idempotency_records"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_company_id_operation_type_idempotency_k_key" ON "idempotency_records"("company_id", "operation_type", "idempotency_key");

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_reservations" ADD CONSTRAINT "financial_reservations_financial_account_id_fkey" FOREIGN KEY ("financial_account_id") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
