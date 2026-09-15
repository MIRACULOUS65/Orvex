# SentinelPay — BACKEND_DATABASE.md

## Backend / Sentinel Core Database Architecture and Data Model

**Document Type:** Database Architecture Specification  
**Product:** SentinelPay SDK  
**Subsystem:** Sentinel Core / Backend / Policy / Orchestration  
**Version:** V1.0  
**Status:** Canonical Backend Database Specification  
**Audience:** Backend/Core, AI/ML, Blockchain/Execution, SDK, Dashboard, Kiro

---

# 1. Purpose

This document defines the persistence model for SentinelPay Backend/Core.

The database is responsible for storing the authoritative off-chain state required to:

```text
identify companies and agents
manage authority
store active policies and historical versions
track intents and proposals
preserve trajectory state
store security assessments and references
track transaction context
store decisions
manage human approvals
track financial reservations
track execution state
verify receipts
maintain audit history
coordinate attestations
```

The central database principle is:

> **PostgreSQL is the durable source of truth for Sentinel Core application state. Redis is an event/coordination system, not the permanent authority for financial state.**

---

# 2. Database Technology

V1 target:

```text
Database:
PostgreSQL

ORM:
Prisma

Event / short-lived coordination:
Redis / Redis Streams

Runtime:
Node.js + TypeScript
```

The database must support:

```text
transactions
foreign keys
unique constraints
row-level locking
indexes
JSON/JSONB where appropriate
timestamps
immutable version history
```

---

# 3. Database Responsibilities

PostgreSQL owns durable state for:

```text
Company
Agent
Capability
Constitution
Policy
PolicyVersion
PolicyRule

Intent
ActionProposal

TrajectoryTrace
TrajectoryEvent

SecurityAssessment
EvidenceReference

TransactionIntent
TransactionRequest
TransactionAnalysis
SimulationResult

Decision
ApprovalRequest
ApprovalResult

ExecutionRequest
ExecutionResult
ReceiptVerification

FinancialAccountState
FinancialReservation
FinancialCommit

AuditEvent
AttestationRecord

IdempotencyRecord
```

---

# 4. Data Ownership Principle

Each important object has one authoritative owner.

```text
Company
→ Core

Agent
→ Core

Policy
→ Core

Decision
→ Core

Financial reservation
→ Core

Execution result
→ Execution service, persisted/reconciled by Core

Receipt verification
→ Execution service, consumed/persisted by Core

On-chain transaction
→ Blockchain

Attestation commitment
→ Blockchain registry
```

Do not create duplicate competing sources of truth.

---

# 5. High-Level Entity Relationship

```text
Company
 │
 ├── Agents
 │    │
 │    ├── Capabilities
 │    ├── Constitutions
 │    ├── Policies
 │    └── Intents
 │
 ├── Audit Events
 └── Financial State
       │
       └── Reservations / Commits

Agent
 │
 ├── Intents
 │     │
 │     └── Action Proposals
 │            │
 │            ├── Trajectory
 │            ├── Security Assessment
 │            └── Transaction
 │                    │
 │                    ├── Analysis
 │                    └── Simulation
 │
 └── Decisions
       │
       ├── Approvals
       └── Execution Requests
               │
               ├── Execution Results
               └── Receipt Verification
                         │
                         └── Attestation
```

---

# 6. Tenant / Company Model

## `companies`

Purpose:

```text
root tenant boundary
```

Recommended fields:

```text
id
name
status
created_at
updated_at
```

Status:

```text
ACTIVE
SUSPENDED
DISABLED
```

---

# 7. `agents`

Each agent belongs to exactly one company.

Fields:

```text
id
company_id
name
purpose
status
execution_mode
active_constitution_id
active_policy_id
created_at
updated_at
```

Status:

```text
CREATED
CONFIGURED
ACTIVE
PAUSED
SUSPENDED
DISABLED
```

Execution modes:

```text
SIMULATE
REVIEW_ONLY
TESTNET
AUTONOMOUS
```

---

# 8. Agent Constraints

Database must enforce:

```text
agent.company_id → valid company
agent.active_policy_id → valid policy owned by same company
agent.active_constitution_id → valid constitution owned by same company
```

Application logic additionally checks that active policy and constitution are compatible with the agent.

---

# 9. `constitutions`

A Constitution is a versioned authority definition.

Fields:

```text
id
company_id
agent_id
version
status
purpose
configuration_json
hash
created_by
created_at
activated_at
deactivated_at
```

Status:

```text
DRAFT
VALIDATING
APPROVED
ACTIVE
SUPERSEDED
DISABLED
```

---

# 10. Constitution Versioning

Active Constitution versions are immutable.

A change creates:

```text
new version
```

rather than mutating the old one.

Historical decisions continue to reference the version used when they were made.

---

# 11. `capabilities`

Capabilities are scoped authorization envelopes.

