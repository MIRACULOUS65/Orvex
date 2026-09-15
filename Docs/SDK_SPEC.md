# SentinelPay — SDK_SPEC.md

## SentinelPay SDK Specification

**Document Type:** Public SDK Product & Interface Specification  
**Product:** SentinelPay SDK  
**Version:** V1.0  
**Status:** Canonical SDK specification  
**Audience:** Application developers, platform teams, AI-agent developers, security teams, Backend/Core, Blockchain/Execution, SDK maintainers, Kiro

---

# 1. Purpose

SentinelPay is ultimately an SDK.

The primary product is not the demonstration application, dashboard, or a single autonomous agent.

The primary product is:

> **A security and execution SDK that allows companies to give AI agents controlled financial autonomy without giving the AI unrestricted authority over money.**

A company should be able to take an existing AI agent and place SentinelPay between that agent and its financial execution layer.

Conceptually:

```text
CUSTOMER'S AI AGENT
        │
        ▼
   SentinelPay SDK
        │
        ├── Intent
        ├── Constitution / Policy
        ├── Trajectory
        ├── Security Intelligence
        ├── Deterministic Enforcement
        ├── Simulation
        ├── Approval
        ├── Execution
        ├── Verification
        └── Audit
        │
        ▼
 PAYMENT / FINANCIAL SYSTEM
```

The customer should not need to rebuild its agent architecture around SentinelPay.

---

# 2. Product Principle

The SDK enforces the core SentinelPay security principle:

> **AI may recommend. Deterministic systems authorize.**

The SDK allows AI to:

- understand user goals
- reason
- research
- compare options
- use tools
- propose actions
- identify potential threats
- assess risk

The SDK does not allow AI intelligence alone to:

- authorize a payment
- bypass policy
- modify approved payment context
- sign arbitrary transactions
- access unrestricted financial authority
- declare its own output safe and execute it

---

# 3. SDK Scope

The V1 SDK provides the integration boundary for:

```text
1. Agent registration
2. Intent handling
3. Agent Constitution / policy registration
4. Trajectory interception
5. Action proposal handling
6. Security assessment integration
7. Deterministic policy evaluation
8. Transaction validation
9. Simulation
10. Human approval
11. Execution adapters
12. Receipt verification
13. Audit
14. On-chain attestation
```

The SDK is designed to be usable by:

```text
- custom AI agents
- existing agent frameworks
- MCP-based agents
- companies with their own orchestration
- applications using external model providers
- applications using self-hosted models
```

---

# 4. V1 Product Boundary

The SDK should expose a small stable public API even though SentinelPay internally contains many services.

```text
                 PUBLIC SDK
                     │
         ┌───────────┼────────────┐
         ▼           ▼            ▼
      Intent       Policy       Execute
         │           │            │
         ▼           ▼            ▼
      Security   Approval      Verify
                     │
                     ▼
                   Audit
```

The SDK must hide internal implementation complexity.

A customer should not need to know:

- which model provider is used
- which threat classifier is used
- which reputation source is used
- which blockchain RPC provider is used
- how trajectories are stored
- how Merkle roots are generated
- how policy evaluation is internally implemented

unless the customer intentionally opts into lower-level APIs.

---

# 5. Supported SDK Languages

V1 target:

```text
TypeScript
Python
```

The two SDKs should expose equivalent conceptual capabilities.

The internal implementation can differ.

The public contracts must remain semantically aligned.

---

# 6. Integration Modes

The SDK should support several deployment/integration modes.

## 6.1 Embedded Mode

The SDK runs inside the customer's agent/backend process.

```text
Customer Agent
     │
     └── SentinelPay SDK
```

Best for:

- local development
- simple applications
- low-latency deployments

---

## 6.2 Service Mode

The customer's agent communicates with a SentinelPay service.

```text
Customer Agent
     │
     ▼
SentinelPay Service
     │
     ▼
Execution
```

Best for:

- centralized governance
- multiple agents
- enterprise deployments
- shared policy management

---

## 6.3 Proxy / Middleware Mode

SentinelPay sits between the agent's tool interface and execution boundary.

```text
Agent
  │
  ▼
Tool / MCP layer
  │
  ▼
SentinelPay
  │
  ▼
Wallet / Payment System
```

This mode preserves the original VeriGuard trajectory-interception concept and is important for agent-agnostic integration.

