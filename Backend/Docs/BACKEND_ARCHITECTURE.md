# SentinelPay — BACKEND_ARCHITECTURE.md

## Backend / Sentinel Core Architecture Specification

**Document Type:** Backend Architecture Specification  
**Product:** SentinelPay SDK  
**Subsystem:** Sentinel Core / Backend / Policy / Orchestration  
**Version:** V1.0  
**Status:** Canonical Backend Architecture  
**Audience:** Backend/Core developers, AI/ML developers, Blockchain/Execution developers, SDK developers, Kiro

---

# 1. Purpose

This document defines the internal architecture of the SentinelPay Backend/Core subsystem.

The Backend/Core is the deterministic control plane positioned between:

```text
AI / Agent Intelligence
        │
        ▼
Sentinel Core
        │
        ▼
Blockchain / Payment Execution
```

Its primary responsibility is to transform probabilistic agent output into a deterministic, policy-enforced authorization decision.

The architectural principle is:

> **AI may recommend. Deterministic systems authorize.**

The Backend/Core must therefore be:

```text
deterministic
typed
auditable
tenant-isolated
fail-closed
idempotent
concurrency-safe
provider-agnostic
```

---

# 2. Backend Position in the Overall System

The complete SentinelPay architecture is:

```text
                         HUMAN
                           │
                           ▼
                     INTENT LAYER
                           │
                           ▼
                     AGENT BRAIN
                           │
                           ▼
                    ACTION PROPOSAL
                           │
                           ▼
              ╔══════════════════════════╗
              ║      SENTINEL CORE       ║
              ║                          ║
              ║ Identity / Capability    ║
              ║ Constitution / Policy   ║
              ║ Trajectory               ║
              ║ Security Orchestration  ║
              ║ Transaction Gate         ║
              ║ Decision Engine          ║
              ║ Approval Engine          ║
              ║ Execution Gate           ║
              ║ Audit                    ║
              ╚════════════╤═════════════╝
                           │
                ┌──────────┼──────────┐
                │          │          │
                ▼          ▼          ▼
              DENY       REVIEW      ALLOW
                           │          │
                           ▼          │
                        APPROVAL      │
                           │          │
                           └────┬─────┘
                                ▼
                         FINAL REVALIDATION
                                │
                                ▼
                       EXECUTION REQUEST
                                │
                                ▼
                     BLOCKCHAIN / PAYMENT
                                │
                                ▼
                      VERIFIED EXECUTION
                                │
                       ┌────────┴────────┐
                       ▼                 ▼
                     AUDIT          ATTESTATION
```

---

# 3. Architectural Responsibilities

The Backend/Core owns:

```text
Company / tenant isolation
Agent identity
Agent Constitution
Capabilities
Policy lifecycle
Deterministic policy enforcement
Trajectory ingestion/state
AI/security orchestration
Transaction gate
Decision Engine
Human approval
Execution authorization
Financial reservations and limits
Idempotency
Concurrency control
Audit
Attestation coordination
Core APIs
Service authentication
Observability
```

The Backend/Core does not own:

```text
Foundation-model training
Agent reasoning
Prompt-injection classifier training
Risk/anomaly model training
Private-key storage
Smart-account implementation
Raw blockchain RPC
Raw transaction signing
Raw transaction broadcasting
```

Those remain separate subsystem responsibilities.

---

# 4. Architectural Trust Model

The Backend/Core is the highest-trust application layer between AI output and financial execution.

Trust flows downward:

```text
Platform invariants
       ↓
Company Constitution
       ↓
Active Policy
       ↓
Capabilities
       ↓
Intent
       ↓
Action Proposal
       ↓
AI Security Intelligence
       ↓
External / Tool Evidence
```

The Core must never infer authority from:

```text
text
model confidence
tool output
web content
memory
reputation score
risk score
```

Authority must come from authenticated state and deterministic evaluation.

---

# 5. High-Level Component Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                        SENTINEL CORE                         │
│                                                              │
│  ┌─────────────┐        ┌────────────────┐                  │
│  │ API Gateway │───────►│ Authentication │                  │
│  └──────┬──────┘        └───────┬────────┘                  │
│         │                        │                           │
│         ▼                        ▼                           │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                 APPLICATION LAYER                    │    │
│  │                                                      │    │
│  │  Orchestrator   Security Adapter   Execution Client │    │
│  │  Approval       Audit Service       AI Client        │    │
│  └───────────────────────┬──────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                    DOMAIN LAYER                      │    │
│  │                                                      │    │
│  │ Companies | Agents | Capabilities | Policies        │    │
│  │ Intent    | Proposals | Decisions | Approvals       │    │
│  │ Executions | Financial State                        │    │
│  └───────────────────────┬──────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                  CONTROL ENGINES                     │    │
│  │                                                      │    │
│  │ Policy Engine | Decision Engine | Trajectory Engine │    │
│  │ Transaction Gate | Approval Gate | Capability Gate   │    │
│  └───────────────────────┬──────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                PERSISTENCE / EVENTS                 │    │
│  │                                                      │    │
│  │ PostgreSQL | Redis Streams | Audit Store             │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────┬───────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        AI / Security              Execution
          Services                  Services