Fields:

```text
id
company_id
agent_id
parent_capability_id nullable
action
asset
network
category_scope_json
recipient_scope_json
single_transaction_limit
daily_limit
weekly_limit
monthly_limit
valid_from
expires_at
status
created_by
created_at
revoked_at
```

Status:

```text
ACTIVE
EXPIRED
REVOKED
```

---

# 12. Capability Hierarchy

A delegated capability may reference:

```text
parent_capability_id
```

The child capability must not expand:

```text
amount
asset
network
category
recipient
time
action
```

beyond the parent.

This containment rule is enforced by application logic and tested.

---

# 13. `policies`

Stores logical policy identity.

Fields:

```text
id
company_id
agent_id
name
description
current_version
status
created_by
created_at
updated_at
```

Status:

```text
DRAFT
ACTIVE
DISABLED
```

Historical semantics belong to `policy_versions`.

---

# 14. `policy_versions`

Each immutable policy version contains the actual compiled rule set.

Fields:

```text
id
policy_id
version
status
compiled_policy_json
hash
source_type
source_reference
created_at
activated_at
deactivated_at
approved_by
```

Status:

```text
DRAFT
VALIDATING
SIMULATED
APPROVED
ACTIVE
SUPERSEDED
DISABLED
```

`compiled_policy_json` represents the deterministic rule model consumed by the Policy Engine.

---

# 15. `policy_rules`

A normalized table may be used for queryability/testing.

Fields:

```text
id
policy_version_id
rule_id
rule_type
priority
configuration_json
enabled
created_at
```

V1 may keep the source of truth in structured JSON if implementation simplicity is preferred, but the rule identity must remain stable and queryable.

---

# 16. Policy Immutability

Once a policy version becomes:

```text
ACTIVE
```

its rule meaning must not be mutated.

To change:

```text
create new policy version
```

Do not update the active row in place.

---

# 17. `intents`

Stores user goals represented by the AI Intent layer.

Fields:

```text
id
company_id
agent_id
schema_version
user_goal
purpose
desired_outcome
constraints_json
budget_json
authorized_actions_json
forbidden_actions_json
autonomy_level
valid_from
valid_until
status
confidence
created_at
updated_at
```

Status:

```text
VALID
NEEDS_CLARIFICATION
EXPIRED
CANCELLED
COMPLETED
```

---

# 18. Intent Lifecycle

```text
CREATED
   ↓
VALID
   ↓
ACTIVE
   │
   ├── NEEDS_CLARIFICATION
   ├── CANCELLED
   ├── EXPIRED
   └── COMPLETED
```

The Core should not keep an expired Intent executable.

---

# 19. `action_proposals`

Stores agent-proposed actions.

Fields:

```text
id
company_id
agent_id
intent_id
trace_id
schema_version
action_type
purpose
recipient_json
amount_json
payment_method
network
reason
evidence_refs_json
trajectory_event_refs_json
status
created_at
```

Status:

```text
RECEIVED
VALIDATING
EVALUATING
APPROVED_CANDIDATE
REVIEW_REQUIRED
DENIED
COMPLETED
```

---

# 20. Proposal Binding

Foreign keys:

```text
company_id
agent_id
intent_id
trace_id
```

Application validation verifies:

```text
proposal.company == intent.company
proposal.agent == intent.agent
proposal.trace == current trajectory
```

---

# 21. `trajectory_traces`

Represents one logical agent execution/trajectory.

Fields:

```text
id
company_id
agent_id
intent_id nullable
trace_hash
status
sequence_head
created_at
completed_at
```

Status:

```text
ACTIVE
COMPLETED
ABORTED
CORRUPTED
```

---

# 22. `trajectory_events`

Represents append-only observable events.

Fields:

```text
id
trace_id
company_id
agent_id
sequence
event_type
timestamp
payload_json
source_ref
trust_context_json
previous_event_hash
event_hash
created_at
```

Unique constraints:

```text
(trace_id, sequence)
```

Potential uniqueness:

```text
event_hash
```

where appropriate.

---

# 23. Trajectory Ordering

The database must preserve:

```text
trace_id
+
sequence
```

ordering.

An event with duplicate sequence must not overwrite the existing event.

---

# 24. Trajectory Append-Only Rule

Do not expose arbitrary update/delete APIs for historical trajectory events.

If an event needs correction:

```text
append corrective event
```

rather than rewriting history.

---

# 25. `security_assessments`

Stores the AI-generated SecurityAssessment from Person 2.

Fields:

```text
id
company_id
agent_id
proposal_id
trace_id
schema_version
intent_verification_json
threat_assessment_json
reputation_assessment_json
risk_assessment_json
anomaly_assessment_json
overall_assessment_json
evidence_refs_json
model_metadata_json
assessment_hash
created_at
```

The database treats these as intelligence, not authorization.

