/**
 * Correlation / request context — Phase 1, Task 1.5.
 *
 * Every request gets a stable request_id and correlation_id (inbound header if
 * present, else generated). The context is attached to the Fastify request and a
 * request-scoped child logger is bound so all downstream logs carry correlation.
 * Company/actor/agent are populated by later auth phases; the shape exists now.
 * (BACKEND_ARCHITECTURE.md §8, §55; PRD §12, §96.)
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { getLogger, type Logger } from "../../shared/logging/index.js";

export interface RequestContext {
  request_id: string;
  correlation_id: string;
  company_id?: string;
  actor_id?: string;
  agent_id?: string;
  trace_id?: string;
}

declare module "fastify" {
  interface FastifyRequest {
    context: RequestContext;
    log_ctx: Logger;
  }
}

const HEADER = {
  correlation: "x-correlation-id",
  request: "x-request-id",
  company: "x-company-id",
  actor: "x-actor-id",
  agent: "x-agent-id",
  trace: "x-trace-id",
} as const;

function headerValue(req: FastifyRequest, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

/** Register the correlation hook + response echo. */
export function registerCorrelation(app: FastifyInstance): void {
  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    const requestId = headerValue(req, HEADER.request) ?? `req_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const correlationId =
      headerValue(req, HEADER.correlation) ?? `corr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

    req.context = {
      request_id: requestId,
      correlation_id: correlationId,
      company_id: headerValue(req, HEADER.company),
      actor_id: headerValue(req, HEADER.actor),
      agent_id: headerValue(req, HEADER.agent),
      trace_id: headerValue(req, HEADER.trace),
    };

    req.log_ctx = getLogger().child({
      request_id: requestId,
      correlation_id: correlationId,
      ...(req.context.company_id ? { company_id: req.context.company_id } : {}),
      ...(req.context.agent_id ? { agent_id: req.context.agent_id } : {}),
    });

    // Echo correlation so clients/downstream can chain the workflow.
    reply.header(HEADER.request, requestId);
    reply.header(HEADER.correlation, correlationId);
  });
}
