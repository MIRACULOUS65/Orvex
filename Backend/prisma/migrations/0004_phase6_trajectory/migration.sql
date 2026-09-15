-- Phase 6 — trajectory / provenance (§21-§24).

-- CreateEnum
CREATE TYPE "TrajectoryTraceStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABORTED', 'CORRUPTED');

-- CreateTable
CREATE TABLE "trajectory_traces" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "intent_id" TEXT,
    "trace_hash" TEXT,
    "status" "TrajectoryTraceStatus" NOT NULL DEFAULT 'ACTIVE',
    "sequence_head" INTEGER NOT NULL DEFAULT 0,
    "head_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "trajectory_traces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trajectory_events" (
    "id" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "payload_json" JSONB NOT NULL,
    "source_ref" TEXT,
    "trust_context_json" JSONB,
    "provenance_refs_json" JSONB,
    "previous_event_hash" TEXT NOT NULL,
    "event_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trajectory_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trajectory_traces_company_id_idx" ON "trajectory_traces"("company_id");

-- CreateIndex
CREATE INDEX "trajectory_traces_agent_id_idx" ON "trajectory_traces"("agent_id");

-- CreateIndex
CREATE INDEX "trajectory_traces_status_idx" ON "trajectory_traces"("status");

-- CreateIndex
CREATE INDEX "trajectory_events_trace_id_idx" ON "trajectory_events"("trace_id");

-- CreateIndex
CREATE INDEX "trajectory_events_company_id_idx" ON "trajectory_events"("company_id");

-- CreateIndex
CREATE INDEX "trajectory_events_created_at_idx" ON "trajectory_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "trajectory_events_trace_id_sequence_key" ON "trajectory_events"("trace_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "trajectory_events_event_hash_key" ON "trajectory_events"("event_hash");

-- AddForeignKey
ALTER TABLE "trajectory_traces" ADD CONSTRAINT "trajectory_traces_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trajectory_events" ADD CONSTRAINT "trajectory_events_trace_id_fkey" FOREIGN KEY ("trace_id") REFERENCES "trajectory_traces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trajectory_events" ADD CONSTRAINT "trajectory_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