---

# 26. Security Assessment Versioning

A proposal may receive more than one assessment if the underlying context changes.

Do not overwrite historical assessments.

Instead:

```text
new assessment row
```

and link the decision to the exact assessment used.

---

# 27. `evidence_references`

Core may store references rather than raw evidence.

Fields:

```text
id
company_id
assessment_id
evidence_id
source_type
source_ref
content_hash
trust_level
created_at
```

Avoid storing raw secrets or unnecessary sensitive content.

---

# 28. `transaction_intents`

Represents the normalized financial action before a concrete chain transaction.

Fields:

```text
id
company_id
agent_id
proposal_id
action_type
payment_method
asset_json
recipient_json
amount_json
network
constraints_json
created_at
```

This is a normalized business/authorization object, not raw blockchain calldata.

---

# 29. `transaction_requests`

Represents the concrete transaction candidate.

Fields:

```text
id
company_id
agent_id
proposal_id
transaction_intent_id
network
from_address
to_address
value
data
asset_json
amount_json
payload_hash
status
created_at
```

Status:

```text
CREATED
VALID
INVALID
STALE
SUPERSEDED
```

---

# 30. Transaction Versioning

A material transaction mutation creates a new transaction request or version.

Preferred V1 approach:

```text
new transaction_request row
```

rather than mutating an executed/stored transaction in place.

---

# 31. `transaction_analyses`

Stores normalized analysis returned by Execution.

Fields:

```text
id
transaction_request_id
contract_address
contract_verified
function_name
function_selector
decoded_arguments_json
recipient
amount_json
asset_json
network
expected_state_changes_json
risk_flags_json
status
provider_metadata_json
created_at
```

---

# 32. `simulation_results`

Stores deterministic simulation output.

Fields:

```text
id
transaction_request_id
status
would_revert
gas_estimate_json
expected_state_changes_json
unexpected_state_changes_json
revert_reason
simulator_metadata_json
simulation_hash
created_at
```

Statuses:

```text
PASS
REVERT
UNEXPECTED_STATE_CHANGE
INSUFFICIENT_FUNDS
UNSUPPORTED
ERROR
STALE
```

---

# 33. Simulation Binding

A simulation is valid only for the exact transaction state it evaluated.

Store:

```text
transaction_request_id
transaction payload hash
simulation hash
```

If transaction payload hash changes:

```text
simulation becomes stale
```

---

# 34. `policy_evaluations`

Stores deterministic policy results.

Fields:

```text
id
company_id
agent_id
policy_id
policy_version_id
proposal_id
transaction_request_id nullable
status
rules_checked_json
violations_json
trajectory_context_json
evaluation_hash
created_at
```

Status:

```text
PASS
VIOLATION
ERROR
INSUFFICIENT_CONTEXT
```

---

# 35. `decisions`

Stores the authoritative Core decision.

Fields:

```text
id
company_id
agent_id
intent_id
proposal_id
policy_id
policy_version_id
security_assessment_id
transaction_request_id
simulation_result_id nullable
approval_request_id nullable
result
reasons_json
decision_context_hash
version
status
created_at
```

Result:

```text
ALLOW
REVIEW
DENY
```

---

# 36. Decision Immutability

A final decision should be append-only/versioned.

If a new evaluation is required because context changed:

```text
new decision
```

Do not silently rewrite the original decision.

Historical decisions remain auditable.

---

# 37. `approval_requests`

Fields:

```text
id
company_id
agent_id
decision_id
transaction_request_id
required_role
summary_json
context_hash
status
expires_at
created_at
```

Status:

```text
PENDING
APPROVED
DENIED
EXPIRED
CANCELLED
```

---

# 38. `approval_results`

Fields:

```text
id
approval_request_id
decision_id
approver_id
result
context_hash
created_at
```

Result:

```text
APPROVED
DENIED
EXPIRED
```

The approval context hash must match the currently authorized context.

---

# 39. `execution_requests`

Stores Core-created execution authorization requests.

Fields:

```text
id
company_id
agent_id
decision_id
transaction_request_id
policy_version_id
authorization_context_hash
idempotency_key
executor_type
network
status
created_at
authorized_at
```

Status:

```text
CREATED
AUTHORIZED
SUBMITTED
CONFIRMED
FAILED
UNKNOWN
CANCELLED
```

---

# 40. `execution_results`

Stores results returned from the Execution subsystem.

Fields:

```text
id
execution_request_id
transaction_hash
status
chain
submitted_at
confirmed_at
raw_reference
provider_metadata_json
created_at
```

Status:

```text
SUBMITTED
CONFIRMED
FAILED
UNKNOWN
```

Do not store sensitive signer information.

---

# 41. `receipt_verifications`

Stores independent verification results.

Fields:

```text
id
execution_request_id
verified
expected_json
actual_json
discrepancies_json
transaction_hash
verified_at
provider_metadata_json
```

