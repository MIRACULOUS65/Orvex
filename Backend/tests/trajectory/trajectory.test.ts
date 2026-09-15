/**
 * Phase 6 — trajectory service tests (Tasks 6.1/6.2/6.4/6.5).
 *
 * DB-backed against real Postgres. Covers: valid ordered events, duplicate sequence,
 * invalid/gap sequence, wrong trace/agent, wrong previous hash, tampered payload,
 * tenant isolation, hash-chain integrity, and append-only behavior.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, stopCluster, type TestDb } from "../db/harness";
import { TrajectoryService, type AppendEventInput } from "@/trajectory/index";
import { CompanyService, AgentService } from "@/domain/index";
import { isCoreError } from "@/shared/errors/index";

let db: TestDb;
let trajectory: TrajectoryService;
let companies: CompanyService;
let agents: AgentService;

beforeAll(async () => {
  db = await createTestDb();
  trajectory = new TrajectoryService(db.prisma);
  companies = new CompanyService(db.prisma);
  agents = new AgentService(db.prisma);
}, 120_000);

afterAll(async () => {
  await db?.disconnect();
  await stopCluster();
});

async function seedTrace(companyName: string) {
  const company = await companies.createCompany({ name: companyName });
  const agent = await agents.createAgent({ companyId: company.id, name: "tracer" });
  const trace = await trajectory.createTrace({ companyId: company.id, agentId: agent.id });
  return { company, agent, trace };
}

function evt(
  companyId: string,
  traceId: string,
  agentId: string,
  sequence: number,
  overrides: Partial<AppendEventInput> = {},
): AppendEventInput {
  return {
    companyId,
    traceId,
    agentId,
    sequence,
    eventType: "TOOL_CALL",
    timestamp: new Date(Date.UTC(2026, 8, 11, 12, 0, sequence)).toISOString(),
    payload: { name: `event_${sequence}` },
    ...overrides,
  };
}

describe("Phase 6 — valid ordered events + hash chain", () => {
  it("appends a contiguous chain and verifies integrity", async () => {
    const { company, agent, trace } = await seedTrace("Traj A");
    const e1 = await trajectory.appendEvent(evt(company.id, trace.id, agent.id, 1));
    const e2 = await trajectory.appendEvent(evt(company.id, trace.id, agent.id, 2));
    const e3 = await trajectory.appendEvent(evt(company.id, trace.id, agent.id, 3));

    expect(e2.previousEventHash).toBe(e1.eventHash);
    expect(e3.previousEventHash).toBe(e2.eventHash);

    const events = await trajectory.getEvents(company.id, trace.id);
    expect(events.map((e) => e.sequence)).toEqual([1, 2, 3]);
    expect(await trajectory.verifyChain(company.id, trace.id)).toBe(true);
  });
});

describe("Phase 6 — ordering + integrity rejections", () => {
  it("rejects a duplicate sequence", async () => {
    const { company, agent, trace } = await seedTrace("Traj Dup");
    await trajectory.appendEvent(evt(company.id, trace.id, agent.id, 1));
    await expect(trajectory.appendEvent(evt(company.id, trace.id, agent.id, 1))).rejects.toSatisfy(
      isCoreError,
    );
  });

  it("rejects an out-of-order / gap sequence", async () => {
    const { company, agent, trace } = await seedTrace("Traj Gap");
    await trajectory.appendEvent(evt(company.id, trace.id, agent.id, 1));
    await expect(trajectory.appendEvent(evt(company.id, trace.id, agent.id, 3))).rejects.toSatisfy(
      isCoreError,
    );
  });

  it("rejects an event whose agent does not match the trace (wrong trace binding)", async () => {
    const { company, trace } = await seedTrace("Traj WrongAgent");
    await expect(
      trajectory.appendEvent(evt(company.id, trace.id, "some-other-agent", 1)),
    ).rejects.toSatisfy(isCoreError);
  });

  it("rejects a wrong previous_event_hash", async () => {
    const { company, agent, trace } = await seedTrace("Traj WrongPrev");
    await trajectory.appendEvent(evt(company.id, trace.id, agent.id, 1));
    await expect(
      trajectory.appendEvent(
        evt(company.id, trace.id, agent.id, 2, { previousEventHash: "sha256:wrong" }),
      ),
    ).rejects.toSatisfy(isCoreError);
  });

  it("rejects a supplied event_hash that does not match content (tamper at ingest)", async () => {
    const { company, agent, trace } = await seedTrace("Traj Tamper");
    await expect(
      trajectory.appendEvent(evt(company.id, trace.id, agent.id, 1, { eventHash: "sha256:forged" })),
    ).rejects.toSatisfy(isCoreError);
  });
});

describe("Phase 6 — tampered stored payload is detected by chain verification", () => {
  it("verifyChain returns false after a direct payload mutation", async () => {
    const { company, agent, trace } = await seedTrace("Traj StoredTamper");
    const e1 = await trajectory.appendEvent(evt(company.id, trace.id, agent.id, 1));
    // Simulate an attacker editing the stored payload WITHOUT updating the hash.
    await db.prisma.trajectoryEvent.update({
      where: { id: e1.id },
      data: { payloadJson: { name: "TAMPERED" } as unknown as object },
    });
    expect(await trajectory.verifyChain(company.id, trace.id)).toBe(false);
  });
});

describe("Phase 6 — append-only + tenant isolation", () => {
  it("exposes no update/delete method on the service surface (append-only)", () => {
    const surface = Object.getOwnPropertyNames(TrajectoryService.prototype);
    for (const forbidden of ["updateEvent", "deleteEvent", "editEvent", "removeEvent"]) {
      expect(surface).not.toContain(forbidden);
    }
  });

  it("company A cannot read company B's trace or events", async () => {
    const b = await seedTrace("Traj Tenant B");
    await trajectory.appendEvent(evt(b.company.id, b.trace.id, b.agent.id, 1));
    const a = await seedTrace("Traj Tenant A");

    expect(await trajectory.getTrace(a.company.id, b.trace.id)).toBeNull();
    const crossEvents = await trajectory.getEvents(a.company.id, b.trace.id);
    expect(crossEvents).toHaveLength(0);
  });
});