```

---

# 6. Architectural Layers

The Backend/Core uses five logical layers.

## 6.1 API Layer

Responsible for:

```text
HTTP
authentication
input validation
routing
rate limits
OpenAPI
request correlation
```

The API layer does not contain domain policy logic.

---

## 6.2 Application Layer

Responsible for orchestration:

```text
evaluate proposal
compile/activate policy
request approval
authorize execution
reconcile execution
finalize audit
```

This layer coordinates multiple domain components.

---

## 6.3 Domain Layer

Contains authoritative business concepts:

```text
Company
Agent
Constitution
Capability
Policy
Intent
ActionProposal
Decision
Approval
Execution
Financial State
```

Domain services enforce invariants.

---

## 6.4 Control Engine Layer

Contains deterministic security/authorization logic:

```text
Policy Engine
Decision Engine
Capability Engine
Trajectory Engine
Transaction Gate
Approval Gate
Execution Gate
```

This is the most security-sensitive application layer.

---

## 6.5 Infrastructure Layer

Contains:

```text
PostgreSQL
Prisma
Redis
service clients
event consumers
telemetry
logging
configuration
```

Infrastructure must not bypass domain rules.

---

# 7. Recommended Directory Architecture

Physical backend root:

```text
03-BACKEND-CORE/
```

or repository-equivalent backend root.

Recommended structure:

```text
03-BACKEND-CORE/
│
├── docs/
│   ├── PRD_BACKEND_CORE.md
│   ├── IMPLEMENTATION_PLAN_BACKEND.md
│   ├── BACKEND_ARCHITECTURE.md
│   ├── BACKEND_WORKFLOW.md
│   ├── BACKEND_API.md
│   ├── BACKEND_DATABASE.md
│   ├── BACKEND_SECURITY.md
│   └── BACKEND_TESTING.md
│
├── src/
│   ├── api/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   └── openapi/
│   │
│   ├── domain/
│   │   ├── companies/
│   │   ├── agents/
│   │   ├── capabilities/
│   │   ├── constitutions/
│   │   ├── policies/
│   │   ├── intents/
│   │   ├── proposals/
│   │   ├── decisions/
│   │   ├── approvals/
│   │   ├── executions/
│   │   └── financial-state/
│   │
│   ├── application/
│   │   ├── orchestrator/
│   │   ├── services/
│   │   ├── clients/
│   │   │   ├── ai/
│   │   │   ├── execution/
│   │   │   ├── security/
│   │   │   └── attestation/
│   │   └── workers/
│   │
│   ├── policy/
│   │   ├── engine/
│   │   ├── rules/
│   │   ├── evaluator/
│   │   └── versioning/
│   │
│   ├── trajectory/
│   │   ├── ingestion/
│   │   ├── processor/
│   │   ├── hashing/
│   │   └── queries/
│   │
│   ├── security/
│   │   └── orchestrator/
│   │
│   ├── decision/
│   ├── approval/
│   ├── execution-gate/
│   ├── audit/
│   ├── events/
│   ├── repositories/
│   ├── config/
│   └── shared/
│       ├── errors/
│       ├── logging/
│       ├── telemetry/
│       └── utils/
│
├── db/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── fixtures/
│
├── tests/
│   ├── unit/
│   ├── contract/
│   ├── integration/
│   ├── security/
│   └── e2e/
│
├── scripts/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
└── README.md
```

Kiro must inspect the repository before creating this structure and reuse an existing equivalent root when present.

---

# 8. API Gateway Architecture

The API gateway is the external entry boundary.

```text
HTTP Request
    │
    ▼
Correlation Middleware
    │
    ▼
Authentication
    │
    ▼
Tenant Resolution
    │
    ▼
Rate Limit
    │
    ▼
Schema Validation
    │
    ▼
Controller
    │
    ▼
Application Service
```

The gateway must not make final authorization decisions.

---

# 9. Internal Service Architecture

The Core communicates with AI and Execution through explicit clients.

```text
                 SENTINEL CORE
                      │
        ┌─────────────┴─────────────┐
        │                           │
        ▼                           ▼
     AI Client               Execution Client
        │                           │
        ▼                           ▼
 AI/ML Service              Blockchain Service