---

# 42. Verification States

Recommended:

```text
PENDING
VERIFIED
MISMATCH
FAILED
UNKNOWN
```

---

# 43. `financial_accounts`

Represents logical spending state owned by Core.

Fields:

```text
id
company_id
agent_id
account_scope
asset
network
current_reserved
current_committed
updated_at
```

Scope may be:

```text
AGENT
COMPANY
CATEGORY
RECIPIENT
```

V1 may use a smaller set and expand later.

---

# 44. `financial_reservations`

Represents temporary budget reservations.

Fields:

```text
id
company_id
agent_id
execution_request_id
financial_account_id
amount
asset
status
created_at
released_at
committed_at
```

Status:

```text
RESERVED
COMMITTED
RELEASED
UNKNOWN
```

---

# 45. Reservation Lifecycle

```text
Decision/Execution Ready
       ↓
RESERVE
       │
       ├── execution confirmed → COMMITTED
       │
       ├── execution failed → RELEASED
       │
       └── execution unknown → UNKNOWN/HELD
```

---

# 46. Atomic Budget Reservation

Budget reservation must happen inside an appropriate database transaction.

Example:

```text
SELECT current spending
LOCK relevant financial state
check remaining limit
insert reservation
update reserved total
COMMIT
```

Two concurrent requests must not both consume the same remaining budget.

---

# 47. Financial Commit

After verified successful execution:

```text
reserved -= amount
committed += amount
```

After confirmed failed execution:

```text
reserved -= amount
```

Unknown:

```text
reservation remains until reconciled
```

---

# 48. `audit_events`

Fields:

```text
id
company_id
agent_id nullable
entity_type
entity_id
event_type
actor_type
actor_id
correlation_id
request_id
payload_json
previous_event_hash
event_hash
created_at
```

Audit events should be append-oriented.

---

# 49. Audit Event Integrity

Every event can contain:

```text
previous_event_hash
event_hash
```

This provides tamper evidence for the off-chain audit chain.

---

# 50. `attestation_records`

Fields:

```text
id
company_id
agent_id
execution_request_id
decision_id
trace_merkle_root
policy_hash
decision
transaction_hash
status
registry_tx_hash
created_at
confirmed_at
```

Status:

```text
PENDING
SUBMITTED
CONFIRMED
FAILED
```

---

# 51. `idempotency_records`

Fields:

```text
id
company_id
idempotency_key
operation_type
resource_type
resource_id
request_hash
status
response_json
created_at
expires_at
```

Unique:

```text
(company_id, idempotency_key, operation_type)
```

The exact scope may be refined per operation.

---

# 52. Idempotency Semantics

For a repeated request:

```text
same idempotency key
+
same request hash
```

return the existing operation/result.

If:

```text
same key
+
different request hash
```

return:

```text
IDEMPOTENCY_CONFLICT
```

This protects against accidental key reuse.

---

# 53. `service_events` Optional Store

If event replay is needed, Core may store internal event envelopes.

Fields:

```text
id
event_type
schema_version
aggregate_type
aggregate_id
correlation_id
payload_json
created_at
processed_at
status
```

The implementation may instead use a dedicated event infrastructure.

---

# 54. Database Constraints

Important constraints:

```text
company IDs valid
agent belongs to company
policy belongs to company
policy version belongs to policy
decision references same company
execution references same company
approval references same decision
transaction references same proposal where applicable
```

Cross-tenant references must be impossible.

---

# 55. Foreign Key Strategy

Use PostgreSQL foreign keys for:

```text
company → agent
company → policy
policy → policy_version
company → intent
agent → intent
intent → proposal
proposal → transaction
decision → proposal
approval → decision
execution → decision
verification → execution
attestation → execution
```

Do not rely only on application code for relational integrity.

---

# 56. Delete Strategy

Financial/audit history should generally not be hard-deleted.

Prefer:

```text
status = DISABLED
status = REVOKED
status = SUPERSEDED
```

where appropriate.

If privacy/data-retention requirements eventually require deletion, use an explicit retention/anonymization strategy.

---

# 57. Audit Retention

Retention should be configurable.

Potential classes:

```text
financial audit
trajectory
security assessment
operational logs
```

Do not put raw sensitive data on-chain merely to avoid retention management.

---

# 58. Sensitive Data Storage Rules

Never store in plaintext unless explicitly required:

```text
private keys
seed phrases
API keys
access tokens
authentication headers
payment secrets
```

Security data should store:

```text
references
hashes
redacted content
```

where possible.

---

# 59. JSONB Usage

JSONB is appropriate for:

```text
policy configuration
security assessment components
evidence references
provider metadata
transaction decoded arguments
audit payload
summary objects
```

Do not hide core relational state inside one giant JSON document.

Important queryable values should have explicit typed columns.

