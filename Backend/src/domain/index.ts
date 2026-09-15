/**
 * Domain services barrel — Phase 3.
 *
 * The authoritative tenant/agent identity + authority layer. Each service enforces its
 * own invariants (tenant scoping, immutable versioning, capability containment) and is
 * the only sanctioned way to mutate its aggregate.
 */
export { CompanyService } from "./companies/company.service.js";
export { AgentService } from "./agents/agent.service.js";
export type { CreateAgentInput } from "./agents/agent.service.js";
export {
  ConstitutionService,
} from "./constitutions/constitution.service.js";
export type {
  ConstitutionConfig,
  CreateConstitutionInput,
} from "./constitutions/constitution.service.js";
export { CapabilityService } from "./capabilities/capability.service.js";
export type { CreateCapabilityInput } from "./capabilities/capability.service.js";
export { FinancialService } from "./financial/financial.service.js";
export type { AccountKey, ReserveInput } from "./financial/financial.service.js";
export { IdempotencyService } from "./financial/idempotency.service.js";
export type { RegisterInput, RegisterResult } from "./financial/idempotency.service.js";
