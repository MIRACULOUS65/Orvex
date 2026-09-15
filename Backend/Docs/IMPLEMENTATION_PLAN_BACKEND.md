# SentinelPay — IMPLEMENTATION_PLAN_BACKEND.md

## Backend / Sentinel Core / Policy / Orchestration Implementation Plan

**Spec:** `backend-core-subsystem`  
**Physical implementation root:** `Orvex/Backend/`  
**Conceptual architecture root from PRD:** `services/core/`  
**Team:** Person 3 — Backend / Sentinel Core  
**Product:** SentinelPay SDK  
**Version:** V1.0  
**Status:** Execution plan for Kiro  
**Primary source:** `PRD_BACKEND_CORE.md` / uploaded backend PRD  
**Companion source:** `tasks_new.md` — completed AI/ML implementation plan  
**Primary objective:** Implement the deterministic Sentinel Core that sits between the completed AI/ML subsystem and the Blockchain/Execution subsystem.

---

# 0. How Kiro Must Use This Plan

This file is the execution roadmap for the Backend/Core implementation.

Kiro must:

1. execute phases in order unless a task explicitly permits parallel work;
2. complete and test each phase before moving to the next dependent phase;
3. use `CONTRACTS.md` as the canonical shape/meaning of shared objects;
4. use `PRD_BACKEND_CORE.md` as the canonical functional requirement for Person 3;
5. treat the existing AI/ML implementation as an upstream dependency, not something to rebuild;
6. create adapters around the existing AI/ML service rather than duplicating its logic;
7. leave Blockchain/Execution implementation behind a stable adapter/interface until Person 4's implementation is available;
8. preserve the security invariant that AI output never directly authorizes financial execution;
9. keep financial state and decisions in durable storage;
10. make every phase independently testable.

---

# 1. Source-of-Truth Relationship

The Backend/Core implementation must reconcile the following project documents:

```text
IDEA.md
SYSTEM_ARCHITECTURE.md
IMPLEMENTATION.md
TECH_STACK.md
WORKFLOW.md
API.md
CONTRACTS.md
SDK_SPEC.md
SECURITY_MODEL.md
EVALUATION.md
PRD_BACKEND_CORE.md
```

The AI/ML implementation already has its own execution plan in `tasks_new.md`, consisting of 11 phases from foundation through integration.

The AI/ML plan already creates and/or owns:

```text
Intent
ActionProposal
TrajectoryEvent
Evidence
SecurityAssessment
IntentVerification
ThreatAssessment
ReputationAssessment
RiskAssessment
AnomalyAssessment
EIS / provenance
Policy AI compiler
```

The Backend/Core plan must therefore **consume these outputs rather than recreate them**.

---

# 2. Important Path Convention

The backend PRD describes the conceptual service as:

```text
services/core/
```

The project-level folder strategy uses:

```text
03-BACKEND-CORE/
```

and the AI implementation uses:

```text
Orvex/ML/
```

For implementation consistency, this plan uses:

```text
Orvex/Backend/
```

as the physical backend implementation root.

Kiro must inspect the repository before creation.

If an existing backend root has already been established, reuse it rather than creating a second backend root.

Do not create both:

```text
Orvex/Backend/
services/core/
```

unless the repository architecture explicitly requires both.

The logical structure required by the PRD remains:

```text
api/
domain/
application/
policy/
trajectory/
security/
execution/
audit/
repositories/
workers/
tests/
```

---

# 3. Final Backend Objective

At the end of the plan, the Backend/Core must support:

```text
Human
  ↓
Intent
  ↓
Agent
  ↓
ActionProposal
  ↓
SecurityAssessment
  ↓
Policy
  ↓
Transaction Analysis
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
ExecutionResult
  ↓
ReceiptVerification
  ↓
Financial State Update
  ↓
Audit
  ↓
Attestation
```

The Core is successful only when this lifecycle works end-to-end.

---

# 4. Backend Ownership Boundary

## Person 3 OWNS

```text
Company / tenant
Agent registry
Agent Constitution
Capabilities
Policy lifecycle
Deterministic policy engine
Trajectory ingestion/state
Security orchestration
Transaction gate
Decision engine
Approval engine
Final execution authorization
Financial reservations/limits
Audit
Core APIs
Internal events
Service authentication
Idempotency
Concurrency
Core observability
Core integration tests
```

## Person 3 DOES NOT OWN

```text
Foundation-model training
Agent reasoning
Prompt-injection model training
Risk-model training
Anomaly-model training
Raw blockchain/RPC implementation
Private key storage
Smart-account internals
Raw transaction broadcast
```

---

# 5. Upstream AI/ML Completion Assumption

The existing AI/ML task plan ends with integration work including:

```text
Intent parsing
Agent Brain
Trajectory/evidence support
Policy AI
Security Intelligence
EIS/provenance
Evaluation
Broken-AI tests
Contract fidelity
AI/Core-facing adapters
```

Relevant completed/planned AI artifacts include:

```text
Orvex/ML/schemas/
Orvex/ML/security/
Orvex/ML/policy_ai/
Orvex/ML/agents/
Orvex/ML/trajectory/provenance components
Orvex/ML/tests/
```

The Backend team should integrate with these interfaces.

Do not move AI implementation into `Orvex/Backend/`.

---

# 6. Downstream Blockchain Assumption

Person 4 will implement:

```text
TransactionRequest handling
TransactionAnalysis
SimulationResult
Smart Account
x402
Base Sepolia
Execution
Receipt
Verification
Attestation
```

Until Person 4's real implementation is ready, Backend should use:

```text
typed adapter interfaces
deterministic mock implementations
fixture-based integration tests
```

Do not create fake blockchain behavior that pretends to be a real execution.

---

# 7. Shared Contract Rule

All phases below must use contracts from `CONTRACTS.md`.

Minimum shared objects:

```text
Intent
AgentConstitution
Policy
TrajectoryEvent
Evidence
ActionProposal
SecurityAssessment
TransactionIntent
TransactionRequest
TransactionAnalysis
PolicyEvaluation
SimulationResult
ApprovalRequest
ApprovalResult
Decision
ExecutionRequest
ExecutionResult
ReceiptVerification
AuditEvent
AttestationRecord
ThreatSignal
EpistemicIndependenceAssessment
Error
```

