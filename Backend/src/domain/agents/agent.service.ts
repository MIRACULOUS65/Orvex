/**
 * Agent registry + lifecycle — Phase 3, Task 3.3.
 *
 * An Agent belongs to exactly one Company (BACKEND_DATABASE.md §7). Every read/write is
 * company-scoped (getById(companyId, id)) so tenant boundaries are enforced at the
 * repository call, not just by convention (§50).
 *
 * Lifecycle statuses (plan §3.3): ACTIVE / PAUSED / SUSPENDED / DISABLED. The schema
 * also models CREATED/CONFIGURED as earlier states (§7); a freshly-created agent starts
 * CREATED and is moved to ACTIVE explicitly.
 *
 * Authority-separation invariant (batch requirement 6): an agent cannot modify its own
 * authority. This service never exposes a path for an agent principal to change its own
 * constitution/policy/capabilities; those are operator-driven and live in the
 * Constitution/Capability services. `setActiveConstitution` is an operator action and
 * refuses to point an agent at a constitution owned by another company/agent.
 */
import type { Agent, AgentStatus, ExecutionMode, PrismaClient } from "@prisma/client";
import { CoreError } from "../../shared/errors/index.js";

export interface CreateAgentInput {
  companyId: string;
  name: string;
  purpose?: string;
  executionMode?: ExecutionMode;
}

export class AgentService {
  constructor(private readonly db: PrismaClient) {}

  async createAgent(input: CreateAgentInput): Promise<Agent> {
    const name = input.name?.trim();
    if (!name) {
      throw CoreError.of("INVALID_INPUT", "Agent name is required.");
    }
    // Ensure the parent company exists (FK also enforces this, but we want a clean
    // domain error rather than a raw constraint violation).
    const company = await this.db.company.findUnique({ where: { id: input.companyId } });
    if (!company) {
      throw CoreError.of("TENANT_ERROR", "Company not found for agent.", {
        details: { companyId: input.companyId },
      });
    }
    try {
      return await this.db.agent.create({
        data: {
          companyId: input.companyId,
          name,
          purpose: input.purpose ?? "",
          executionMode: input.executionMode ?? "SIMULATE",
          status: "CREATED",
        },
      });
    } catch (err) {
      // Unique (company_id, name) violation.
      throw CoreError.of("CONFLICT", "An agent with this name already exists.", {
        details: { companyId: input.companyId, name },
        cause: err,
      });
    }
  }

  /** Company-scoped fetch — returns null if the agent is not in this company. */
  async getAgent(companyId: string, agentId: string): Promise<Agent | null> {
    return this.db.agent.findFirst({ where: { id: agentId, companyId } });
  }

  /** Company-scoped fetch or throw. */
  async requireAgent(companyId: string, agentId: string): Promise<Agent> {
    const agent = await this.getAgent(companyId, agentId);
    if (!agent) {
      throw CoreError.of("AGENT_NOT_FOUND", "Agent not found in this company.", {
        details: { companyId, agentId },
      });
    }
    return agent;
  }

  async listAgents(companyId: string): Promise<Agent[]> {
    return this.db.agent.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
  }

  private async transition(
    companyId: string,
    agentId: string,
    status: AgentStatus,
  ): Promise<Agent> {
    await this.requireAgent(companyId, agentId);
    return this.db.agent.update({ where: { id: agentId }, data: { status } });
  }

  activateAgent(companyId: string, agentId: string): Promise<Agent> {
    return this.transition(companyId, agentId, "ACTIVE");
  }

  pauseAgent(companyId: string, agentId: string): Promise<Agent> {
    return this.transition(companyId, agentId, "PAUSED");
  }

  resumeAgent(companyId: string, agentId: string): Promise<Agent> {
    return this.transition(companyId, agentId, "ACTIVE");
  }

  suspendAgent(companyId: string, agentId: string): Promise<Agent> {
    return this.transition(companyId, agentId, "SUSPENDED");
  }

  disableAgent(companyId: string, agentId: string): Promise<Agent> {
    return this.transition(companyId, agentId, "DISABLED");
  }
}