---

# 60. Amount Storage

Financial amounts must use exact representations.

Recommended options:

```text
numeric/decimal database fields
```

or:

```text
integer minor units
```

where the asset's decimals are known and stable.

The API-level contract remains a string/exact representation.

Do not use PostgreSQL floating point for authorization-critical monetary state.

---

# 61. Currency / Asset Storage

Store enough information to identify an asset unambiguously.

For token payments:

```text
symbol
contract address
network
decimals
```

Do not assume:

```text
USDC
```

is globally unique without network context.

---

# 62. Network Storage

Use controlled identifiers such as:

```text
base-sepolia
base
```

Do not accept arbitrary network strings into critical authorization without validating them against supported chain configuration.

---

# 63. Address Storage

Addresses should be normalized before persistence according to the blockchain subsystem's canonical address representation.

Where relevant store:

```text
address
network
```

Do not use a bare address as the only identifier for a cross-chain recipient.

---

# 64. Indexing Strategy

High-value indexes:

```text
companies.status

agents.company_id
agents.status

policies.company_id
policy_versions.policy_id
policy_versions.status

intents.company_id
intents.agent_id
intents.status

action_proposals.company_id
action_proposals.agent_id
action_proposals.intent_id
action_proposals.trace_id

trajectory_events.trace_id
trajectory_events.sequence
trajectory_events.created_at

security_assessments.proposal_id

transaction_requests.proposal_id
transaction_requests.payload_hash

decisions.company_id
decisions.agent_id
decisions.result
decisions.created_at

approval_requests.company_id
approval_requests.status
approval_requests.expires_at

execution_requests.company_id
execution_requests.status
execution_requests.idempotency_key

execution_results.execution_request_id

receipt_verifications.execution_request_id

audit_events.company_id
audit_events.entity_type
audit_events.entity_id
audit_events.created_at
```

---

# 65. Unique Constraints

Recommended unique constraints:

```text
companies.id

agents.(company_id, name) where names must be unique

policy_versions.(policy_id, version)

trajectory_events.(trace_id, sequence)

idempotency_records.(company_id, operation_type, idempotency_key)

execution_requests.id

attestation_records.execution_request_id where one canonical attestation exists
```

The exact uniqueness rules may evolve.

---

# 66. Transactional Boundaries

Use PostgreSQL transactions for:

```text
policy activation
capability activation/revocation
budget reservation
approval state transitions
financial commit/release
idempotency registration
decision persistence + associated audit event where appropriate
```

---

# 67. Do Not Hold DB Transactions Over Slow Calls

Never hold a PostgreSQL transaction open while waiting for:

```text
LLM inference
human approval
blockchain confirmation
long simulation
external API response
```

Instead:

```text
persist state
commit
call external system
persist result
```

with explicit state transitions.

---

# 68. Example — Budget Reservation Transaction

Conceptual:

```text
BEGIN

load FinancialAccount
lock row

calculate:
committed + reserved + new_amount

compare:
daily limit

if exceeds:
ROLLBACK

else:
insert FinancialReservation
update FinancialAccount.reserved
COMMIT
```

This should be covered by race-condition tests.

---

# 69. Example — Approval Transition

Conceptual:

```text
BEGIN

load ApprovalRequest
lock row

verify status = PENDING
verify expires_at > now
verify context_hash matches
verify approver authorized

update status = APPROVED
insert ApprovalResult

COMMIT
```

---

# 70. Example — Idempotency Transaction

Conceptual:

```text
BEGIN

attempt insert idempotency key

if new:
  continue operation

if existing + same request hash:
  return previous result

if existing + different hash:
  return conflict

COMMIT
```

---

# 71. Redis Relationship

Redis may contain:

```text
trajectory stream position
job queues
distributed coordination
rate-limit counters
short-lived locks
temporary cache
```

The database remains authoritative for:

```text
policy
decision
approval
financial state
execution history
audit
```

---

# 72. Redis Failure Behavior

If Redis is unavailable:

```text
critical durable state remains safe
```

For trajectory ingestion:

```text
pause/degrade
```

rather than losing financial authorization state.

If a Redis lock is required but unavailable:

```text
do not bypass the lock
```

Use a safe database locking fallback where designed.

---

# 73. Database Failure Behavior

If PostgreSQL is unavailable:

```text
do not authorize new financial execution
```

Read-only operations may degrade separately.

---

# 74. Backup Strategy

V1 should at minimum support:

```text
PostgreSQL automated backups
migration history
restore testing
```

Do not assume backups are valid without periodically testing restoration.

---

# 75. Migration Strategy

Every schema change uses a migration.

Rules:

```text
never manually modify production schema
never rewrite historical migrations
prefer additive changes
```

Breaking changes require:

```text
migration plan
deployment ordering
consumer compatibility
```

---

# 76. Expand / Migrate / Contract Pattern