If a missing field is discovered:

```text
1. stop implementation of the affected interface;
2. update CONTRACTS.md;
3. update shared schema;
4. update contract fixtures/tests;
5. then continue.
```

Do not create an undocumented local schema.

---

# 8. Global Definition of Done for Every Phase

A phase is not complete until:

```text
[ ] implementation exists
[ ] types/schemas validate
[ ] unit tests pass
[ ] integration tests for the phase pass
[ ] error paths are covered
[ ] security invariants are tested
[ ] telemetry/correlation exists where applicable
[ ] docs/comments explain non-obvious authority boundaries
[ ] no secrets are committed
[ ] no unrelated refactors are introduced
```

For financial execution phases, additionally:

```text
[ ] idempotency tested
[ ] race condition tested where applicable
[ ] stale state tested
[ ] fail-closed behavior tested
```

---

# PHASE 0 — Repository Alignment and Baseline

## Objective

Prepare the Backend/Core work area without disturbing the completed AI/ML subsystem.

---

## Task 0.1 — Inspect existing repository

Kiro must inspect:

```text
repository root
Orvex/
AI/ML files
shared packages
existing configs
existing tests
existing docker files
existing package workspaces
```

Determine whether the backend physical root already exists.

Do not create duplicate roots.

---

## Task 0.2 — Establish Backend root

Create/reuse:

```text
Orvex/Backend/
```

Expected initial structure:

```text
Orvex/Backend/
├── api/
├── domain/
├── application/
├── policy/
├── trajectory/
├── security/
├── execution/
├── audit/
├── repositories/
├── workers/
├── db/
├── config/
├── shared/
└── tests/
```

---

## Task 0.3 — Backend README

Create:

```text
Orvex/Backend/README.md
```

Include:

```text
what Sentinel Core is
what it owns
what it consumes
what it does not own
how to run locally
how AI connects
how Blockchain connects
```

---

## Task 0.4 — Baseline test

Create a minimal backend test that proves:

```text
service package imports
shared configuration loads
test runner executes
```

### Exit Criteria

```text
[ ] Backend root established
[ ] No duplicate backend root
[ ] README created
[ ] test runner works
```

---

# PHASE 1 — Backend Foundation / Tooling

## Objective

Create a production-quality TypeScript backend foundation.

---

## Task 1.1 — Initialize package

Create:

```text
Orvex/Backend/package.json
Orvex/Backend/tsconfig.json
Orvex/Backend/vitest.config.ts
Orvex/Backend/.gitignore
Orvex/Backend/.env.example
```

Use the repository's existing package manager/workspace conventions.

Do not create a second independent package manager configuration if the monorepo already has one.

---

## Task 1.2 — Install core dependencies

Target:

```text
TypeScript
Node.js
Fastify
Zod
Prisma
PostgreSQL client
Redis
OpenTelemetry
OpenAPI support
Vitest
```

Optional test dependency:

```text
property-based testing library
```

---

## Task 1.3 — Configuration system

Create:

```text
config/
├── env.ts
├── schema.ts
└── index.ts
```

Configuration includes:

```text
ENVIRONMENT
PORT
DATABASE_URL
REDIS_URL
AI_SERVICE_URL
EXECUTION_SERVICE_URL
INTERNAL_SERVICE_TOKEN
OTEL_ENABLED
LOG_LEVEL
```

Sensitive values must not be printed.

---

## Task 1.4 — Structured logging

Create:

```text
shared/logging/
```

Requirements:

```text
JSON logs
correlation_id
trace_id
service
severity
event
```

Secret redaction must exist from the beginning.

---

## Task 1.5 — Correlation middleware

Create request context containing:

```text
request_id
correlation_id
company_id
actor_id
agent_id where applicable
```

Every Core operation must preserve correlation.

---

## Task 1.6 — Error taxonomy

Implement the shared error vocabulary from `CONTRACTS.md`:

```text
INVALID_INPUT
AUTHENTICATION_ERROR
AUTHORIZATION_ERROR
TENANT_ERROR
POLICY_VIOLATION
SECURITY_ASSESSMENT_INVALID
TRANSACTION_INVALID
SIMULATION_FAILED
APPROVAL_REQUIRED
APPROVAL_EXPIRED
APPROVAL_MISMATCH
EXECUTION_FAILED
EXECUTION_UNKNOWN
RECEIPT_MISMATCH
CONCURRENCY_CONFLICT
IDEMPOTENCY_CONFLICT
PROVIDER_ERROR
TIMEOUT
INTERNAL_ERROR
```

---

## Task 1.7 — Fastify app factory

Create:

```text
api/app.ts
```

Include:

```text
middleware
error handling
correlation
authentication hooks
route registration
OpenAPI
health routes
```

---

## Task 1.8 — Health / readiness

Create:

```text
GET /health
GET /ready
GET /version
```

Readiness checks:

```text
PostgreSQL
Redis
required service configuration
```

Do not make optional AI/reputation services block readiness unless configuration says they are required.

---

## Task 1.9 — OpenTelemetry

Create:

```text
shared/telemetry/
```

Trace:

```text
HTTP request
policy evaluation
decision
approval
execution gate
database queries where appropriate
```

No secret values in spans.

---

## Phase 1 tests

```text
test config validation
test secret redaction
test error envelope
test correlation propagation
test health
test readiness
test app startup
```

### Exit Criteria

```text
[ ] Backend starts locally
[ ] PostgreSQL connection works
[ ] Redis connection works
[ ] health/readiness work
[ ] tests pass
```

---

# PHASE 2 — Shared Schemas and Contract Integration

## Objective

Turn `CONTRACTS.md` into executable backend schemas.

This phase must happen before domain logic.

---

## Task 2.1 — Shared schema package/use

Implement or consume:

```text
Intent
AgentConstitution
Policy
TrajectoryEvent
Evidence
ActionProposal
SecurityAssessment
TransactionIntent
TransactionRequest
TransactionAnalysis
PolicyEvaluation
SimulationResult
ApprovalRequest
ApprovalResult
Decision
ExecutionRequest
ExecutionResult
ReceiptVerification
AuditEvent
AttestationRecord
```

Use Zod or the repository's canonical shared validation system.

---

## Task 2.2 — Contract fixtures

Create:

```text
tests/contracts/fixtures/
```

Add:

```text
valid intent
valid proposal
valid assessment
valid policy evaluation
valid decision
valid execution request
valid verification
```

and invalid fixtures.

---

## Task 2.3 — Contract round-trip tests

For each major schema:

```text
object
→ serialize
→ deserialize
→ validate
```

Expected:

```text
semantic equality
```

---

## Task 2.4 — Unknown-field behavior

Verify forward compatibility where required.

Consumers may ignore unknown fields.

Producers must not omit required fields.

---

## Task 2.5 — Authority-field tests

Ensure:

```text
SecurityAssessment
```

does NOT gain:

```text
authorized
execute
sign
```

fields.

Ensure AI outputs cannot represent direct authorization.

### Exit Criteria

```text
[ ] all core contracts validate
[ ] invalid fixtures reject
[ ] round-trip tests pass
[ ] no AI contract contains authority fields
```

---

# PHASE 3 — Company, Agent, Constitution, Capability

## Objective

Build the authoritative tenant and agent identity layer.

---

## Task 3.1 — Prisma schema foundation

Create database entities for:

```text
Company
Agent
Capability
Constitution
```

Use migrations.

---

## Task 3.2 — Company repository/service

Implement:

```text
createCompany
getCompany
updateCompanyStatus
```

Tenant isolation must be enforced.

---

## Task 3.3 — Agent registry

Implement:

```text
createAgent
getAgent
pauseAgent
resumeAgent
disableAgent
listAgents
```

Statuses:

```text
ACTIVE
PAUSED
SUSPENDED
DISABLED
```

---

## Task 3.4 — Constitution

Implement:

```text
createConstitution
validateConstitution
activateConstitution
getActiveConstitution
```

Do not mutate active versions in place.

---

## Task 3.5 — Capability Manager

Implement:

```text
createCapability
validateCapability
revokeCapability
expireCapability
getActiveCapabilities
```

Validate capability ⊆ Constitution.

---

## Task 3.6 — Capability delegation

Support a V1-safe representation for delegated capabilities.

Test:

```text
child authority <= parent authority
```

---

## Task 3.7 — Tenant isolation tests

Verify:

```text
Company A cannot read Company B
Company A cannot update Company B
Company A cannot execute against Company B
```

### Exit Criteria

```text
[ ] company registry works
[ ] agent lifecycle works
[ ] constitution works
[ ] capabilities work
[ ] delegated authority is bounded
[ ] tenant isolation tests pass
```

---

# PHASE 4 — Policy Lifecycle and Deterministic Policy Engine

## Objective

Build the authoritative policy system.

This is one of the most important phases.

---

## Task 4.1 — Policy domain

Create entities:

```text
Policy
PolicyVersion
PolicyRule
PolicyActivation
```

---

## Task 4.2 — Policy lifecycle

Implement:

```text
createDraft
validate
simulate
approve
activate
supersede
disable
```

State:

```text
DRAFT
VALIDATING
SIMULATED
APPROVED
ACTIVE
SUPERSEDED
DISABLED
```

---

## Task 4.3 — Rule engine core

Create:

```text
policy/engine/
policy/rules/
policy/evaluator/
```

---

## Task 4.4 — Amount rule

Implement:

```text
AMOUNT_LIMIT
```

Test:

```text
amount == limit → PASS
amount < limit → PASS
amount > limit → VIOLATION
```

---

## Task 4.5 — Cumulative rule

Implement:

```text
CUMULATIVE_LIMIT
```

Support:

```text
daily
weekly
monthly
recipient
category
asset
```

where configured.

---

## Task 4.6 — Recipient rules

Implement:

```text
RECIPIENT_ALLOWLIST
RECIPIENT_BLOCKLIST
NEW_RECIPIENT_APPROVAL
```

---

## Task 4.7 — Asset/network rules

Implement:

```text
ASSET_ALLOW
ASSET_BLOCK
NETWORK_ALLOW
NETWORK_BLOCK
```

---

## Task 4.8 — Time rules

Implement:

```text
TIME_WINDOW
```

Use UTC consistently.

---

## Task 4.9 — Human approval rule

Implement:

```text
HUMAN_APPROVAL
```

as a requirement rather than an immediate transaction rejection.

---

## Task 4.10 — Required predecessor

Implement trajectory-aware:

```text
REQUIRED_PREDECESSOR
```

Example:

```text
invoice_verified
must occur before
PAY
```

---

## Task 4.11 — No structuring

Implement:

```text
NO_STRUCTURING
```

using trajectory/financial state.

---

## Task 4.12 — Capability expiration

Policy must fail if required capability is expired.

---

## Task 4.13 — Policy evaluation output

Produce:

```text
PolicyEvaluation
```

with:

```text
policy_id
version
status
rules_checked
violations
trace context
timestamp
```

---

## Task 4.14 — Property tests

Examples:

```text
amount > maximum => ALLOW impossible
blocked recipient => ALLOW impossible
wrong network => ALLOW impossible
expired capability => execution impossible
```

### Exit Criteria

```text
[ ] policy lifecycle complete
[ ] all V1 rules implemented
[ ] policy evaluation deterministic
[ ] cumulative spending works
[ ] trajectory-dependent rules work
[ ] property tests pass
```

---

# PHASE 5 — Financial State, Reservations, Idempotency, Concurrency

## Objective

Build the accounting/state safety required before any execution authorization.

This phase should happen before real execution integration.

---

## Task 5.1 — Financial state model

Create state for:

```text
daily_spent
weekly_spent
monthly_spent
recipient_spent
category_spent
asset_spent
```

Also represent:

```text
reserved
committed
released
```

---

## Task 5.2 — Reservation lifecycle

Before an execution:

```text
reserve
```

After confirmed success:

```text
commit
```

After confirmed failure:

```text
release
```

For unknown execution:

```text
keep reservation
```

until reconciliation.

---

## Task 5.3 — Idempotency store

Create:

```text
idempotency_key
operation_type
operation_reference
status
created_at
```

---

## Task 5.4 — Idempotency middleware/service

For financial operations:

```text
same key
→ same logical operation
```

Test repeated requests.

---

## Task 5.5 — Concurrency control

Use PostgreSQL transactional locking or another explicit concurrency-safe mechanism.

Protect:

```text
daily budget
agent budget
company budget
recipient budget
capability budget
```

---

## Task 5.6 — Race-condition tests

Example:

```text
daily limit = $100
A = $70
B = $70
concurrent
```

Expected:

```text
only one can consume the remaining budget
```

### Exit Criteria

```text
[ ] reservations work
[ ] idempotency works
[ ] unknown execution preserves state
[ ] concurrent spending cannot exceed limits
[ ] race tests pass
```

---

# PHASE 6 — Trajectory Ingestion and Provenance State

## Objective

Build the authoritative Core-side trajectory.

AI already has trajectory/evidence structures; Core now becomes the authoritative durable owner.

---

## Task 6.1 — Trajectory trace entity

Create:

```text
TrajectoryTrace
```

fields:

```text
trace_id
company_id
agent_id
intent_id
status
created_at
```

---

## Task 6.2 — Trajectory event entity

Create:

```text
TrajectoryEvent
```

fields include:

```text
event_id
trace_id
sequence
event_type
timestamp
payload/reference
trust context
previous_event_hash
event_hash
```

---

## Task 6.3 — Redis stream ingestion

Create:

```text
workers/trajectory/
```

Consume:

```text
trajectory.events
```

---

## Task 6.4 — Ordering validation

Reject:

```text
duplicate sequence
wrong trace
missing correlation
invalid previous hash
```

according to the configured integrity mode.

---

## Task 6.5 — Append-only behavior

No endpoint should support arbitrary updates to historical trajectory events.

Corrections should be represented as new events if needed.

---

## Task 6.6 — Provenance references

Core should store references to:

```text
Evidence
external source
tool result
security assessment
```

without storing secrets/raw sensitive data unnecessarily.

---

## Task 6.7 — Trajectory queries

Implement:

```text
getTrace
getEvents
getTimeline
```

with tenant isolation.

### Exit Criteria

```text
[ ] trajectory ingestion works
[ ] ordering verified
[ ] hash chain works
[ ] Redis stream works
[ ] durable PostgreSQL state works
[ ] historical events immutable
```

---

# PHASE 7 — AI/ML Integration

## Objective

Connect the completed AI/ML subsystem to Sentinel Core.

Do not rebuild AI.

---

## Task 7.1 — AI service client

Create:

```text
application/clients/ai/
```

Support:

```text
createIntent
analyzeProposal
getSecurityAssessment
```

or the actual API contract produced by the AI subsystem.

---

## Task 7.2 — Internal authentication

Use the shared internal service mechanism.

Minimum:

```text
INTERNAL_SERVICE_TOKEN
```

or the project's authenticated service identity mechanism.

Never trust source hostname alone.

---

## Task 7.3 — Intent intake

Accept:

```text
Intent
```

and validate:

```text
schema
agent
company
expiration
status
```

---

## Task 7.4 — ActionProposal intake

Validate:

```text
proposal_id
intent_id
agent_id
trace_id
amount
recipient
asset
network
```

---

## Task 7.5 — SecurityAssessment intake

Validate:

```text
proposal reference
agent
timestamps
model metadata
evidence references
status vocabulary
```

---

## Task 7.6 — Staleness detection

Reject/flag:

```text
security assessment for old proposal
assessment for different agent
expired assessment
assessment with wrong trace
```

---

## Task 7.7 — AI failure behavior

If AI Security is required and unavailable:

```text
do not ALLOW
```

Default V1 behavior:

```text
REVIEW or DENY
```

according to explicit policy.

---

## Task 7.8 — Broken-AI integration test

Use the AI plan's `AlwaysAllowMockProvider` concept or an equivalent upstream fixture.

Make AI claim:

```text
LOW
NO THREAT
PASS
```

Then submit:

```text
blocked recipient
over-limit amount
wrong network
```

Core must still return:

```text
DENY
```

### Exit Criteria

```text
[ ] AI service integrated
[ ] authentication works
[ ] contract validation works
[ ] stale AI results rejected
[ ] broken-AI test passes
```

---

# PHASE 8 — Security Orchestrator

## Objective

Create the central application workflow that combines AI intelligence and deterministic checks.

---

## Task 8.1 — Orchestrator interface

Create:

```text
application/orchestrator/
```

Input:

```text
Intent
ActionProposal
SecurityAssessment
Trajectory
Policy
Capability
```

---

## Task 8.2 — Load authoritative state

The orchestrator loads:

```text
company
agent
constitution
active capability
active policy
current trajectory
```

---

## Task 8.3 — Evaluate security context

Consume:

```text
SecurityAssessment
```

without treating it as authority.

---

## Task 8.4 — Evaluate deterministic policy

Call:

```text
PolicyEngine.evaluate(...)
```

---

## Task 8.5 — Request transaction analysis

Call Person 4's adapter for:

```text
TransactionAnalysis
```

Do not implement blockchain logic here.

---

## Task 8.6 — Determine simulation requirement

Policy/platform configuration decides whether simulation is mandatory.

---

## Task 8.7 — Request simulation

Call:

```text
ExecutionClient.simulate(...)
```

and validate the response.

---

## Task 8.8 — Produce orchestration context

Build an internal decision context containing:

```text
intent
proposal
security
policy
transaction
simulation
capability
```

### Exit Criteria

```text
[ ] orchestrator can build full decision context
[ ] no AI authority leakage
[ ] transaction provider abstracted
[ ] simulation provider abstracted
```

---

# PHASE 9 — Transaction Gate and Execution Context

## Objective

Guarantee that the concrete transaction is exactly what was authorized.

