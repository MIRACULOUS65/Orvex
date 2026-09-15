/**
 * Service container — Backend/Core product surface.
 *
 * Instantiates the domain/application services once and hands them to the /v1 routes.
 * This is dependency injection without a framework (per "do not overengineer"). Tests
 * build a container with an injected PrismaClient + mock ExecutionClient/AttestationAdapter.
 */
import type { PrismaClient } from "@prisma/client";
import {
  AgentService,
  CapabilityService,
  CompanyService,
  ConstitutionService,
  FinancialService,
  IdempotencyService,
} from "../../domain/index.js";
import { PolicyService } from "../../policy/index.js";
import { DecisionEngine, DecisionService } from "../../decision/index.js";
import { ApprovalService } from "../../approval/index.js";
import { SecurityOrchestrator } from "../../application/orchestrator/index.js";
import { IntakeService } from "../../application/intake.service.js";
import { FinalRevalidationService, ExecutionResultService } from "../../execution-gate/index.js";
import { AuditService, AttestationService, ForensicReconstructionService, MockAttestationAdapter, type AttestationAdapter } from "../../audit/index.js";
import { MockExecutionClient, type ExecutionClient } from "../../application/clients/execution/index.js";

export interface ContainerOptions {
  db: PrismaClient;
  executionClient?: ExecutionClient;
  attestationAdapter?: AttestationAdapter;
}

export interface Container {
  db: PrismaClient;
  company: CompanyService;
  agent: AgentService;
  constitution: ConstitutionService;
  capability: CapabilityService;
  financial: FinancialService;
  idempotency: IdempotencyService;
  policy: PolicyService;
  decisionEngine: DecisionEngine;
  decision: DecisionService;
  approval: ApprovalService;
  orchestrator: SecurityOrchestrator;
  intake: IntakeService;
  finalRevalidation: FinalRevalidationService;
  executionResult: ExecutionResultService;
  audit: AuditService;
  attestation: AttestationService;
  forensic: ForensicReconstructionService;
  executionClient: ExecutionClient;
}

export function buildContainer(options: ContainerOptions): Container {
  const { db } = options;
  const policy = new PolicyService(db);
  const executionClient = options.executionClient ?? new MockExecutionClient({ verified: true });
  const attestationAdapter = options.attestationAdapter ?? new MockAttestationAdapter();
  return {
    db,
    company: new CompanyService(db),
    agent: new AgentService(db),
    constitution: new ConstitutionService(db),
    capability: new CapabilityService(db),
    financial: new FinancialService(db),
    idempotency: new IdempotencyService(db),
    policy,
    decisionEngine: new DecisionEngine(),
    decision: new DecisionService(db),
    approval: new ApprovalService(db),
    orchestrator: new SecurityOrchestrator({ db, policyService: policy }),
    intake: new IntakeService(db),
    finalRevalidation: new FinalRevalidationService({ db, policyService: policy }),
    executionResult: new ExecutionResultService(db, executionClient),
    audit: new AuditService(db),
    attestation: new AttestationService(db, attestationAdapter),
    forensic: new ForensicReconstructionService(db),
    executionClient,
  };
}