```

Clients provide:

```text
timeouts
authentication
retry policy
schema validation
error normalization
telemetry
```

---

# 10. AI Service Boundary

The Core consumes:

```text
Intent
ActionProposal
Trajectory/Evidence references
SecurityAssessment
```

AI may produce recommendations.

It must not produce Core authority.

The Core must validate every AI response against the shared schemas.

---

# 11. Execution Service Boundary

The Core provides:

```text
ExecutionRequest
```

The Execution subsystem provides:

```text
TransactionAnalysis
SimulationResult
ExecutionResult
ReceiptVerification
AttestationResult
```

The Core must never require the Execution service to understand business-policy semantics beyond the execution context it receives.

---

# 12. Domain Architecture

Domain modules should contain:

```text
entities
value objects
domain services
invariants
state transitions
```

They should not directly depend on Fastify.

Example:

```text
domain/decisions/
├── decision.ts
├── decision-state.ts
├── decision-rules.ts
└── decision-service.ts
```

---

# 13. Company Domain

The Company domain establishes the tenant root:

```text
Company
```

Everything financial/security-sensitive must be associated with a company.

Relationships:

```text
Company
├── Agents
├── Policies
├── Capabilities
├── Intents
├── Proposals
├── Decisions
├── Executions
└── Audit
```

Tenant boundaries are mandatory.

---

# 14. Agent Domain

Agent identity includes:

```text
agent_id
company_id
purpose
status
constitution
policy
capabilities
execution_mode
```

Agent state transitions:

```text
CREATED
↓
CONFIGURED
↓
ACTIVE
↓
PAUSED / SUSPENDED / DISABLED
```

An agent cannot mutate its own security status.

---

# 15. Constitution Domain

The Constitution defines broad authority.

```text
Company Policy Intent
        ↓
Constitution
        ↓
Capability
```

Constitution rules cannot silently become broader through Intent.

---

# 16. Capability Domain

A Capability is a scoped financial authority.

Dimensions:

```text
action
amount
currency/asset
network
category
recipient
time
expiration
```

Capability containment:

```text
Child Capability ⊆ Parent Capability
```

---

# 17. Intent Domain

Intent describes the user's current purpose.

```text
Constitution:
what the agent is allowed to do

Intent:
what the user wants now
```

Both must be satisfied.

---

# 18. Policy Domain

The Policy domain represents active deterministic rules.

A policy consists of:

```text
Policy
└── PolicyVersion
    └── PolicyRules
```

Activated versions are immutable.

---

# 19. Proposal Domain

ActionProposal is the direct output of Agent Intelligence before Core authorization.

Core validates:

```text
intent binding
agent binding
trajectory binding
financial fields
expiration
schema
```

---

# 20. Decision Domain

Decision is the Core authorization result.

Allowed final values:

```text
ALLOW
REVIEW
DENY
```

Decision must reference:

```text
Intent
Policy
SecurityAssessment
TransactionAnalysis
Simulation
Approval
```

where applicable.

---

# 21. Approval Domain

Approval is an explicit authorization event from a permitted human role.

It must be bound to:

```text
decision
transaction
policy version
context hash
expiration
approver
```

---

# 22. Execution Domain

Execution is modeled as:

```text
ExecutionRequest
        ↓
ExecutionResult
        ↓
ReceiptVerification
```

The Core owns authorization context.

The Execution service owns actual execution.

---

# 23. Financial State Architecture

Core tracks:

```text
reserved
committed
released
```

for financial limits.

State flow:

```text
Proposal
   ↓
Budget Check
   ↓
Reserve
   ↓
Execute
   ├── SUCCESS → Commit
   ├── FAILURE → Release
   └── UNKNOWN → Keep Reserved
```

This prevents overspending from concurrent or uncertain operations.

---

# 24. Policy Engine Architecture

The policy engine should be deterministic.

```text
Policy
+
Intent
+
Proposal
+
Trajectory State
+
Capability
+
Transaction Context
        │
        ▼
   Policy Engine
        │
        ▼
PolicyEvaluation
```

No LLM calls occur inside deterministic rule execution.

---

# 25. Policy Rule Architecture

V1 rule modules:

```text
amount
cumulative
recipient
asset
network
category
time
approval
predecessor
structuring
capability
```

Each rule should implement a common evaluation interface.

Conceptually:

```typescript
interface PolicyRule {
  id: string;
  type: RuleType;

  evaluate(context: PolicyContext): RuleResult;
}
```

---

# 26. Policy Evaluation Context

A deterministic `PolicyContext` should contain only validated data:

```text
company
agent
constitution
capability
intent
proposal
trajectory summary
current spending state
transaction context
security assessment
current timestamp
```

Avoid passing arbitrary model text into policy rules.

---

# 27. Trajectory Architecture

Trajectory is both:

```text
security evidence
policy state
audit evidence
```

Pipeline:

```text
Agent / MCP / Adapter
        │
        ▼