For risky schema changes:

```text
1. add new field/table
2. write both if necessary
3. migrate old data
4. switch consumers
5. stop old writer
6. remove old field later
```

Avoid destructive one-step migrations on financial history.

---

# 77. Seed Data

Development/test seeds may include:

```text
demo company
demo agent
demo policy
demo capabilities
test addresses
test fixtures
```

Never seed real:

```text
private keys
production API credentials
mainnet funds
```

---

# 78. Test Database

Use a separate database/schema for tests.

Tests must not use production databases.

Integration tests should be able to create:

```text
clean company
agent
policy
financial state
```

for each scenario.

---

# 79. Database Fixtures

Fixtures should cover:

```text
normal agent
strict policy
permissive policy
new recipient policy
daily spending limit
blocked recipient
expired capability
pending approval
unknown execution
receipt mismatch
```

---

# 80. Database Tests

Minimum database tests:

```text
foreign key integrity
tenant isolation
policy version immutability
trajectory sequence uniqueness
idempotency uniqueness
budget reservation concurrency
approval transition
execution state transition
audit persistence
attestation state
```

---

# 81. Financial State Test

Scenario:

```text
daily limit = $100
current committed = $60
reserved = $20
new = $30
```

Projected:

```text
$110
```

Expected:

```text
reservation rejected
```

---

# 82. Concurrency Test

Two concurrent requests:

```text
current = $50
limit = $100

A = $50
B = $50
```

Both may succeed if total exactly equals limit.

If:

```text
A = $60
B = $50
```

only one should be able to reserve enough based on the serialization order.

---

# 83. Idempotency Test

Same request:

```text
key = abc
request hash = X
```

submitted twice.

Expected:

```text
one operation
same response
```

Same key:

```text
request hash = Y
```

Expected:

```text
IDEMPOTENCY_CONFLICT
```

---

# 84. Policy Version Test

```text
policy v1 ACTIVE
```

create:

```text
v2
```

Activate v2.

Historical decision using v1 must continue to reference:

```text
v1
```

---

# 85. Transaction Mutation Test

Create:

```text
Transaction A
```

simulation record points to payload hash A.

Create:

```text
Transaction B
```

payload hash B.

Expected:

```text
simulation for A != valid simulation for B
```

---

# 86. Approval Mutation Test

Approval context hash:

```text
hash(A)
```

Current decision context:

```text
hash(B)
```

Expected:

```text
approval mismatch
```

---

# 87. Audit Reconstruction Test

Given:

```text
execution_id
```

database queries must reconstruct:

```text
company
agent
intent
proposal
policy
security
transaction
simulation
approval
decision
execution
verification
attestation
```

---

# 88. Unknown Execution Database State

When execution is:

```text
UNKNOWN
```

then:

```text
reservation = HELD
execution = UNKNOWN
```

No automatic database transition to:

```text
FAILED
```

without evidence.

---

# 89. Receipt Verification Database State

If verification succeeds:

```text
execution = CONFIRMED
verification = VERIFIED
reservation = COMMITTED
```

If mismatch:

```text
verification = MISMATCH
```

and financial/business outcome must be flagged for investigation.

---

# 90. Audit vs Operational Data

Operational tables can be updated as state transitions occur.

Audit events should preserve history.

Example:

```text
Execution.status:
SUBMITTED → CONFIRMED
```

is allowed.

Audit:

```text
EXECUTION_SUBMITTED
EXECUTION_CONFIRMED
```

remains historical.

---

# 91. Outbox Pattern

For reliable event publication, consider a transactional outbox:

```text
DB transaction
   ├── update domain state
   └── insert outbox event
          ↓
Outbox worker
          ↓
Redis/Event Bus
```

This prevents:

```text
database updated
but event lost
```

Use this especially for financial/security-critical events where delivery matters.

---

# 92. Outbox Table

If implemented:

```text
outbox_events
```

fields:

```text
id
event_type
aggregate_type
aggregate_id
payload_json
created_at
published_at
attempt_count
status
```

Status:

```text
PENDING
PUBLISHED
FAILED
```

---

# 93. Event Idempotency

Event consumers should use:

```text
event_id
```

to avoid processing the same event twice.

For financial updates:

```text
consumer must be idempotent
```

---

# 94. Database Transaction + Audit

Where appropriate:

```text
decision write
+
critical audit event
```

can occur in the same PostgreSQL transaction.

This ensures the audit trail does not claim a decision happened when the decision was never committed.

---

# 95. Database Transaction + Execution

Do NOT keep a database transaction open while:

```text
broadcasting blockchain transaction
```

Use:

```text
state transition
→ commit
→ external execution
→ result update
```

with idempotency and reconciliation.

---

# 96. Data Consistency Between Core and Blockchain

Core is authoritative for:

```text
authorization state
```

Blockchain is authoritative for:

```text
actual on-chain execution
```

Core must reconcile the two.

---

# 97. Data Consistency Between Core and AI

AI is authoritative for:

```text
its generated assessment output
```

but Core is authoritative for:

```text
whether that assessment is accepted and how it affects authorization
```

AI-generated records must not mutate Core policy state directly.

---

# 98. Query Models

For dashboard performance, use read-oriented query services or projections.

Do not make the dashboard join 15 tables manually.

Potential read models:

```text
AgentSummary
DecisionTimeline
ApprovalQueue
ExecutionTimeline
AuditTimeline
SecurityOverview
```

---

# 99. Read Model Consistency

Dashboard read models may be eventually consistent.

Critical authorization APIs must use authoritative state.

Example:

```text
Dashboard says "policy v7"
```

while:

```text
Core authorization path
```

must re-read authoritative active policy.

---

# 100. Caching

Safe cache candidates:

```text
company metadata
agent display metadata
historical audit views
static network configuration
```

Do not blindly cache:

```text
active policy
capability
budget
approval
execution
```

for authorization.

---

# 101. Data Privacy

Database should support:

```text
row-level authorization
field redaction
retention
anonymization where appropriate
```

Sensitive external content should be stored as references/hashes where possible.

---

# 102. Database Access Control

Application role should have only needed privileges.

Separate:

```text
application user
migration user
readonly analytics user
```

where operationally justified.

Avoid using PostgreSQL superuser credentials from the application.

---

# 103. Database Security

Require:

```text
TLS where deployed remotely
credential rotation
secret manager/environment injection
backup encryption
restricted network access
```

No credentials committed to source.

---

# 104. Connection Pooling

Use bounded PostgreSQL connection pool sizes.

Do not allow arbitrary request bursts to exhaust the database.

---

# 105. Long-Running Queries

Monitor and avoid long-running queries on:

```text
decision path
budget reservation
execution authorization
```

Indexes must cover high-frequency authorization queries.

---

# 106. Deadlock Handling

Where transactions can lock multiple resources:

```text
use consistent lock ordering
```

If a deadlock/concurrency conflict occurs:

```text
retry safe DB operation
```

but never blindly retry a financial broadcast.

---

# 107. Data Retention for Trajectory

Trajectory can grow quickly.

V1 should support:

```text
time-based partitioning or archiving strategy later
```

if volume becomes large.

For initial V1:

```text
index by trace_id
sequence
timestamp
```

and keep retrieval bounded.

---

# 108. Data Retention for Audit

Audit data is security-sensitive.

It should not be deleted casually.

If retention requires deletion:

```text
explicit retention job
tenant policy
compliance review
attestation implications
```

must be considered.

---

# 109. Database Migration Ordering

When adding a field required by another service:

```text
1. additive schema migration
2. deploy tolerant consumer
3. deploy producer
4. backfill if required
5. enforce constraint later
```

Avoid breaking all services simultaneously.

---

# 110. Prisma Architecture

Recommended:

```text
db/prisma/schema.prisma
db/prisma/migrations/
db/prisma/seed/
```

Backend repository layer uses Prisma.

Do not scatter direct Prisma calls throughout every domain service.

---

# 111. Repository Interfaces

Recommended interfaces:

```text
CompanyRepository
AgentRepository
CapabilityRepository
ConstitutionRepository
PolicyRepository
IntentRepository
ProposalRepository
TrajectoryRepository
SecurityAssessmentRepository
TransactionRepository
SimulationRepository
DecisionRepository
ApprovalRepository
ExecutionRepository
FinancialStateRepository
AuditRepository
AttestationRepository
IdempotencyRepository
```

---

# 112. Repository Transaction Support

Repositories should expose controlled transaction helpers when application use cases require atomic state changes.

Avoid leaking raw database transactions everywhere.

---

# 113. Example Repository Boundary

```typescript
interface FinancialStateRepository {
  reserve(
    accountId: string,
    amount: DecimalLike,
    idempotencyKey: string
  ): Promise<Reservation>;
}
```

The exact interface may differ, but the business invariant belongs near the financial state abstraction.

---

# 114. Database Anti-Patterns

Do not:

```text
1. store private keys in PostgreSQL
2. use floating point for money
3. mutate active policy in place
4. update historical audit events
5. rely only on Redis for financial truth
6. query without tenant scope
7. store raw provider payloads as the only source of truth
8. hold DB locks during blockchain confirmation
9. use database state to claim blockchain execution without verification
10. use a giant JSON blob for every domain object
```

---

# 115. Database Workflow — Normal Payment

```text
1. Intent stored
2. Proposal stored
3. SecurityAssessment stored
4. PolicyEvaluation stored
5. TransactionRequest stored
6. SimulationResult stored
7. Decision stored
8. Reservation created
9. ExecutionRequest stored
10. ExecutionResult stored
11. ReceiptVerification stored
12. Financial commit
13. Audit events
14. Attestation record
```