---

# 7. SDK Initialization

Conceptually:

```typescript
import { createSentinel } from "@sentinelpay/sdk";

const sentinel = createSentinel({
  agentId: "agent_001",
  environment: "testnet",
});
```

Initialization must establish:

- agent identity
- environment
- policy context
- execution configuration
- model/security provider configuration
- audit configuration
- optional blockchain configuration

Secrets must never be passed in plain application configuration objects where a secure secret provider is available.

---

# 8. Configuration Model

Conceptually:

```typescript
const sentinel = createSentinel({
  agentId: "agent_001",

  environment: "testnet",

  policy: {
    policyId: "policy_001",
  },

  execution: {
    mode: "SIMULATION",
    network: "base-sepolia",
  },

  approval: {
    mode: "POLICY_DRIVEN",
  },

  audit: {
    enabled: true,
  },
});
```

Configuration should be typed and validated at startup.

---

# 9. Agent Registration

A company must register an agent before using autonomous financial capabilities.

Conceptually:

```typescript
await sentinel.agents.register({
  agentId: "agent_001",
  name: "MarketDataAgent",
  purpose: "Acquire external data and pay approved providers",
});
```

The agent record should be associated with:

- company
- identity
- Agent Constitution
- execution capabilities
- policy version
- financial limits
- enabled payment rails
- audit configuration

---

# 10. Agent Capabilities

The SDK must support capability-based authority.

A capability defines what the agent can potentially do.

Example:

```typescript
{
  action: "PAY",
  assets: ["USDC"],
  networks: ["base-sepolia"],
  categories: ["API", "DATA"],
  singleTransactionLimit: "10.00",
  dailyLimit: "50.00"
}
```

Capabilities are restrictions, not permissions to bypass policy.

A capability can only operate within the customer's Constitution and active policy.

---

# 11. Intent API

The SDK should expose a high-level Intent API.

Conceptually:

```typescript
const intent = await sentinel.intent.create({
  userGoal: "Find a reliable market-data API and pay up to $10 today.",
});
```

The resulting object should conform to `Intent` from `CONTRACTS.md`.

---

# 12. Intent Result

The SDK should support:

```typescript
const result = await sentinel.intent.create(...);

if (result.status === "NEEDS_CLARIFICATION") {
  // ask the user for missing information
}
```

The SDK must not silently infer missing financial constraints.

Examples of information that may require clarification:

- maximum amount
- currency
- permitted merchant/category
- autonomy level
- expiration
- required outcome

---

# 13. Agent Execution API

The highest-level SDK operation should be conceptually simple.

```typescript
const result = await sentinel.run({
  intent,
});
```

The internal lifecycle may be:

```text
Intent
 ↓
Agent
 ↓
Trajectory
 ↓
Action Proposal
 ↓
Security Analysis
 ↓
Policy
 ↓
Transaction Validation
 ↓
Simulation
 ↓
Approval
 ↓
Execution
 ↓
Verification
```

The SDK consumer should receive a unified result.

---

# 14. `run()` Result

Conceptually:

```typescript
{
  status: "ALLOW",

  intent,
  proposal,
  securityAssessment,
  policyEvaluation,
  decision,
  execution,
  verification
}
```

The actual public SDK schema should reference the shared contracts defined in `CONTRACTS.md`.

---

# 15. Action Proposal API

For companies that already have their own agent, the SDK must allow direct submission of an Action Proposal.

Conceptually:

```typescript
const assessment = await sentinel.analyzeProposal(proposal);
```

This allows:

```text
Existing Agent
      │
      ▼
ActionProposal
      │
      ▼
SentinelPay
```

without requiring SentinelPay to own the entire agent.

---

# 16. Security Analysis API

The SDK should expose a security-intelligence entry point.

Conceptually:

```typescript
const assessment =
  await sentinel.security.analyze({
    intent,
    proposal,
    trajectory,
    evidence,
    recipientContext,
  });
```

The returned object is a `SecurityAssessment`.

The SDK must clearly communicate that:

> Security assessment is intelligence, not final authorization.

---

# 17. Policy API

Customers should be able to register policies programmatically.

Conceptually:

```typescript
await sentinel.policies.create({
  name: "Default Agent Payment Policy",

  rules: [
    {
      type: "AMOUNT_LIMIT",
      max: "20.00",
      currency: "USDC",
    },
    {
      type: "RECIPIENT_ALLOWLIST",
      recipients: ["0x..."],
    },
    {
      type: "HUMAN_APPROVAL",
      condition: "NEW_RECIPIENT && amount > 5",
    }
  ],
});
```

---

# 18. Natural-Language Policy API

The SDK should also support company policy written in human language.

Conceptually:

```typescript
const draft = await sentinel.policies.compile({
  text: `
    Agents may automatically pay approved API providers
    up to $20. New recipients above $5 require approval.
  `,
});
```

The result should be a reviewable structured representation.

The SDK must not silently deploy an AI-generated policy.

---

# 19. Policy Deployment

The flow must be:

```text
Natural Language Policy
        ↓
AI Interpretation
        ↓
Structured Policy
        ↓
Conflict / Ambiguity Check
        ↓
Human Review
        ↓
Policy Activation
```

Conceptually:

```typescript
await sentinel.policies.deploy({
  policyId: "policy_001",
  expectedVersion: 3,
});
```

Policy deployment must be explicit.

---

# 20. Policy Simulation API

A customer should be able to test a policy before deployment.

Conceptually:

```typescript
const simulation =
  await sentinel.policies.simulate({
    policyId: "policy_001",
    scenarios: [
      "new-recipient",
      "amount-over-limit",
      "payment-redirection"
    ],
  });
```

The SDK should return:

- caught cases
- missed cases
- rule responsible
- recommended policy changes
- test metadata

---

# 21. Trajectory API

The SDK must support trajectory capture.

Conceptually:

```typescript
const trace = sentinel.trajectory.start({
  agentId: "agent_001",
});
```

Actions are appended:

```typescript
trace.record(event);
```

The SDK should support events such as:

```text
USER_REQUEST
PLAN_CREATED
TOOL_CALL
TOOL_RESULT
WEB_ACCESS
MEMORY_READ
MEMORY_WRITE
EXTERNAL_INPUT
RECIPIENT_CHANGE
AMOUNT_CHANGE
PROPOSAL_CREATED
```

---

# 22. Automatic Tool Interception

Where supported, the SDK should provide middleware/hooks so customers do not manually record every event.

Conceptually:

```typescript
const protectedTools =
  sentinel.wrapTools(existingTools);
```

or:

```typescript
const protectedAgent =
  sentinel.wrapAgent(existingAgent);
```

The exact framework-specific implementation belongs in adapters.

The core SDK should remain framework-agnostic.

---

# 23. MCP Adapter

Because many agents communicate with tools through MCP, SentinelPay should expose an MCP adapter.

Conceptually:

```text
Agent
  ↓
MCP
  ↓
SentinelPay MCP Adapter
  ↓
Tool
```

The adapter should:

- observe tool calls
- attach provenance
- record trajectory events
- detect suspicious outputs
- prevent external content from becoming authorization
- pass structured events into Sentinel Core

The adapter must not become a second authorization engine.

---

# 24. Framework Adapters

The SDK should allow adapters for existing agent runtimes.

Potential adapters:

```text
MCP
Google ADK
LangGraph
Custom agent
Other compatible runtimes
```

The adapter boundary should normalize each framework into SentinelPay's shared contracts.

---

# 25. Execution API

The public SDK should expose execution without exposing raw signing authority.

Conceptually:

```typescript
const result = await sentinel.execute({
  decisionId: "decision_001",
});
```

Execution must require a valid Core decision.

The SDK must reject:

```text
execution without decision
```

unless explicitly in simulation/test mode.

---

# 26. Simulation API

The SDK should support transaction simulation before execution.

Conceptually:

```typescript
const result =
  await sentinel.simulate({
    transaction,
  });
```

The simulator returns a `SimulationResult`.

Simulation must be deterministic and tied to the exact transaction candidate.

If the transaction changes after simulation, the old simulation is invalid.

---

# 27. Human Approval API

Conceptually:

```typescript
const approval =
  await sentinel.approvals.request({
    decisionId: "decision_001",
  });
```

The SDK should support:

```text
APPROVAL_PENDING
APPROVED
DENIED
EXPIRED
CANCELLED
```

Approval must bind to the exact decision/transaction context.

---

# 28. Automatic vs Human-Controlled Execution

The SDK must support policy-driven autonomy.

Example:

```text
Known provider + $2
→ automatic

New provider + $4
→ automatic or approval according to policy

New recipient + $8
→ approval

Blocked category
→ deny
```

The SDK should not hard-code these thresholds.

They belong to the customer's active Constitution/policy.

---

# 29. Execution Adapters

Execution must be abstracted behind an interface.

Conceptually:

```text
ExecutionAdapter
      │
      ├── SmartAccountAdapter
      ├── X402Adapter
      ├── APIAdapter
      └── FuturePaymentAdapter
```

The SDK core should interact with the abstraction.

---

# 30. Blockchain Adapter

V1 reference implementation:

```text
Base Sepolia
```

The public SDK should represent blockchain execution through a generic interface:

```typescript
interface ChainAdapter {
  validate(...)
  simulate(...)
  execute(...)
  getReceipt(...)
  verify(...)
}
```

The SDK must not hard-code Base-specific assumptions into the public contract.

---

# 31. x402 Adapter

For the V1 machine-payment demonstration, x402 should be supported through an execution adapter.

Conceptually:

```text
Agent
 ↓
Service returns payment requirement
 ↓
SentinelPay
 ↓
Security / Policy / Simulation
 ↓
x402 payment
 ↓
Service response
```

The SDK should treat x402 as one payment rail, not as the entire SentinelPay architecture.

---

# 32. Wallet / Smart Account Boundary

The SDK should expose wallet execution capabilities without exposing private-key material to AI agents.

Preferred conceptual architecture:

```text
AI Agent
   │
   ▼
SentinelPay
   │
   ▼
Smart Account
   │
   ▼
Payment Rail
```

The agent should never receive an unrestricted signing key as part of normal operation.

---

# 33. Audit API

Customers need to retrieve decisions and historical activity.

Conceptually:

```typescript
const events =
  await sentinel.audit.query({
    agentId: "agent_001",
    from: "...",
    to: "...",
  });
```

Possible filters:

```text
agent
intent
proposal
transaction
decision
policy
status
time range
risk level
```

---

# 34. Audit Detail

For a transaction, the SDK should be able to surface:

```text
Intent
Agent proposal
Trajectory
Evidence
Security assessment
Policy evaluation
Simulation
Approval
Decision
Execution
Receipt
Attestation
```

This allows an operator to answer:

> Why did the system allow or block this action?

---

# 35. Verification API

Conceptually:

```typescript
const verification =
  await sentinel.verify({
    executionId: "execution_001",
  });
```

Verification should compare:

```text
authorized expectation
        VS
submitted transaction
        VS
actual result
```

---

# 36. Attestation API

The SDK should expose read/write abstractions for attestation.

Conceptually:

```typescript
const attestation =
  await sentinel.attest({
    decision,
    execution,
    verification,
  });
```

And:

```typescript
const record =
  await sentinel.attestations.get(attestationId);
```

The raw attestation contract remains a blockchain implementation detail.

---

# 37. Environment Modes

The SDK must support explicit environments.

```text
DEVELOPMENT
TEST
TESTNET
PRODUCTION
```

For V1:

```text
development
test
base-sepolia
```

Production/mainnet capabilities must be explicitly configured.

The SDK must never infer mainnet from a connected wallet.

---

# 38. Execution Modes

At minimum:

```text
SIMULATE
REVIEW_ONLY
TESTNET
AUTONOMOUS
```

### `SIMULATE`

Never broadcasts transactions.

### `REVIEW_ONLY`

Generates a decision/approval request but does not execute automatically.

### `TESTNET`

Allows actual testnet execution.

### `AUTONOMOUS`

Allows execution when policy permits it.

---

# 39. Fail-Closed Behavior

Security-critical operations should fail closed.

Examples:

```text
Policy unavailable
→ do not execute

Security assessment unavailable
→ review or deny according to policy

Simulation unavailable
→ do not execute if simulation is required

Approval expired
→ do not execute

Transaction changed after approval
→ revalidate

Chain identity mismatch
→ do not execute
```

The SDK must not convert infrastructure failure into implicit permission.

---

# 40. Error API

All SDK errors should use structured error codes.

Examples:

```text
INTENT_INVALID
INTENT_NEEDS_CLARIFICATION
POLICY_INVALID
POLICY_CONFLICT
POLICY_VIOLATION
SECURITY_ASSESSMENT_FAILED
INSUFFICIENT_EVIDENCE
TRANSACTION_INVALID
SIMULATION_FAILED
APPROVAL_REQUIRED
APPROVAL_EXPIRED
EXECUTION_BLOCKED
EXECUTION_FAILED
RECEIPT_MISMATCH
CHAIN_ERROR
PROVIDER_ERROR
CONFIGURATION_ERROR
```

Errors should include:

```text
code
message
retryable
details
correlation_id
```

---

# 41. Event System

The SDK should emit lifecycle events.

Example:

```typescript
sentinel.on("decision.created", handler);
sentinel.on("approval.required", handler);
sentinel.on("execution.confirmed", handler);
sentinel.on("security.alert", handler);
```

V1 event categories:

```text
intent.created
intent.updated
trajectory.recorded
proposal.created
security.analysis.started
security.analysis.completed
policy.evaluated
decision.created
approval.required
approval.completed
simulation.completed
execution.started
execution.submitted
execution.confirmed
verification.completed
audit.created
attestation.created
```

---

# 42. Webhooks / Remote Events

For service mode, the SDK platform should support webhook/event delivery.

The event payload must reference a shared contract instead of embedding arbitrary provider-specific data.

Example:

```json
{
  "event": "execution.confirmed",
  "schema_version": "event.v1",
  "correlation_id": "corr_001",
  "data": {
    "execution_id": "execution_001"
  }
}
```

---

# 43. Idempotency

Financial operations must be idempotent.

The SDK should accept an explicit idempotency key where appropriate:

```typescript
await sentinel.execute({
  decisionId,
  idempotencyKey: "..."
});
```

Retries must not accidentally produce multiple payments.

---

# 44. Concurrency Rules

The SDK must protect against race conditions.

Example:

```text
Request A checks daily limit
Request B checks daily limit
Both execute
Combined amount exceeds limit
```

The policy/economic state must be evaluated atomically or under an equivalent serialization mechanism.

A decision can become stale.

Before execution, the SDK must revalidate any state that the policy requires to be current.

---

# 45. Decision Binding

An execution request should be cryptographically or logically bound to:

```text
intent_id
proposal_id
decision_id
policy_version
transaction_payload
approval context
```

If material fields change:

```text
old decision → INVALID
```

and the flow must restart from the necessary security/approval stage.

---

# 46. Public SDK vs Internal SDK

The project should distinguish:

## Public SDK

Stable:

```text
Intent
Policy
ActionProposal
Decision
Approval
Execution
Verification
Audit
```

## Internal SDK / Service APIs

May expose:

```text
raw model calls
internal classifier output
trajectory internals
provider adapters
simulation implementation details
debug traces
```

Internal APIs can evolve faster.

---

# 47. Type Safety

The SDK should strongly prefer typed interfaces.

TypeScript:

```text
strict: true
```

Python:

```text
typed models
runtime validation
```

Shared conceptual contracts must remain aligned across languages.

---

# 48. SDK Security Requirements

The SDK must:

- never log private keys
- never place API secrets into trajectory events
- redact credentials from evidence
- avoid putting sensitive data on-chain
- prevent unauthorized execution paths
- require explicit environment configuration
- reject invalid chain identifiers
- validate recipient/network combinations
- bind approvals to exact transaction context
- enforce idempotency
- support audit correlation IDs

---

# 49. Sensitive Data Redaction

Trajectory and evidence capture may encounter sensitive content.

The SDK must support redaction for:

```text
API keys
access tokens
private keys
seed phrases
passwords
cookies
session tokens
authentication headers
payment credentials
```

The public SDK must not assume that raw tool output is safe to store.

---

# 50. Secrets Boundary

Secrets must be provided to execution infrastructure through secure configuration mechanisms.

AI prompts, model context, evidence objects, trajectory events, and Action Proposals must never contain private signing material.

A private key must never cross:

```text
AI Agent
Intent
ActionProposal
SecurityAssessment
Trajectory
Evidence
```

---

# 51. Model-Agnostic Architecture

The SDK must not require a single model.

Conceptually:

```text
ModelProvider
     │
     ├── Qwen
     ├── Gemini
     ├── OpenAI-compatible
     └── Custom Provider
```

The product must support customer-owned models where possible.

The model provider is an implementation choice.

The SentinelPay security contracts are not model-dependent.

---