---

## Task 9.1 — TransactionIntent

Normalize ActionProposal into:

```text
TransactionIntent
```

---

## Task 9.2 — Receive TransactionAnalysis

From Person 4:

```text
TransactionAnalysis
```

Validate:

```text
recipient
amount
asset
network
contract
function
```

---

## Task 9.3 — Proposal vs transaction comparison

Implement deterministic comparison:

```text
proposal.amount == actual.amount
proposal.recipient == actual.recipient
proposal.asset == actual.asset
proposal.network == actual.network
```

Any mismatch becomes a security error.

---

## Task 9.4 — Simulation binding

Validate:

```text
simulation.transaction_id
==
current.transaction_id
```

Material transaction mutation invalidates simulation.

---

## Task 9.5 — Simulation result handling

Rules:

```text
PASS → continue
REVERT → DENY
UNEXPECTED_STATE_CHANGE → REVIEW/DENY
ERROR → fail closed if mandatory
```

---

## Task 9.6 — Transaction gate tests

Cases:

```text
correct transaction
wrong recipient
wrong amount
wrong asset
wrong network
unexpected function
simulation mismatch
```

### Exit Criteria

```text
[ ] transaction gate works
[ ] exact transaction matching works
[ ] simulation binding works
[ ] mismatch tests pass
```

---

# PHASE 10 — Decision Engine

## Objective

Make Core authorization deterministic.

---

## Task 10.1 — DecisionEngine interface

Create:

```text
decision/engine.ts
```

Input:

```text
Intent
Constitution
Capability
PolicyEvaluation
SecurityAssessment
TransactionAnalysis
SimulationResult
ApprovalState
```

Output:

```text
Decision
```

---

## Task 10.2 — Precedence implementation

Implement:

```text
1. platform invariant
2. invalid capability
3. hard policy violation
4. invalid transaction
5. mandatory simulation failure
6. expired context
7. approval requirement
8. policy-defined risk review
9. ALLOW
```

---

## Task 10.3 — ALLOW

Only produce ALLOW when:

```text
no hard policy violation
valid capability
valid intent/context
transaction valid
simulation satisfied
approval requirements satisfied or not required
```

---

## Task 10.4 — REVIEW

Return REVIEW for:

```text
required human approval
policy-defined high-risk conditions
insufficient evidence where policy requires review
new recipient conditions
```

---

## Task 10.5 — DENY

Return DENY for:

```text
hard policy violation
blocked recipient
wrong chain
wrong asset
invalid transaction
mandatory simulation failure
expired authority
invalid context
```

---

## Task 10.6 — Decision hash

Create deterministic decision context hash from:

```text
intent hash
proposal hash
policy hash
security assessment hash
transaction hash
simulation hash
approval hash
```

---

## Task 10.7 — Decision tests

Must include:

```text
AI low risk + policy deny → DENY
AI high risk + review policy → REVIEW
AI low risk + new recipient approval → REVIEW
policy pass + simulation pass + no approval → ALLOW
simulation fail + human approval → not ALLOW
```

### Exit Criteria

```text
[ ] deterministic DecisionEngine exists
[ ] precedence tests pass
[ ] context hash works
[ ] AI cannot override policy
```

---

# PHASE 11 — Human Approval Engine

## Objective

Build secure approval and re-approval.

---

## Task 11.1 — Approval request model

Create:

```text
ApprovalRequest
```

with:

```text
approval_id
decision_id
transaction_id
purpose
amount
recipient
asset
network
policy_version
risk summary
simulation summary
expires_at
required_role
context_hash
```

---

## Task 11.2 — Approval creation

Create when:

```text
DecisionEngine = REVIEW
```

and policy requires human approval.

---

## Task 11.3 — Approval response

Support:

```text
APPROVED
DENIED
EXPIRED
CANCELLED
```

---

## Task 11.4 — Approver authorization

Verify:

```text
authenticated identity
required role
company membership
```

---

## Task 11.5 — Approval binding

On approval:

```text
current_context_hash == approval.context_hash
```

If false:

```text
APPROVAL_MISMATCH
```

---

## Task 11.6 — Approval expiration

Expired approvals are invalid.

---

## Task 11.7 — Approval mutation test

Approve:

```text
$5 → A
```

mutate to:

```text
$500 → B
```

Expected:

```text
old approval invalid
```

---

## Task 11.8 — Approval API

Implement:

```text
POST /v1/approvals
POST /v1/approvals/:id/approve
POST /v1/approvals/:id/deny
GET /v1/approvals/:id
```

### Exit Criteria

```text
[ ] approval flow works
[ ] role checks work
[ ] expiration works
[ ] context binding works
[ ] mutation tests pass
```

---

# PHASE 12 — Final Revalidation and Execution Gate

## Objective

Create the exact boundary that authorizes the Blockchain/Execution subsystem.

---

## Task 12.1 — Final revalidation service

Immediately before execution, check:

```text
agent ACTIVE
intent ACTIVE
capability ACTIVE
policy version ACTIVE
approval valid
transaction unchanged
simulation valid
chain correct
execution mode correct
financial budget available
idempotency unused
```

---

## Task 12.2 — ExecutionRequest

Construct:

```text
ExecutionRequest
```

with:

```text
execution_id
decision_id
transaction_id
company_id
agent_id
policy_version
authorization_context_hash
idempotency_key
executor
network
```

---

## Task 12.3 — Execution Client interface

Create:

```text
application/clients/execution/
```

Interface only:

```text
validateTransaction()
simulate()
execute()
getReceipt()
verify()
submitAttestation()
```

The actual implementation belongs to Person 4.

---

## Task 12.4 — No direct signer access

Verify Backend has no dependency that imports private key/signer internals from the Blockchain implementation.

---

## Task 12.5 — Execution gate tests

Tests:

```text
valid ExecutionRequest → sent
missing approval → blocked
stale policy → blocked
changed transaction → blocked
expired capability → blocked
wrong chain → blocked
duplicate idempotency key → deduplicated
```

### Exit Criteria