---

# 116. Database Workflow — Denied Payment

```text
Intent
 ↓
Proposal
 ↓
SecurityAssessment
 ↓
PolicyEvaluation = VIOLATION
 ↓
Decision = DENY
 ↓
Audit
```

No:

```text
reservation
ExecutionRequest
financial commit
```

---

# 117. Database Workflow — Review

```text
Decision = REVIEW
 ↓
ApprovalRequest = PENDING
 ↓
ApprovalResult
 ↓
Decision context updated/revalidated
 ↓
ExecutionRequest if approved
```

---

# 118. Database Workflow — Unknown Execution

```text
ExecutionRequest
 ↓
ExecutionResult = UNKNOWN
 ↓
Reservation = HELD
 ↓
Reconciliation
 ↓
Confirmed:
  commit

Failed:
  release
```

---

# 119. Database Workflow — Policy Update

```text
Policy v7 ACTIVE
 ↓
Create v8
 ↓
Validate
 ↓
Simulate
 ↓
Approve
 ↓
Activate v8
 ↓
v7 SUPERSEDED
```

---

# 120. Database Workflow — Capability Revocation

```text
Capability ACTIVE
 ↓
Operator revokes
 ↓
Capability REVOKED
 ↓
new authorization requests blocked
```

Previously confirmed executions are not retroactively changed.

---

# 121. Database Workflow — Agent Pause

```text
Agent ACTIVE
 ↓
PAUSE
 ↓
Agent PAUSED
 ↓
new execution authorization blocked
```

Unknown executions still reconcile.

---

# 122. Database Workflow — Audit Reconstruction

```text
execution_id
 ↓
ExecutionRequest
 ↓
Decision
 ↓
Transaction
 ↓
Proposal
 ↓
Intent
 ↓
Policy
 ↓
Security
 ↓
Approval
 ↓
Verification
 ↓
Audit
```

---

# 123. Performance Considerations

High-frequency queries should have indexes for:

```text
active policy lookup
agent status
pending approvals
unknown executions
financial state
trajectory trace
audit timeline
```

---

# 124. Financial State Query Requirements

Core should retrieve current spending efficiently for:

```text
daily
weekly
monthly
recipient
category
asset
```

Avoid scanning all historical executions on every authorization request.

Use maintained summary state plus audit history.

---

# 125. Financial State Reconciliation

Summary state should be periodically reconcilable against:

```text
verified execution records
```

This detects accounting drift.

---

# 126. Integrity Check Jobs

Background jobs should be able to verify:

```text
financial summary vs execution records
audit hash chain
trajectory hash chain
attestation status
orphaned reservations
stuck executions
expired approvals
expired capabilities
```

---

# 127. Cleanup Jobs

Safe cleanup candidates:

```text
expired idempotency records
temporary locks
stale worker leases
old operational cache
```

Do not clean:

```text
financial history
decisions
audit history
confirmed execution records
```

without explicit retention policy.

---

# 128. Monitoring Database Health

Monitor:

```text
connection pool
query latency
deadlocks
lock waits
slow queries
storage growth
index usage
replication/backup health where deployed
```

---

# 129. Backup / Restore Acceptance

Before V1 production readiness:

```text
backup created
restore tested
financial tables verified
policy history verified
audit verified
```

A backup that has never been restored is not considered proven.

---

# 130. V1 Database Definition of Done

```text
[ ] PostgreSQL configured
[ ] Prisma schema implemented
[ ] migrations tracked
[ ] tenant relationships enforced
[ ] Agent/Constitution/Capability persisted
[ ] Policy versioning persisted
[ ] Intent/Proposal persisted
[ ] Trajectory persisted
[ ] SecurityAssessment persisted
[ ] Transaction/Simulation persisted
[ ] Decision persisted
[ ] Approval persisted
[ ] Execution state persisted
[ ] Verification persisted
[ ] Financial reservations implemented
[ ] Idempotency implemented
[ ] Audit persisted
[ ] Attestation persisted
[ ] required indexes created
[ ] concurrency tests pass
[ ] tenant isolation tests pass
[ ] migration/restore process tested
```

---

# 131. Final Database Principle

The SentinelPay database is not just a storage layer.

It preserves the authority history required to answer:

```text
What was the user trying to do?

What did the agent propose?

What did security intelligence say?

Which policy was active?

What exact transaction was evaluated?

What did simulation predict?

Who approved it?

What did Core authorize?

What actually happened?

Was the result verified?

What was committed to audit/attestation?
```

The database must therefore preserve **state, history, relationships, and authorization context** without allowing historical meaning to be silently rewritten.

> **Financial authority must be reconstructable from durable state, and actual payment truth must ultimately be reconciled against the execution/payment rail.**