Redis Stream
        │
        ▼
Trajectory Processor
        │
        ├── validate
        ├── sequence
        ├── hash
        └── persist
                │
                ▼
            PostgreSQL
```

---

# 28. Trajectory Hash Chain

Each event references:

```text
previous_event_hash
```

and contains:

```text
event_hash
```

This provides tamper evidence.

The trajectory service must not expose a generic update operation for historical events.

---

# 29. Security Orchestrator Architecture

The Security Orchestrator coordinates AI intelligence with deterministic Core state.

```text
ActionProposal
    │
    ├── Intent
    ├── Constitution
    ├── Capability
    ├── Policy
    ├── Trajectory
    └── SecurityAssessment
             │
             ▼
       Security Context
             │
             ▼
       Transaction Gate
             │
             ▼
        Decision Engine
```

The orchestrator is deterministic in sequencing and authority, even if some inputs are probabilistic.

---

# 30. Transaction Gate Architecture

The Transaction Gate compares:

```text
ActionProposal
TransactionIntent
TransactionRequest
TransactionAnalysis
```

It verifies:

```text
recipient
amount
asset
network
action
contract/function where applicable
```

The natural-language reason provided by the agent is never the only source of truth.

---

# 31. Simulation Gate Architecture

Simulation is an execution-analysis dependency.

```text
TransactionRequest
        │
        ▼
Execution Client
        │
        ▼
SimulationResult
        │
        ▼
Simulation Gate
```

The result must be bound to the exact transaction being authorized.

---

# 32. Decision Engine Architecture

The Decision Engine is the highest-trust application component.

```text
PolicyEvaluation
SecurityAssessment
TransactionAnalysis
SimulationResult
ApprovalState
Capability
Intent
        │
        ▼
Decision Engine
        │
   ┌────┼────┐
   ▼    ▼    ▼
DENY REVIEW ALLOW
```

---

# 33. Decision Precedence

Default precedence:

```text
Platform Security Invariant
        ↓
Authority / Capability Failure
        ↓
Hard Policy Violation
        ↓
Transaction Invalidity
        ↓
Mandatory Simulation Failure
        ↓
Expired Context
        ↓
Required Approval
        ↓
Risk-Based Review Rule
        ↓
ALLOW
```

This is deterministic and must be unit/property tested.

---

# 34. Final Revalidation Architecture

Even after Decision:

```text
Decision = ALLOW
```

the Core performs:

```text
agent status
intent status
capability
policy version
approval
transaction hash
simulation
chain
execution mode
budget
idempotency
```

Only then:

```text
ExecutionRequest
```

is generated.

---

# 35. Execution Gate Architecture

```text
Decision
   │
   ▼
Final Revalidation
   │
   ▼
Authorization Context Hash
   │
   ▼
ExecutionRequest
   │
   ▼
Execution Service
```

There must be no generic backend API that allows arbitrary transaction execution without this path.

---

# 36. Approval Architecture

```text
Decision = REVIEW
       │
       ▼
ApprovalRequest
       │
       ▼
Human Operator
       │
   ┌───┴────┐
   ▼        ▼
APPROVE   DENY
   │        │
   ▼        ▼
Revalidate  DENY
   │
   ▼
Execution
```

Approval is not a replacement for policy or technical validation.

---

# 37. Idempotency Architecture

Financial operations require:

```text
stable logical identity
```

The idempotency key is derived from the execution context.

Conceptually:

```text
hash(
company
+
agent
+
intent
+
proposal
+
transaction
+
policy version
)
```

Store the idempotency result.

Retries must return the existing logical operation rather than create a second payment.

---

# 38. Concurrency Architecture

Financial limits require serialized or transactional updates.

Conceptual flow:

```text
Transaction Request
        │
        ▼
Acquire Budget/State Lock
        │
        ▼
Recalculate Available Budget
        │
        ▼
Reserve
        │
        ▼
