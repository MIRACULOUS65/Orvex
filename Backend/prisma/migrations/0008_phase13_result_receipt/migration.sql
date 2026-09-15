-- Phase 13 — execution results + receipt verification (§40-§42).

-- CreateEnum
CREATE TYPE "ExecutionResultStatus" AS ENUM ('SUBMITTED', 'CONFIRMED', 'FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReceiptVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'MISMATCH', 'FAILED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "execution_results" (
    "id" TEXT NOT NULL,
    "execution_request_id" TEXT NOT NULL,
    "transaction_hash" TEXT,
    "status" "ExecutionResultStatus" NOT NULL,
    "chain" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "raw_reference" TEXT,
    "provider_metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_verifications" (
    "id" TEXT NOT NULL,
    "execution_request_id" TEXT NOT NULL,
    "status" "ReceiptVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "transaction_hash" TEXT,
    "expected_json" JSONB NOT NULL,
    "actual_json" JSONB NOT NULL,
    "discrepancies_json" JSONB NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "execution_results_execution_request_id_idx" ON "execution_results"("execution_request_id");

-- CreateIndex
CREATE INDEX "execution_results_status_idx" ON "execution_results"("status");

-- CreateIndex
CREATE INDEX "receipt_verifications_execution_request_id_idx" ON "receipt_verifications"("execution_request_id");

-- CreateIndex
CREATE INDEX "receipt_verifications_status_idx" ON "receipt_verifications"("status");

-- AddForeignKey
ALTER TABLE "execution_results" ADD CONSTRAINT "execution_results_execution_request_id_fkey" FOREIGN KEY ("execution_request_id") REFERENCES "execution_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_verifications" ADD CONSTRAINT "receipt_verifications_execution_request_id_fkey" FOREIGN KEY ("execution_request_id") REFERENCES "execution_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