```text
[ ] final revalidation exists
[ ] ExecutionRequest is signed logically/bound by context
[ ] Backend has no direct signer
[ ] execution gate is tested
```

---

# PHASE 13 — Execution Result, Reconciliation, Verification

## Objective

Consume the real execution result safely.

---

## Task 13.1 — ExecutionResult intake

Support:

```text
SUBMITTED
CONFIRMED
FAILED
UNKNOWN
```

---

## Task 13.2 — Execution state machine

Implement:

```text
NOT_STARTED
READY
SUBMITTED
CONFIRMED
FAILED
UNKNOWN
```

---

## Task 13.3 — Unknown execution reconciliation

If:

```text
UNKNOWN
```

then:

```text
no automatic retry
keep reservation
reconcile receipt
```

---

## Task 13.4 — ReceiptVerification intake

Receive:

```text
ReceiptVerification
```

Validate:

```text
execution_id
transaction_id
actual recipient
actual amount
actual asset
actual network
```

---

## Task 13.5 — Expected vs actual

Compare:

```text
authorized
VS
submitted
VS
actual
```

Mismatch:

```text
VERIFICATION_FAILED
```

---

## Task 13.6 — Financial state commit

Only after verified success:

```text
reservation → committed
```

On confirmed failure:

```text
reservation → released
```

Unknown:

```text
reservation stays
```

---

## Task 13.7 — Receipt verification tests

Cases:

```text
exact match
wrong recipient
wrong amount
wrong asset
wrong chain
failed receipt
unknown receipt
```

### Exit Criteria

```text
[ ] execution lifecycle works
[ ] unknown state handled safely
[ ] receipt verified
[ ] spending state updates correctly
```

---

# PHASE 14 — Audit and Attestation

## Objective

Make every financial decision reconstructable.

---

## Task 14.1 — Audit event persistence

Create:

```text
AuditEvent
```

and persist lifecycle events.

---

## Task 14.2 — Audit timeline

Implement:

```text
GET /v1/audit/transactions/:id
GET /v1/audit/agents/:id
GET /v1/audit/traces/:id
```

---

## Task 14.3 — Audit integrity

Store:

```text
previous_hash
event_hash
```

and preserve append-only semantics.

---

## Task 14.4 — Decision context record

Persist:

```text
intent_hash
proposal_hash
policy_hash
security_assessment_hash
transaction_hash
simulation_hash
approval_hash
decision_hash
```

---

## Task 14.5 — Attestation payload

Build logical attestation:

```text
trace_merkle_root
policy_hash
decision
transaction_hash
timestamp
agent_id
```

---

## Task 14.6 — Attestation adapter

Call Person 4's blockchain adapter.

Possible states:

```text
PENDING
SUBMITTED
CONFIRMED
FAILED
```

Attestation failure must not rewrite payment execution state.

---

## Task 14.7 — Forensic reconstruction test

Given an execution ID, retrieve:

```text
intent
proposal
trajectory
security
policy
transaction
simulation
approval
decision
execution
verification
attestation
```

### Exit Criteria

```text
[ ] audit is complete
[ ] historical decision reconstructable
[ ] attestation integrated
[ ] attestation failure isolated from payment truth
```

---

# PHASE 15 — Dashboard / Human-Facing Core APIs

## Objective

Provide backend read APIs for the dashboard/demo.

---

## Task 15.1 — Agent status

```text
GET /v1/agents
GET /v1/agents/:id
```

---

## Task 15.2 — Policy status

```text
GET /v1/policies
GET /v1/policies/:id
GET /v1/policies/:id/versions
```

---

## Task 15.3 — Approval queue

```text
GET /v1/approvals?status=PENDING
```

---

## Task 15.4 — Live security/trajectory

Use:

```text
SSE
```

or repository-standard real-time mechanism.

Stream:

```text
trajectory
security alert
policy violation
decision
execution state
```

---

## Task 15.5 — Audit viewer data

Expose timeline-ready structures.

### Exit Criteria

```text
[ ] dashboard can render agent state
[ ] dashboard can render policies
[ ] dashboard can render approval queue
[ ] dashboard can render live trajectory
[ ] dashboard can render audit timeline
```

---

# PHASE 16 — Full SDK Integration

## Objective

Expose Sentinel Core through the stable SDK boundary.

---

## Task 16.1 — SDK client mapping

Map public SDK operations to Core:

```text
agents
intent
policies
security
trajectory
simulate
approvals
execute
verify
audit
attestations
```

---

## Task 16.2 — Existing-agent flow

Support:

```text
existing customer agent
→ ActionProposal
→ sentinel.evaluate()
```

without requiring SentinelPay to own the agent.

---

## Task 16.3 — Full-run flow

Support:

```text
sentinel.run({
  intent
})
```

which orchestrates:

```text
Intent
→ Agent integration
→ Security
→ Policy
→ Transaction
→ Simulation
→ Approval
→ Execution
→ Verification
→ Audit
```

---

## Task 16.4 — SDK error mapping

Map Core errors into stable SDK errors.

Do not expose internal database/provider details directly.

### Exit Criteria

```text
[ ] TypeScript SDK can use Core
[ ] Python SDK compatibility plan respected
[ ] existing-agent path works
[ ] full-run path works
```

---

# PHASE 17 — Security / Red-Team Integration

## Objective

Prove that the Core remains authoritative under adversarial conditions.

---

## Task 17.1 — Broken AI

AI returns:

```text
LOW RISK
NO THREAT
ALLOW-CANDIDATE
```

for all inputs.

Core must still block:

```text
blocked recipient
over-limit amount
wrong network
```

---

## Task 17.2 — Broken Tool

Tool returns:

```text
authorized=true
```

Core must ignore the claim.

---

## Task 17.3 — Broken Reputation

Reputation says:

```text
score=1
```

Core still obeys:

```text
recipient policy
asset/network rules
capability
```

---

## Task 17.4 — Memory poisoning

Agent memory claims:

```text
daily limit = $10,000
```

while Core policy says:

```text
$100
```

Core must use:

```text
$100
```

---

## Task 17.5 — Approval mutation

Verify:

```text
approval for A
```