Release/Commit Later
```

The exact locking implementation may use PostgreSQL transactions/row locks.

---

# 39. Event Architecture

Core internal events:

```text
company.created
agent.created
agent.paused
policy.created
policy.activated
capability.created
intent.created
proposal.created
trajectory.recorded
security.assessment.completed
policy.evaluation.completed
transaction.validated
simulation.completed
approval.requested
approval.completed
decision.created
execution.requested
execution.submitted
execution.confirmed
execution.failed
verification.completed
audit.created
attestation.created
```

Events should be structured and versioned.

---

# 40. Redis Architecture

Redis is used for:

```text
trajectory streams
queues
short-lived state
locks
rate limits
notifications
```

Redis is not the sole authoritative store for financial state.

---

# 41. PostgreSQL Architecture

PostgreSQL stores durable Core state:

```text
companies
agents
capabilities
constitutions
policies
policy_versions
policy_rules
intents
proposals
trajectories
assessments
transactions
decisions
approvals
executions
financial state
audit events
attestations
```

---

# 42. Repository Architecture

Domain services should use repositories rather than raw database access.

Conceptual:

```typescript
interface PolicyRepository {
  getActive(companyId: string, agentId: string): Promise<Policy>;
  getVersion(policyId: string, version: number): Promise<PolicyVersion>;
}
```

Application/domain code should not scatter Prisma calls across controllers.

---

# 43. Transaction Boundaries

Use database transactions for:

```text
budget reservation
policy activation
capability activation/revocation
approval state transition where applicable
financial state commit
idempotency registration
```

Avoid long transactions around:

```text
LLM calls
blockchain broadcast
human waiting periods
```

External calls occur outside long-held DB transactions where possible.

---

# 44. External Call Architecture

AI/Execution clients must implement:

```text
timeout
retry only when safe
idempotency where supported
schema validation
error mapping
observability
```

Do not blindly retry an unknown financial broadcast.

---

# 45. Failure Architecture

Critical service failure:

```text
Policy unavailable
→ cannot authorize

Execution unknown
→ reconcile

Simulation unavailable and mandatory
→ no execution

Approval unavailable
→ no execution if approval required
```

Infrastructure errors must never silently become:

```text
ALLOW
```

---

# 46. Security Boundaries in Code

Recommended dependency direction:

```text
API
 ↓
Application
 ↓
Domain / Control Engines
 ↓
Repositories / Clients
```

Do not allow:

```text
AI client → signer
API controller → database authorization bypass
dashboard → execution service directly
```

Execution should always route through Core authorization.

---

# 47. Module Dependency Rules

## Allowed

```text
API → Application
Application → Domain
Application → Clients
Domain → Shared
Repositories → Database
Workers → Application
```

## Discouraged / forbidden

```text
Domain → Fastify
Domain → raw HTTP
AI module → signer
Dashboard → blockchain signer
Policy rule → LLM
Decision engine → model inference
```

---

# 48. Authentication Architecture

External:

```text
SDK/API caller
   ↓
Authentication
   ↓
Tenant resolution
   ↓
Authorization
```

Internal:

```text
AI Service
Execution Service
Worker
   ↓
Service Authentication
   ↓
Core
```

Do not use network location as authorization.

---

# 49. Authorization Roles

V1 logical roles:

```text
OWNER
ADMIN
OPERATOR
AUDITOR
AGENT_SERVICE
EXECUTION_SERVICE
READ_ONLY
```

Capabilities should be checked in addition to roles.

---

# 50. Tenant Isolation Architecture

Every query must be tenant-aware.

Example:

```text
request authenticated as company A
        ↓
repository scope = company A
        ↓
query
```

Avoid:

```text
getById(id)
```

when an object is tenant-scoped.

Prefer:

```text
getById(companyId, id)
```

or an equivalent scoped repository.

---

# 51. Versioning Architecture

Version:

```text
schemas
policies
constitutions
capabilities where needed
security assessments
SDK
Core
```

Historical authorization records must preserve the versions used to make decisions.

---

# 52. Decision Context Hash Architecture

A decision should have an explicit cryptographic context representation.

```text
Intent Hash
+
Proposal Hash
+
Policy Hash
+
Security Assessment Hash
+
Transaction Hash
+
Simulation Hash
+
Approval Hash
        │
        ▼
Decision Context Hash
```

This hash is referenced by the execution layer.

---

# 53. Audit Architecture

Audit is append-oriented:

```text
Domain Event
   ↓
Audit Event
   ↓
Previous Hash
   ↓
Current Hash
```

Later:

```text
Audit events
   ↓
Merkle aggregation
   ↓
Attestation
```

Raw sensitive information remains off-chain.

---

# 54. Attestation Architecture

The backend prepares the logical commitment.

```text
Audit / Decision State
        ↓
Trace Merkle Root
Policy Hash
Decision
Transaction Hash
Timestamp
Agent
        ↓
Attestation Adapter
        ↓
