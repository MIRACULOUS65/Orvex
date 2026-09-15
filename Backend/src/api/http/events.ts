/**
 * Structured domain events / observability — Backend/Core product surface.
 *
 * Emits structured, correlation-carrying events for lifecycle transitions
 * (agent.created, decision.created, execution.requested, ...). Events go through the
 * existing structured logger (JSON, redaction-aware) so no secrets leak. This is a
 * thin, dependency-free emitter — not a new queue/broker (per the "do not overengineer"
 * directive).
 */
import type { FastifyRequest } from "fastify";
import { getLogger } from "../../shared/logging/index.js";

export type DomainEventType =
  | "agent.created"
  | "agent.updated"
  | "intent.created"
  | "proposal.created"
  | "policy.created"
  | "policy.compiled"
  | "policy.validated"
  | "policy.activated"
  | "constitution.created"
  | "constitution.activated"
  | "security.assessed"
  | "decision.created"
  | "approval.requested"
  | "approval.completed"
  | "execution.requested"
  | "execution.submitted"
  | "execution.result"
  | "execution.reconciled"
  | "verification.completed"
  | "audit.created"
  | "attestation.created";

/**
 * Emit a structured domain event with correlation context. `data` must contain only
 * non-secret identifiers/values (the logger also applies redaction as a safety net).
 */
export function emitEvent(
  req: FastifyRequest,
  type: DomainEventType,
  data: Record<string, unknown> = {},
): void {
  const logger = req.log_ctx ?? getLogger();
  logger.info("domain_event", {
    event_type: type,
    company_id: req.auth?.companyId ?? req.context?.company_id,
    ...data,
  });
}