cannot authorize:

```text
B
```

---

## Task 17.6 — Replay

Send identical execution request many times.

Expected:

```text
one logical execution
```

---

## Task 17.7 — Race

Run simultaneous transactions that collectively exceed a spending limit.

Expected:

```text
limit preserved
```

---

## Task 17.8 — Wrong chain

Authorized:

```text
Base Sepolia
```

Attempt:

```text
Base mainnet
```

Expected:

```text
blocked
```

---

## Task 17.9 — Simulation mismatch

Simulation A, execution candidate B.

Expected:

```text
B must be re-simulated
```

---

## Task 17.10 — Receipt mismatch

Expected result:

```text
$5 → A
```

Actual:

```text
$5 → B
```

Expected:

```text
verification failure
```

### Exit Criteria

```text
[ ] all critical attack tests pass
[ ] unauthorized financial execution = 0 in test suite
```

---

# PHASE 18 — Integration With Real Blockchain/Execution

## Objective

Replace mocks with Person 4's actual implementation.

This phase should begin only after the Core is stable.

---

## Task 18.1 — Connect Base Sepolia

Use the execution service's chain adapter.

Core remains network-agnostic.

---

## Task 18.2 — Real simulation

Use Person 4's deterministic simulator.

---

## Task 18.3 — Real x402

Integrate:

```text
x402
USDC
Base Sepolia
```

through the execution adapter.

---

## Task 18.4 — Real smart-account execution

Core produces:

```text
ExecutionRequest
```

Person 4 performs actual execution.

---

## Task 18.5 — Real receipt verification

Verify:

```text
recipient
amount
asset
network
transaction status
```

---

## Task 18.6 — Real attestation

Write:

```text
attestation
```

on testnet.

---

# PHASE 19 — End-to-End Vertical Slices

## Objective

Prove the complete product.

---

## Slice 1 — Legitimate Payment

```text
Human
 ↓
Intent
 ↓
Agent
 ↓
ActionProposal
 ↓
SecurityAssessment
 ↓
Policy PASS
 ↓
Transaction Analysis
 ↓
Simulation PASS
 ↓
Decision ALLOW
 ↓
Execution
 ↓
Verification
 ↓
Audit
```

---

## Slice 2 — Human Review

```text
new recipient
 ↓
policy REVIEW
 ↓
approval
 ↓
revalidation
 ↓
execution
```

---

## Slice 3 — Attack

```text
prompt injection
 ↓
recipient redirection
 ↓
SecurityAssessment HIGH
 ↓
Policy violation
 ↓
DENY
 ↓
NO ExecutionRequest
```

---

## Slice 4 — Transaction Structuring

```text
$40
$40
$40
daily limit = $100
 ↓
third request DENY
```

---

## Slice 5 — Mutation

```text
approved A
 ↓
transaction changes B
 ↓
approval invalid
 ↓
no execution
```

---

## Slice 6 — Unknown Execution

```text
broadcast
 ↓
timeout
 ↓
UNKNOWN
 ↓
reconciliation
 ↓
receipt
 ↓
verification
```

---

# PHASE 20 — Production-Quality Hardening

## Objective

Before calling Person 3 complete, harden the Core.

---

## Task 20.1 — Load tests

Test:

```text
trajectory ingestion
policy evaluation
read APIs
approval APIs
decision path
```

Do not stress real payment broadcasting with unsafe load tests.

---

## Task 20.2 — Concurrency load

Test:

```text
100 concurrent requests
against a shared budget
```

Verify:

```text
budget never exceeded
```

---

## Task 20.3 — Failure injection

Inject:

```text
PostgreSQL timeout
Redis outage
AI outage
Execution service outage
simulation outage
```

Verify correct fail-closed behavior.

---

## Task 20.4 — Security audit

Check:

```text
authentication
authorization
tenant isolation
secret logging
input validation
rate limits
CORS
OpenAPI exposure
```

---

## Task 20.5 — Dependency audit

Review:

```text
package vulnerabilities
locked versions
unused dependencies
```

---

# PHASE 21 — Final Acceptance

Person 3 is complete only when the following are true.

## Functional

```text
[ ] company management
[ ] agent registry
[ ] Constitution
[ ] capabilities
[ ] policy lifecycle
[ ] policy engine
[ ] trajectory
[ ] AI integration
[ ] security orchestration
[ ] transaction gate
[ ] decision engine
[ ] approval
[ ] execution gate
[ ] financial state
[ ] execution intake
[ ] verification
[ ] audit
[ ] attestation
[ ] SDK integration
```

---

## Security

```text
[ ] AI cannot directly execute
[ ] tool output cannot authorize
[ ] memory cannot override policy
[ ] reputation cannot override hard policy
[ ] risk cannot bypass deterministic policy
[ ] blocked recipient cannot execute
[ ] wrong chain cannot execute
[ ] over-limit cannot execute
[ ] expired approval cannot execute
[ ] mutated approval cannot execute
[ ] simulation mismatch cannot execute
[ ] duplicate execution prevented
[ ] unknown execution not blindly retried
[ ] receipt mismatch detected
```

---

## Operational

```text
[ ] structured logs
[ ] traces
[ ] health checks
[ ] readiness
[ ] metrics
[ ] correlation
[ ] alerting hooks
[ ] graceful shutdown
```

---

# 22. Phase Dependency Graph

The phases should follow this dependency structure:

```text
PHASE 0
  ↓
PHASE 1
  ↓
PHASE 2
  ↓
PHASE 3
  ↓
PHASE 4
  ↓
PHASE 5
  ↓
PHASE 6
  ↓
PHASE 7
  ↓
PHASE 8
  ↓
PHASE 9
  ↓
PHASE 10
  ↓
PHASE 11
  ↓
PHASE 12
  ↓
PHASE 13
  ↓
PHASE 14
  ↓
PHASE 15
  ↓
PHASE 16
  ↓
PHASE 17
  ↓
PHASE 18
  ↓
PHASE 19
  ↓
PHASE 20
  ↓
PHASE 21
```

Some activities may be developed in parallel after their contracts are stable.

Safe parallel work:

```text
Phase 3 domain models
+
Phase 6 trajectory schema tests

Phase 4 policy rules
+
Phase 15 dashboard read models

Phase 12 execution gate
+
Phase 14 audit
```

But final integration remains ordered.

---

# 23. What Can Be Mocked During Development

Until Person 4 is ready, mock:

```text
TransactionAnalysis
SimulationResult
ExecutionResult
ReceiptVerification
AttestationResult
```

Until AI service integration is available, mock:

```text
Intent
ActionProposal
SecurityAssessment
```

Use fixtures.

Never label a mock as a real blockchain result.

---

# 24. Mock Adapter Requirements

Mocks must be:

```text
deterministic
explicitly named
test-only or dev-only
unable to access real funds
```

Example:

```text
MockExecutionAdapter
```

must never broadcast transactions.

---

# 25. Kiro Task Execution Rules

When Kiro implements each checkbox:

```text
1. read the relevant PRD section
2. inspect existing files
3. reuse existing abstractions
4. implement smallest coherent change
5. add/update tests
6. run tests
7. report changed files
8. mark task complete
```

Never mark a task complete based on compilation alone.

---

# 26. Kiro Must Check Before Creating a File

Before creating any file:

```text
Does this already exist?

Does AI/ML already own this?

Does SDK already own this?

Does Blockchain already own this?

Is this contract already defined?
```

If yes:

```text
reuse/adapt
```

rather than creating a parallel abstraction.

---

# 27. Kiro Must Not Duplicate AI/ML

Do not create:

```text
Backend prompt-injection model
Backend risk model
Backend anomaly model
Backend intent LLM
```

The Backend may implement deterministic prechecks and orchestration.

Security intelligence belongs upstream.

---

# 28. Kiro Must Not Duplicate Blockchain

Do not create a second:

```text
wallet
RPC layer
smart account
transaction builder
simulator
x402 client
```

inside Core.

Core uses an execution adapter.

---

# 29. Kiro Must Not Put Business Logic in Routes

Bad:

```text
POST /evaluate
 → 300 lines of policy checks
```

Correct:

```text
route
 ↓
application service
 ↓
domain service
 ↓
policy engine
 ↓
decision engine
```

---

# 30. Kiro Must Preserve Determinism

These components must be deterministic:

```text
Policy Engine
Decision Engine
Capability validation
Approval validation
Transaction comparison
Execution context binding
Idempotency
Financial state accounting
```

No LLM calls should appear inside them.

---

# 31. Kiro Must Preserve Fail-Closed Semantics

Never change:

```text
missing security data
→ ALLOW
```

or:

```text
provider error
→ pretend success
```

or:

```text
unknown execution
→ retry automatically
```

without an explicit documented safety rule.

---

# 32. Kiro Must Preserve Financial Precision

Do not use floating-point arithmetic for authorization.

Use:

```text
decimal strings
integer minor units
or exact decimal library
```

and preserve the shared contract semantics.

---

# 33. Kiro Must Preserve Versioning

Do not mutate:

```text
active policy
historical decision
approved transaction
historical audit
```

in place.

Create new versions/events.

---

# 34. Kiro Must Preserve Auditability

Every security-relevant state change should emit an auditable event.

At minimum:

```text
policy activation
capability change
approval
decision
execution
verification
agent pause/resume
```

---

# 35. Kiro Must Preserve Correlation

Every end-to-end request must be traceable.

At minimum:

```text
correlation_id
intent_id
proposal_id
decision_id
transaction_id
execution_id
```

---

# 36. Backend Implementation Checklist

Use this as the actual working checklist.

## Foundation

```text
[ ] Phase 0
[ ] Phase 1
[ ] Phase 2
```

## Authority

```text
[ ] Phase 3
[ ] Phase 4
[ ] Phase 5
```

## Context

```text
[ ] Phase 6
[ ] Phase 7
[ ] Phase 8
```

## Transaction Security

```text
[ ] Phase 9
[ ] Phase 10
[ ] Phase 11
[ ] Phase 12
```

## Post-Execution

```text
[ ] Phase 13
[ ] Phase 14
```

## Product Integration

```text
[ ] Phase 15
[ ] Phase 16
```

## Security Proof

```text
[ ] Phase 17
```

## Real Execution

```text
[ ] Phase 18
```

## End-to-End

```text
[ ] Phase 19
```

## Hardening

```text
[ ] Phase 20
[ ] Phase 21
```

---

# 37. Final V1 Vertical Slice

The final required flow is:

```text
                HUMAN
                  │
                  ▼
                INTENT
                  │
                  ▼
             AGENT BRAIN
                  │
                  ▼
           ACTION PROPOSAL
                  │
                  ▼
        ┌─────────────────────┐
        │    SENTINEL CORE    │
        │                     │
        │ Intent Validation   │
        │ Capability         │
        │ Policy             │
        │ Security Intel     │
        │ Trajectory         │
        │ Transaction Gate   │
        │ Simulation Gate    │
        │ Decision Engine    │
        └──────────┬──────────┘
                   │
           ┌───────┼────────┐
           ▼       ▼        ▼
         DENY    REVIEW    ALLOW
                   │        │
                   ▼        │
                APPROVAL    │
                   │        │
                   └───┬────┘
                       ▼
                FINAL REVALIDATION
                       │
                       ▼
                EXECUTION REQUEST
                       │
                       ▼
                 BLOCKCHAIN / x402
                       │
                       ▼
                 EXECUTION RESULT
                       │
                       ▼
                RECEIPT VERIFICATION
                       │
                       ▼
                    AUDIT
                       │
                       ▼
                  ATTESTATION
```

---

# 38. Final Backend Principle

The Backend/Core is intentionally the most deterministic part of SentinelPay.

The AI can:

```text
reason
plan
research
detect
score
recommend
```

The Blockchain layer can:

```text
build
simulate
sign
broadcast
verify
```

But the Backend/Core must:

```text
validate
constrain
authorize
coordinate
record
```

The defining rule is:

> **The Core does not decide what the AI thinks. The Core decides what the AI is allowed to cause.**