Blockchain
```

Attestation failure does not invalidate an already confirmed payment.

---

# 55. Observability Architecture

OpenTelemetry should instrument:

```text
HTTP
application orchestration
policy evaluation
decision
approval
execution gate
AI client
execution client
database operations where appropriate
workers
```

Every trace should preserve:

```text
correlation_id
agent_id
intent_id
proposal_id
decision_id
transaction_id
execution_id
```

---

# 56. Logging Architecture

Use structured JSON logs.

Minimum fields:

```text
timestamp
level
service
event
correlation_id
company_id
agent_id
decision_id
transaction_id
```

Redact:

```text
API keys
tokens
private keys
seed phrases
cookies
authentication headers
payment credentials
```

---

# 57. API Architecture Summary

Public API resources:

```text
/v1/companies
/v1/agents
/v1/capabilities
/v1/constitutions
/v1/policies
/v1/intents
/v1/proposals
/v1/trajectory
/v1/security
/v1/transactions
/v1/simulations
/v1/decisions
/v1/approvals
/v1/executions
/v1/verification
/v1/audit
/v1/attestations
```

Internal service APIs:

```text
/internal/v1/ai
/internal/v1/execution
/internal/v1/events
```

The exact endpoint contracts are defined in `BACKEND_API.md`.

---

# 58. Core Workflow Architecture

## Normal Payment

```text
Intent
 ↓
ActionProposal
 ↓
SecurityAssessment
 ↓
Policy
 ↓
TransactionAnalysis
 ↓
Simulation
 ↓
Decision
 ↓
Approval if required
 ↓
Final Revalidation
 ↓
ExecutionRequest
 ↓
Execution
 ↓
Verification
 ↓
Financial Commit
 ↓
Audit
 ↓
Attestation
```

---

# 59. Attack Architecture

```text
External Content
      ↓
Agent sees injection
      ↓
ActionProposal changes
      ↓
SecurityAssessment
      ↓
Policy / Transaction Gate
      ↓
DENY
      ↓
NO ExecutionRequest
```

This illustrates why the Core remains effective even when AI reasoning is manipulated.

---

# 60. Review Architecture

```text
Security / Policy
       ↓
REVIEW
       ↓
ApprovalRequest
       ↓
Human
       ↓
APPROVED
       ↓
Final Revalidation
       ↓
ExecutionRequest
```

---

# 61. State Machine Architecture

High-level lifecycle:

```text
RECEIVED
   ↓
VALIDATING
   ↓
EVALUATING
   ↓
TRANSACTION_CHECK
   ↓
SIMULATING
   ↓
DECIDING
   ├── DENY
   ├── REVIEW → APPROVAL_PENDING
   │             ↓
   │          APPROVED
   └── ALLOW
         ↓
REVALIDATING
         ↓
EXECUTION_REQUESTED
         ↓
EXECUTING
         ↓
VERIFYING
         ↓
COMPLETED
```

---

# 62. Read vs Write Separation

Core reads can be highly parallelized.

Authorization writes must be controlled.

Examples:

```text
Read:
policy
trajectory
security assessment

Write:
policy activation
budget reservation
approval
decision
execution authorization
financial commit
```

---

# 63. Consistency Model

Strong consistency is required for:

```text
policy activation
capability state
budget reservation
approval validity
decision binding
idempotency
execution authorization
financial commit
```

Eventual consistency is acceptable for:

```text
dashboard projections
analytics
notifications
non-critical audit views
```

---

# 64. Cache Strategy

Safe to cache:

```text
read-only metadata
provider metadata
non-sensitive static configuration
```

Use caution around:

```text
active policy
capability state
financial budget
approval state
execution state
```

Security-sensitive authorization state should always be revalidated from authoritative storage before execution.

---

# 65. Background Workers

Workers handle:

```text
trajectory processing
audit projection
attestation retry
notifications
reconciliation
cleanup
```

Workers must be idempotent.

---

# 66. Reconciliation Worker

Important worker:

```text
Execution UNKNOWN
        ↓
Reconciliation Worker
        ↓
Receipt lookup
        ↓
Verification
        ↓
Financial state update
```

It must not create a second transaction.

---

# 67. Attestation Retry Worker

```text
confirmed execution
        ↓
attestation failed
        ↓
retry queue
        ↓