# 52. Agent-Framework Agnosticism

The SDK should work with:

```text
Custom agent
MCP
Google ADK adapter
LangGraph adapter
Future frameworks
```

The integration layer normalizes framework-specific events into:

```text
Intent
TrajectoryEvent
ActionProposal
Evidence
```

---

# 53. SDK Composition

The public SDK should be modular.

Conceptually:

```typescript
const sentinel = createSentinel(...);

sentinel.intent
sentinel.agents
sentinel.policies
sentinel.security
sentinel.trajectory
sentinel.simulation
sentinel.approvals
sentinel.execution
sentinel.audit
sentinel.attestations
```

This allows customers to use only the capabilities they need.

---

# 54. Minimal Integration

The ideal developer experience should eventually look like:

```typescript
import { createSentinel } from "@sentinelpay/sdk";

const sentinel = createSentinel({
  agentId: "my-agent",
});

const result = await sentinel.protect(async () => {
  return myAgent.run(userRequest);
});
```

However, this is a target API shape, not a claim about the final implementation.

The implementation must preserve the contract boundaries specified elsewhere.

---

# 55. Existing-Agent Integration

A company with an existing agent should be able to do approximately:

```text
Existing Agent
      │
      ▼
Sentinel Adapter
      │
      ▼
Sentinel Core
      │
      ▼
Existing Execution Layer
```

The customer should not be forced to rewrite the agent's reasoning system.

---

# 56. Full-Stack Example

A conceptual customer flow:

```typescript
const sentinel = createSentinel({
  agentId: "market-agent",
  environment: "testnet",
});

const intent = await sentinel.intent.create({
  userGoal:
    "Find a reliable market-data API and spend no more than $10 today.",
});

const result = await sentinel.run({ intent });

switch (result.decision.result) {
  case "ALLOW":
    console.log(result.execution);
    break;

  case "REVIEW":
    console.log(result.approval);
    break;

  case "DENY":
    console.log(result.decision);
    break;
}
```

---

# 57. Existing-Agent / Direct Proposal Example

A company may not want SentinelPay to run the agent.

They can instead submit the agent's proposal:

```typescript
const proposal = myAgent.createActionProposal(...);

const decision =
  await sentinel.evaluate(proposal);
```

SentinelPay can then perform:

```text
Intent
Policy
Security
Transaction
Simulation
Approval
Decision
```

according to configured capabilities.

---

# 58. SDK State Machine

The high-level lifecycle is:

```text
CREATED
   ↓
INTENT_READY
   ↓
AGENT_RUNNING
   ↓
PROPOSAL_READY
   ↓
SECURITY_ANALYZING
   ↓
POLICY_EVALUATING
   ↓
TRANSACTION_VALIDATING
   ↓
SIMULATING
   │
   ├── FAILED → DENY / ERROR
   │
   ▼
DECISION_READY
   │
   ├── DENY
   │
   ├── REVIEW → APPROVAL_PENDING
   │               ↓
   │             APPROVED
   │
   ▼
READY
   ↓
EXECUTING
   ↓
CONFIRMED
   ↓
VERIFICATION
   ↓
AUDITED
```

---

# 59. SDK Decision Semantics

The SDK must never make the following assumption:

```text
SecurityAssessment = ALLOW
```

Instead:

```text
SecurityAssessment
+
PolicyEvaluation
+
TransactionAnalysis
+
Simulation
+
Approval
+
other deterministic rules
        ↓
Decision
```

This distinction must be visible in the public API.

---

# 60. Multi-Agent Support

SentinelPay should support multiple agents under one company.

Example:

```text
Company
 │
 ├── ProcurementAgent
 ├── DataAgent
 ├── TreasuryAgent
 └── SupportAgent
```

Each may have:

- separate identity
- separate Constitution
- separate limits
- separate execution capabilities
- separate audit history

---

# 61. Delegation

If one agent delegates to another, the delegated action must preserve authority context.

Conceptually:

```text
Parent Agent
   │
   ▼
Delegation Capability
   │
   ▼
Child Agent
```

The child must not gain greater authority than the parent.

A delegated capability should specify:

```text
allowed actions
maximum amount
allowed assets
allowed networks
expiration
purpose
```

---

# 62. Approval UX Boundary

The SDK should generate enough structured information for a host application to show a human-readable approval screen.

Minimum information:

```text
Purpose
Recipient
Amount
Asset
Network
Why the agent wants to pay
Policy status
Security status
Simulation status
Risk summary
Expiration
```

The SDK should not dictate the exact frontend design.

---

# 63. Observability

The SDK must expose correlation-friendly events and telemetry.

At minimum:

```text
intent duration
agent run duration
security analysis duration
policy evaluation duration
simulation duration
approval wait time
execution duration
verification duration
```

Security-relevant events must be traceable end to end.

---

# 64. Performance Expectations

V1 should prioritize correctness and explicit security boundaries over premature optimization.

The SDK architecture should still support:

- asynchronous security analysis
- cached read-only reputation information
- batched audit writes
- streaming trajectory events
- simulation caching where safe
- provider timeouts
- bounded retries

No optimization may weaken financial authorization guarantees.

---

# 65. Testing Requirements

The SDK must include:

```text
unit tests
contract tests
integration tests
security tests
failure-mode tests
simulation tests
execution tests
idempotency tests
policy tests
red-team scenarios
```

The shared schemas are the foundation for contract testing.

---

# 66. SDK Test Categories

### Intent

```text
clear intent
ambiguous intent
contradictory intent
missing budget
expired intent
```

### Security

```text
prompt injection
payment redirection
new recipient
credential request
tool-output injection
memory poisoning
```

### Policy

```text
amount limit
daily limit
allowlist
blocklist
new recipient
time window
human approval
transaction structuring
```

### Execution

```text
successful transaction
simulation revert
insufficient funds
wrong network
receipt mismatch
duplicate retry
stale approval
```

---

# 67. Reference Demo Application

The project repository will contain a reference demo using the SDK.

The demo is not the product.

Conceptually:

```text
apps/demo
      │
      ▼
SentinelPay SDK
      │
      ├── Qwen Agent
      ├── Security Intelligence
      ├── Base Sepolia
      ├── USDC
      └── x402
```

The demo should demonstrate the SDK by making one realistic autonomous payment flow work from beginning to end.

---

# 68. Hero Demo Flow

Target:

```text
User:
"Find a useful API and pay up to $10."
        ↓
Intent
        ↓
Agent searches
        ↓
Malicious content attempts payment redirection
        ↓
Action Proposal changes recipient
        ↓
Security detects manipulation
        ↓
Core evaluates policy
        ↓
DENY
        ↓
No funds move
```

Then show a legitimate provider:

```text
Intent
 ↓
Agent
 ↓
Proposal
 ↓
Security PASS
 ↓
Policy PASS
 ↓
Simulation PASS
 ↓
Human approval or autonomous execution
 ↓
x402 / USDC
 ↓
Base Sepolia
 ↓
Verified receipt
 ↓
Audit
```

---

# 69. Public API Stability

The project should treat the following as long-term API concepts:

```text
createSentinel()
intent
agents
policies
security
trajectory
evaluate
simulate
approvals
execute
verify
audit
attestations
```

Internal implementation should be allowed to evolve without breaking these abstractions unnecessarily.

---

# 70. Provider Independence

The SDK should not expose provider-specific concepts at the core level.

Bad:

```text
sentinel.executeAlchemySimulation(...)
```

Better:

```text
sentinel.simulate(...)
```

Provider-specific functionality belongs behind adapters.

---

# 71. Mainnet Safety

The SDK must require explicit configuration to use mainnet.

Rules:

```text
No automatic mainnet inference
No fallback from testnet to mainnet
No shared testnet/mainnet signer
No production execution in development mode
```

The customer's environment must explicitly declare:

```text
network
execution_mode
credentials
```

---

# 72. Financial Limits

The SDK should treat financial limits as first-class state.

Potential limits:

```text
single transaction
hourly
daily
weekly
monthly
per recipient
per category
per asset
per network
```

The SDK itself should not invent these limits.

It enforces configured policy/capabilities.

---

# 73. Auditability

A customer must be able to answer:

```text
What did the user ask for?
What did the agent see?
What did the agent propose?
What did security detect?
Which policy was active?
What transaction was simulated?
Who approved it?
What was executed?
What happened on-chain?
```

The SDK should make this trace reconstructable.

---

# 74. Public vs Private Data

The SDK should distinguish:

```text
Public audit data
Private company data
Sensitive evidence
Secrets
On-chain commitments
```

