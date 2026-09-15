/**
 * Phase 6 — Redis Streams ingestion tests (Tasks 6.3/6.4).
 *
 * Uses the REAL Upstash Redis (via REDIS_URL) + real Postgres. Verifies durable
 * persistence, duplicate-delivery idempotency, and worker-restart recovery of un-acked
 * (pending) messages. Each run uses a unique stream name so parallel/repeat runs do not
 * collide, and tears the stream down afterward.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import IORedis from "ioredis";
import { randomUUID } from "node:crypto";
import { createTestDb, stopCluster, type TestDb } from "../db/harness";
import {
  TrajectoryService,
  TrajectoryIngestionWorker,
  type StreamedEvent,
} from "@/trajectory/index";
import { CompanyService, AgentService } from "@/domain/index";

const REDIS_URL = process.env.REDIS_URL;

let db: TestDb;
let redis: InstanceType<typeof IORedis>;
let trajectory: TrajectoryService;
let companies: CompanyService;
let agents: AgentService;
let stream: string;
let group: string;
let companyId: string;
let agentId: string;
let traceId: string;

// The whole suite requires Redis; skip cleanly if it isn't configured.
const describeOrSkip = REDIS_URL ? describe : describe.skip;

beforeAll(async () => {
  db = await createTestDb();
  trajectory = new TrajectoryService(db.prisma);
  companies = new CompanyService(db.prisma);
  agents = new AgentService(db.prisma);
  const company = await companies.createCompany({ name: "Ingest Co" });
  companyId = company.id;
  agentId = (await agents.createAgent({ companyId, name: "ingest-agent" })).id;
  traceId = (await trajectory.createTrace({ companyId, agentId })).id;

  if (REDIS_URL) {
    redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });
    stream = `test.trajectory.${randomUUID()}`;
    group = "sentinel-core-test";
  }
}, 120_000);

afterAll(async () => {
  if (redis && stream) {
    try {
      await redis.del(stream);
    } catch {
      /* ignore */
    }
    redis.disconnect();
  }
  await db?.disconnect();
  await stopCluster();
});

function streamed(sequence: number): StreamedEvent {
  return {
    companyId,
    traceId,
    agentId,
    sequence,
    eventType: "TOOL_CALL",
    timestamp: new Date(Date.UTC(2026, 8, 11, 12, 0, sequence)).toISOString(),
    payload: { name: `ingested_${sequence}` },
  };
}

describeOrSkip("Phase 6 — Redis Streams ingestion", () => {
  it("consumes streamed events and persists them durably to Postgres", async () => {
    const worker = new TrajectoryIngestionWorker(redis, trajectory, "worker-1", stream, group);
    await worker.ensureGroup();

    await worker.publish(streamed(1));
    await worker.publish(streamed(2));

    const result = await worker.processBatch(10, 500);
    expect(result.processed).toBe(2);

    const events = await trajectory.getEvents(companyId, traceId);
    expect(events.map((e) => e.sequence)).toEqual([1, 2]);
  });

  it("is idempotent on duplicate delivery (same event republished)", async () => {
    const dupStream = `${stream}.dup`;
    const worker = new TrajectoryIngestionWorker(redis, trajectory, "worker-dup", dupStream, group);
    await worker.ensureGroup();

    // A fresh trace for isolation.
    const t = await trajectory.createTrace({ companyId, agentId });
    const ev: StreamedEvent = { ...streamed(1), traceId: t.id };

    await worker.publish(ev);
    await worker.processBatch(10, 500);
    // Republish the SAME logical event (same content -> same event hash).
    await worker.publish(ev);
    await worker.processBatch(10, 500);

    const events = await trajectory.getEvents(companyId, t.id);
    // Exactly one durable row despite two deliveries.
    expect(events.filter((e) => e.sequence === 1)).toHaveLength(1);

    await redis.del(dupStream);
  });

  it("recovers pending (un-acked) messages after a worker restart", async () => {
    const recStream = `${stream}.recover`;
    const recGroup = "sentinel-core-recover";
    const t = await trajectory.createTrace({ companyId, agentId });

    // Producer publishes; a "crashed" worker reads (delivered) but never acks.
    const producer = new TrajectoryIngestionWorker(redis, trajectory, "crashed", recStream, recGroup);
    await producer.ensureGroup();
    await producer.publish({ ...streamed(1), traceId: t.id });

    // Read into the crashed consumer's PEL without processing (simulate crash between
    // delivery and durable write).
    await redis.xreadgroup("GROUP", recGroup, "crashed", "COUNT", 10, "STREAMS", recStream, ">");

    // A restarted worker with the SAME consumer name recovers its pending entries.
    const restarted = new TrajectoryIngestionWorker(redis, trajectory, "crashed", recStream, recGroup);
    const result = await restarted.recoverPending(10);
    expect(result.processed).toBe(1);

    const events = await trajectory.getEvents(companyId, t.id);
    expect(events.map((e) => e.sequence)).toEqual([1]);

    await redis.del(recStream);
  }, 30_000);
});