attestation submission
```

Attestation is independent of payment outcome.

---

# 68. Policy Activation Architecture

A policy should become active only through:

```text
draft
→ validation
→ simulation
→ human approval if required
→ activation
```

Activation creates an immutable historical version.

---

# 69. Security Intelligence Failure

If AI says:

```text
unavailable
```

Core behavior depends on policy.

Possible:

```text
REVIEW
DENY
```

Never silently:

```text
ALLOW
```

for a security-critical unknown.

---

# 70. Execution Service Failure

If Execution service says:

```text
unavailable
```

Core should remain in:

```text
READY / BLOCKED / RETRYABLE
```

state according to context.

No implicit payment.

---

# 71. Core Performance Boundary

The deterministic portion should remain low-latency.

Potential slow operations:

```text
AI inference
simulation
human approval
blockchain confirmation
```

The Core must not hold long database locks while waiting for them.

---

# 72. Core Scalability Architecture

Scale independently:

```text
API workers
Policy workers
Trajectory processors
Audit workers
Reconciliation workers
```

Shared state:

```text
PostgreSQL
Redis
```

The decision logic remains deterministic across replicas.

---

# 73. Horizontal Scaling Requirements

Multiple Core instances must not cause:

```text
duplicate budget reservation
duplicate approval
duplicate execution
```

Use:

```text
database uniqueness
idempotency
row locks
distributed locks only when necessary
```

---

# 74. Repository Pattern

Repositories abstract persistence.

Example modules:

```text
company.repository
agent.repository
policy.repository
intent.repository
proposal.repository
decision.repository
approval.repository
execution.repository
audit.repository
financial-state.repository
```

Repositories should not contain business policy.

---

# 75. Application Services

Application services coordinate use cases:

```text
RegisterAgent
ActivatePolicy
EvaluateProposal
CreateApproval
ApproveDecision
AuthorizeExecution
HandleExecutionResult
VerifyReceipt
FinalizeAudit
```

These are better boundaries than giant controllers.

---

# 76. Core Use Case: Evaluate Proposal

Conceptual flow:

```typescript
evaluateProposal(input)
  → authenticate
  → resolve tenant
  → load agent
  → validate intent
  → validate capability
  → load policy
  → load security assessment
  → evaluate policy
  → validate transaction
  → simulate
  → decision
```

---

# 77. Core Use Case: Authorize Execution

```typescript
authorizeExecution(decisionId)
  → load decision
  → revalidate agent
  → revalidate capability
  → revalidate policy
  → revalidate transaction
  → revalidate simulation
  → validate approval
  → reserve budget
  → create ExecutionRequest
```

---

# 78. Core Use Case: Handle Execution Result

```typescript
handleExecutionResult(result)
  → validate execution
  → update lifecycle
  → reconcile state
  → verify receipt
  → commit/release reservation
  → audit
  → schedule attestation
```

---

# 79. Security Rule — No Direct Execution From AI

Code review rule:

Any dependency from:

```text
AI service
security service
policy AI
agent runtime
```

to:

```text
signer
wallet
execution
```

should be considered a security violation.

---

# 80. Security Rule — No Direct Execution From Dashboard

Dashboard action:

```text
Approve
```

must become:

```text
ApprovalResult
```

then Core revalidates and authorizes.

Dashboard must never directly invoke:

```text
wallet.sendTransaction()
```

---

# 81. Security Rule — No Policy Bypass Endpoint

Do not implement public APIs such as:

```text
POST /force-execute
POST /skip-policy
POST /admin-execute
```

unless a future emergency system is designed separately with explicit authorization, audit, and platform-level restrictions.

V1 does not require such a bypass.

---

# 82. Backend vs Blockchain Boundary

Backend knows:

```text
what should be authorized
```

Blockchain knows:

```text
what will actually execute
```

The bridge is:

```text
ExecutionRequest
```

and the return boundary is:

```text
TransactionAnalysis
SimulationResult
ExecutionResult
ReceiptVerification
```

---

# 83. Backend vs AI Boundary

AI knows:

```text
what seems likely
what seems suspicious
what intent appears to mean
```

Core knows:

```text
what authority exists
what policy says
what the actual transaction is
what may execute
```

---

# 84. Architectural Decision: Model Agnostic

Core should not import:

```text
Qwen
Gemini
OpenAI
```

directly.

The AI client should communicate through service contracts.

This prevents Core from becoming tied to a specific model provider.

---

# 85. Architectural Decision: Chain Agnostic

Core should not import:

```text
Base RPC library
viem
ethers
Solana SDK
```

for core authorization logic.

Chain-specific implementation belongs to the execution subsystem.

Core reasons over normalized transaction contracts.

---

# 86. Architectural Decision: Payment-Rail Agnostic

Core authorizes:

```text
payment intent / execution request
```

not a specific rail.

Adapters may support:

```text
x402
smart-account
API payment
future card/bank systems
```

Core should remain abstract.

---

# 87. Architectural Decision: Policy Engine First-Party

V1 uses a controlled first-party deterministic policy engine.

Possible future formal backends can plug into:

```text
PolicyEvaluation
```

without redesigning the rest of the system.

---

# 88. Architectural Decision: PostgreSQL as Durable Core State

PostgreSQL is the primary source of durable Core state.

Redis is not used as the only source of truth for:

```text
financial state
decision state
policy state
approval state
execution state
```

---

# 89. Architectural Decision: Redis for Event/Short-Lived State

Redis is used for:

```text
streams
queues
locks
temporary state
rate limits
```

A crash should not permanently destroy authorization/financial state.

---

# 90. Architectural Decision: Append-Only Audit

Historical decisions should remain reconstructable.

Do not update historical decision rows to make them tell a new story.

Create new events/versions.

---

# 91. Architectural Decision: Fail Closed

Security-critical uncertainty must not produce authorization.

Examples:

```text
policy unknown
→ no ALLOW