Only appropriate hashes/commitments belong on-chain.

Raw proprietary prompts, private business information, or API credentials must remain off-chain.

---

# 75. Migration / Upgrade Model

Customers may upgrade:

```text
SDK version
Policy version
Model version
Security engine version
Execution adapter version
```

These versions should be visible in audit metadata.

A historical audit must remain interpretable using the versions that produced it.

---

# 76. SDK Versioning

The SDK uses semantic versioning where appropriate:

```text
MAJOR.MINOR.PATCH
```

Breaking public API changes require major version changes.

Security fixes should be released promptly even when they alter internal behavior.

---

# 77. Kiro Implementation Rules

When implementing the SDK:

1. Preserve the shared contracts in `CONTRACTS.md`.
2. Never bypass SentinelPay Core for execution.
3. Never let AI output directly authorize a payment.
4. Keep provider integrations behind adapters.
5. Keep model providers behind a model interface.
6. Keep blockchain networks behind chain adapters.
7. Keep payment rails behind execution adapters.
8. Validate all public inputs.
9. Use structured errors.
10. Preserve correlation IDs.
11. Maintain idempotency for financial actions.
12. Fail closed where authorization/security state is unavailable.
13. Never log secret material.
14. Never silently mutate approved transaction context.
15. Maintain test coverage for every security boundary.

---

# 78. V1 Public SDK Capability Set

The first complete SDK should provide:

```text
Agent registration
Intent creation
Intent validation
Policy registration
Policy compilation
Policy simulation
Trajectory capture
Proposal evaluation
Security analysis
Policy evaluation
Decision creation
Transaction validation
Transaction simulation
Human approval
Execution adapter
Receipt verification
Audit retrieval
Attestation
```

---

# 79. V1 Non-Goals

The SDK V1 does not need to provide:

```text
all financial rails
all blockchain networks
consumer banking infrastructure
card issuing
full DeFi automation
unrestricted autonomous spending
custody as a standalone product
training of a foundation model
a proprietary LLM
a new agent framework
```

The SDK should focus on secure autonomous payment execution.

---

# 80. Definition of Done

The SDK V1 is complete when a third-party-style demo application can:

```text
1. Register an agent
2. Configure a Constitution/policy
3. Submit a user Intent
4. Run an agent or submit an ActionProposal
5. Capture trajectory
6. Produce SecurityAssessment
7. Evaluate deterministic policy
8. Construct and validate a transaction
9. Simulate it
10. Request human approval when required
11. Execute on Base Sepolia
12. Verify the receipt
13. Produce an audit trail
14. Produce/read an attestation
```

The entire operation must be understandable through stable SDK interfaces.

---

# 81. Final SDK Architecture

```text
                    CUSTOMER APPLICATION
                            │
                            ▼
                  ┌─────────────────────┐
                  │   SENTINELPAY SDK   │
                  │                     │
                  │ Intent              │
                  │ Agent Integration   │
                  │ Trajectory          │
                  │ Policy              │
                  │ Security            │
                  │ Decision            │
                  │ Approval            │
                  │ Simulation          │
                  │ Execution           │
                  │ Verification        │
                  │ Audit               │
                  │ Attestation         │
                  └──────────┬──────────┘
                             │
           ┌─────────────────┼──────────────────┐
           │                 │                  │
           ▼                 ▼                  ▼
       AI/ML Layer       Core/Policy       Execution
           │                 │                  │
           ▼                 ▼                  ▼
      Models/Tools      Deterministic       Smart Account
                         Authority             x402
                                               Chain
                             │
                             ▼
                       PAYMENT SYSTEM
                             │
                             ▼
                     VERIFIED RESULT
```

---

# 82. Final Product Principle

SentinelPay is not an agent replacement.

It is not simply a wallet.

It is not merely a transaction scanner.

It is not merely a prompt-injection detector.

It is the **control and execution boundary between an autonomous AI agent and financial authority**.

A company can continue using the AI stack it already has.

SentinelPay provides the missing layer:

```text
Agent intelligence
        +
Security intelligence
        +
Deterministic policy
        +
Financial execution controls
        +
Verification
        +
Auditability
```

The SDK is successful when a company can integrate this boundary without having to redesign its entire agent.

> **Let the customer's AI determine how to accomplish the user's goal. Let SentinelPay determine whether, how, and under what authority money can move.**