approval unknown
→ no execution

transaction mismatch
→ no execution

simulation mismatch
→ no execution

execution unknown
→ no automatic retry
```

---

# 92. Architectural Decision: Explicit Degraded Modes

Any degraded behavior must be configured and documented.

Example:

```text
reputation unavailable
→ REVIEW
```

The system must not invent:

```text
reputation unavailable
→ LOW RISK
```

---

# 93. Architecture Testing Strategy

The architecture should be proven through:

```text
unit tests
contract tests
property tests
integration tests
security tests
concurrency tests
E2E tests
```

Key architectural tests:

```text
Broken-AI
Broken-Tool
Wrong-Chain
Policy-Bypass
Approval-Mutation
Replay
Race
Simulation-Mismatch
Receipt-Mismatch
Tenant-Isolation
```

---

# 94. Broken-AI Architectural Test

AI returns:

```text
risk = LOW
threat = NONE
intent match = PASS
```

even for malicious transactions.

Core must still enforce:

```text
policy
capability
transaction validity
simulation
approval
```

and prevent unauthorized execution.

---

# 95. Broken-Tool Architectural Test

Tool returns:

```text
authorized = true
```

Core ignores it unless it is from an authenticated authoritative source.

---

# 96. Tenant Isolation Architectural Test

Company A attempts:

```text
GET Company B policy
```

Expected:

```text
DENY / NOT FOUND
```

depending on API semantics.

---

# 97. Replay Architectural Test

Same execution request repeated.

Expected:

```text
same logical execution
no duplicate payment
```

---

# 98. Race Architectural Test

Two simultaneous payments exceed a shared limit.

Expected:

```text
only permitted combined amount executes
```

---

# 99. Final Backend Architecture Diagram

```text
                         CUSTOMER / AGENT
                                │
                                ▼
                         SentinelPay SDK
                                │
                                ▼
                     ┌────────────────────┐
                     │    API GATEWAY     │
                     │ auth / tenant /    │
                     │ validation / trace │
                     └─────────┬──────────┘
                               │
                               ▼
                     ┌────────────────────┐
                     │ APPLICATION LAYER  │
                     │                    │
                     │ Orchestrator       │
                     │ AI Client          │
                     │ Execution Client   │
                     │ Approval Service   │
                     │ Audit Service      │
                     └─────────┬──────────┘
                               │
                               ▼
                     ┌────────────────────┐
                     │   DOMAIN LAYER     │
                     │                    │
                     │ Company            │
                     │ Agent              │
                     │ Constitution      │
                     │ Capability         │
                     │ Policy             │
                     │ Intent             │
                     │ Proposal           │
                     │ Decision           │
                     │ Approval           │
                     │ Execution          │
                     └─────────┬──────────┘
                               │
                               ▼
                     ┌────────────────────┐
                     │ CONTROL ENGINES    │
                     │                    │
                     │ Policy Engine      │
                     │ Trajectory Engine  │
                     │ Security Orchestr. │
                     │ Transaction Gate   │
                     │ Decision Engine    │
                     │ Approval Gate      │
                     │ Execution Gate     │
                     └─────────┬──────────┘
                               │
                 ┌─────────────┼─────────────┐
                 │             │             │
                 ▼             ▼             ▼
             PostgreSQL      Redis      External Services
                 │             │             │
                 │             │       ┌─────┴───────┐
                 │             │       ▼             ▼
                 │             │      AI          Execution
                 │             │       │             │
                 └─────────────┴───────┴─────────────┘
                                               │
                                               ▼
                                        Payment / Chain
                                               │
                                               ▼
                                        Receipt / State
                                               │
                                               ▼
                                           Verification
                                               │
                                               ▼
                                             Audit
                                               │
                                               ▼
                                          Attestation
```

---

# 100. Final Architectural Definition

The Backend/Core is the **authority boundary** of SentinelPay.

It does not attempt to be the smartest subsystem.

It is deliberately responsible for something more important:

```text
taking untrusted/probabilistic inputs
        ↓
normalizing them
        ↓
checking authoritative state
        ↓
enforcing deterministic policy
        ↓
verifying the exact transaction
        ↓
requiring approval where necessary
        ↓
authorizing a narrowly scoped execution
        ↓
verifying the result
        ↓
preserving the evidence
```

The architectural rule that must remain true throughout implementation is:

> **The Core does not decide what the AI thinks. The Core decides what the AI is allowed to cause.**
