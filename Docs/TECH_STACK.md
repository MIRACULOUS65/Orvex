# SentinelPay — TECH STACK

**Document role:** canonical technology-selection document for the SentinelPay monorepo.

**Product:** SentinelPay — SDK and execution-safety layer for autonomous financial agents.

**Status:** V1 technology baseline

**Scope:** This document defines the technologies, language choices, infrastructure choices, interfaces, and technology boundaries that the implementation should follow. It does not redefine product behavior; `IDEA.md`, `SYSTEM_ARCHITECTURE.md`, and `IMPLEMENTATION.md` remain the higher-level references for product intent, architecture, and implementation rules.

---

## 1. Technology Philosophy

SentinelPay is being built as **one repository containing the complete product**:

- AI/ML agent and security intelligence
- deterministic policy/security core
- backend APIs and orchestration
- blockchain execution
- smart contracts
- SDKs
- demo application
- dashboard
- shared schemas
- tests
- local development infrastructure

The stack must therefore satisfy six requirements:

1. **Model independence** — changing the LLM must not require redesigning the SDK.
2. **Agent-framework independence** — companies must be able to protect existing agents rather than migrate them to SentinelPay.
3. **Deterministic money controls** — AI may recommend, but deterministic code controls authorization and execution.
4. **Blockchain portability** — Base Sepolia is the first implementation target, but chain logic must be adapter-based.
5. **Strong developer experience** — a company should eventually integrate SentinelPay with a small amount of code.
6. **Production replaceability** — demo infrastructure must not become a permanent architectural constraint.

---

# 2. V1 Technology Decision — Summary

| Area | V1 Choice | Role |
|---|---|---|
| Primary AI language | **Python** | Agent/ML/security intelligence |
| Backend / SDK language | **TypeScript** | SDK, API, orchestration, execution interfaces |
| Smart contracts | **Solidity** | Smart account/attestation contracts |
| Frontend | **Next.js + React + TypeScript** | Dashboard/demo |
| Styling | **Tailwind CSS** | UI |
| AI model strategy | **Qwen family behind a model abstraction** | Initial open-model path |
| Agent framework | **Framework-agnostic core; optional Google ADK adapter** | Agent orchestration integration |
| Agent protocol | **MCP adapter** | Interoperability with tool/agent stacks |
| Policy compiler | **Python + structured schema + deterministic compiler** | Natural-language policy → formal policy |
| Formal/deterministic checking | **Python policy engine; formal solver adapter** | Rule enforcement |
| API framework | **FastAPI for ML/security services; TypeScript service/API layer for SDK/backend** | Service boundaries |
| Runtime | **Node.js 24 LTS + Python 3.12+** | TypeScript/Python services |
| Database | **PostgreSQL 18** | Durable application state |
| Event stream / fast state | **Redis Streams** | Trajectory/event processing |
| Blockchain client | **viem** | EVM interaction |
| Contract development | **Foundry** | Solidity testing/build/deployment |
| Test chain | **Base Sepolia** | V1 blockchain network |
| Production chain path | **Base first; additional chain adapters later** | Production roadmap |
| Payment rail | **x402 + USDC** | Agent-native demo payment |
| Smart account | **ERC-4337-compatible smart-account architecture** | Constrained execution |
| Simulation | **Deterministic chain simulation / eth_call / local fork tooling** | Pre-execution validation |
| Attestation | **Solidity registry contract + Merkle commitments** | Tamper-evident proof |
| Observability | **OpenTelemetry** | Traces, metrics, logs |
| Package management | **pnpm workspaces** + Python `uv`/virtual environments | Monorepo management |
| Validation | **TypeScript Zod + Pydantic** | Shared runtime validation |
| Testing | **Vitest / Playwright / Pytest / Foundry tests** | Unit/integration/e2e/contract tests |
| CI | **GitHub Actions** | Build/test/security checks |
| Local environment | **Docker Compose** | PostgreSQL/Redis/service orchestration |

---

# 3. Language Strategy

## 3.1 TypeScript

TypeScript is the primary language for the **product-facing SDK and backend control plane**.

Use it for:

- SentinelPay SDK
- public SDK interfaces
- API gateway/control plane
- policy and decision orchestration
- execution interfaces
- transaction request/response contracts
- EVM adapters
- x402 integration
- dashboard
- MCP integration where appropriate
- shared TypeScript schemas

Why:

- The customer-facing SDK must be easy to adopt from modern agent/backend applications.
- TypeScript gives strong static types for security-sensitive request/response contracts.
- `viem` is a TypeScript interface for Ethereum designed around type safety, composability, and lightweight EVM primitives. citeturn455086search0turn455086search11

---

## 3.2 Python

Python is the primary language for **AI/ML and security-intelligence services**.

Use it for:

- Intent Agent
- model inference adapters
- threat detection
- semantic intent verification
- reputation/risk feature computation
- anomaly detection
- provenance/EIS analysis
- policy-language processing
- evaluation pipelines
- offline attack datasets

This keeps model experimentation and ML tooling productive without coupling the public SDK to Python.

---

## 3.3 Solidity

Solidity is used only where blockchain execution or immutable on-chain state requires it.

Use it for:

- SentinelPay Attestation Registry
- smart-account-related contracts where required
- optional payment/capability controls
- test-only security contracts

Avoid putting complex business logic on-chain unless the logic must be trustless or externally verifiable.

---

# 4. Runtime Baseline

## Node.js

Use **Node.js 24 LTS** as the project baseline rather than the current release line. Node's official distribution currently lists Node.js 24 as an LTS release and Node.js 26 as the current release. citeturn455086search1turn455086search2

Pin the exact patch version in the repository's toolchain configuration when the project is initialized.

## Python

Use **Python 3.12+** for ML/security services.

Python services should use isolated virtual environments and a lockfile-driven dependency workflow.

---

# 5. AI / ML Stack

## 5.1 Model Strategy

### Primary direction

Use the **Qwen model family behind a model-provider abstraction**.

Do **not** hard-code a specific model checkpoint into the SentinelPay architecture.

The repository must define:

```text
ModelProvider
  ├── QwenProvider
  ├── HostedProvider (optional)
  ├── GeminiProvider (optional)
  └── FutureProvider
```

The first internal implementation should benchmark one suitable Qwen checkpoint for:

- structured output
- tool calling
- long-context handling
- instruction following
- prompt-injection resilience
- latency
- local inference feasibility

The selected checkpoint is then pinned in a model manifest/config rather than becoming part of the SDK's public contract.

### Why open-model first

The product is an SDK intended for companies. Some customers will require:

- self-hosting
- data-control options
- deployment inside private networks
- model substitution
- predictable inference boundaries

Therefore the architecture must allow local or private inference.

---

## 5.2 Agent Framework

### Core decision

**Do not make the SentinelPay SDK dependent on a single agent framework.**

The customer may use:

- Google ADK
- LangGraph
- another agent framework
- a custom orchestration loop
- an MCP-based agent

Google ADK remains useful for our own reference agent because it supports agent tooling and multi-agent workflows, and its current documentation covers Python, JS, Go, Java, and Kotlin variants. citeturn455086search4turn455086search5

But ADK is an **adapter/integration option**, not the core SentinelPay runtime.

Architecture:

```text
Customer Agent
   │
   ├── Google ADK adapter
   ├── LangGraph adapter
   ├── MCP adapter
   └── Custom adapter
         │
         ▼
   SentinelPay SDK
```

---

## 5.3 AI Agent Components

### Intent Agent

Python service.

Responsibilities:

- interpret human task
- identify purpose
- extract financial constraints
- identify desired autonomy
- normalize ambiguous requirements
- produce `Intent`

### Agent Brain

Python service/runtime.

Responsibilities:

- planning
- tool selection
- search/research
- comparison
- action proposal

### Security Intelligence

Separate Python service boundary.

Responsibilities:

- intent verification
- prompt-injection/threat analysis
- reputation feature interpretation
- anomaly detection
- risk intelligence
- explanation generation

The security intelligence service may use models, but **it does not authorize money movement**.

---

# 6. Policy / Constitution Stack

The company-facing configuration is called the **Agent Constitution**.

Example:

```text
Maximum single payment: $100
Daily spending limit: $500
Unknown recipient: human approval
Allowed assets: USDC
Blocked categories: gambling
Allowed networks: Base
```

## Policy processing

Use a two-stage architecture:

```text
Natural-language policy
        ↓
Semantic extraction
        ↓
Structured policy object
        ↓
Deterministic compiler
        ↓
Policy invariants
        ↓
Policy engine
```

The LLM is used to understand language.

The compiled rule is enforced deterministically.

This preserves a central VeriGuard design principle: the probabilistic model should not be the final authority for enforcement. The original PRD explicitly separated semantic extraction from deterministic formal enforcement. fileciteturn0file0L116-L140

---

# 7. Deterministic Policy / Formal Verification

The policy system should support an abstraction layer for formal checking.

### V1

Implement deterministic policy checks for:

- single-payment limits
- cumulative spending limits
- recipient allowlists
- blocked recipients
- asset allowlists
- network allowlists
- approval thresholds
- temporal restrictions
- required predecessor events
- transaction structuring detection

### Formal solver adapter

The architecture should expose:

```text
PolicyChecker
  ├── DeterministicRuleChecker
  └── FormalSolverChecker
```

A formal solver can be integrated as the policy language grows. The original VeriGuard PRD proposed Z3 for bounded-trace formal checking, so that remains the preferred formal-method direction for future expansion. fileciteturn0file0L438-L443

Do not force all V1 policy checks through a heavyweight solver if a deterministic rule is sufficient.

---

# 8. Backend Stack

## API / Orchestration

Use a hybrid backend:

### TypeScript control plane

Responsible for:

- SDK APIs
- authentication/context
- agent registration
- policy registration
- approval workflow
- decision orchestration
- execution request lifecycle
- audit endpoints

### Python services

Responsible for:

- model inference
- AI security analysis
- policy language processing
- risk/anomaly intelligence
- provenance analysis

This separation keeps the public product surface strongly typed while allowing ML services to evolve independently.

---

## 8.1 FastAPI

Use **FastAPI** for Python microservices.

Typical services:

```text
services/
  intent-service
  security-service
  policy-service
  provenance-service
```

FastAPI should not become the entire backend; it is the Python service framework only.

---

# 9. Database

## PostgreSQL

Use **PostgreSQL 18** as the primary durable database. PostgreSQL 18 is the current major release as of August 2026. citeturn676300search0turn676300search6

Store:

- organizations
- agents
- constitutions
- policies
- policy versions
- intents
- action proposals
- security assessments
- approval requests
- execution records
- transaction metadata
- audit metadata
- model versions
- threat signals
- reputation snapshots
- attestation references

Do **not** store private keys in PostgreSQL.

---

# 10. Redis

Use **Redis Streams** for the real-time trajectory/event pipeline.

Redis Streams are append-oriented event structures with consumer groups and replay semantics, which fits trajectory/event processing and inter-service coordination. citeturn676300search4turn676300search11

Use Redis for:

- live trajectory events
- approval notifications
- short-lived execution state
- job coordination
- rate limiting
- ephemeral security context

PostgreSQL remains the source of durable business state.

Redis is not the canonical audit database.

---

# 11. Event / Trajectory Architecture

Every significant agent action should produce a typed event.

```text
Agent Action
    ↓
Trajectory Event
    ↓
Redis Stream
    ↓
Policy / Security / Audit consumers
    ↓
PostgreSQL + Merkle commitment
```

Minimum trajectory event types:

```text
INTENT_CREATED
TOOL_CALL
TOOL_RESULT
EXTERNAL_CONTENT_RECEIVED
MEMORY_READ
MEMORY_WRITE
ACTION_PROPOSED
POLICY_CHECKED
SECURITY_ASSESSED
SIMULATION_REQUESTED
SIMULATION_COMPLETED
APPROVAL_REQUESTED
APPROVAL_GRANTED
APPROVAL_DENIED
EXECUTION_SUBMITTED
EXECUTION_CONFIRMED
EXECUTION_FAILED
ATTESTATION_WRITTEN
```

---

# 12. Validation and Shared Schemas

## TypeScript

Use **Zod** for runtime validation of public API and SDK inputs/outputs.

## Python

Use **Pydantic** for service-side request/response models.

## Canonical schemas

The cross-language contracts must be defined explicitly.

Core objects:

```text
Intent
AgentConstitution
Policy
PolicyVersion
TrajectoryEvent
ActionProposal
SecurityAssessment
ReputationAssessment
RiskAssessment
TransactionRequest
SimulationResult
ApprovalRequest
ExecutionRequest
ExecutionResult
VerifiedReceipt
AuditRecord
Attestation
```

The canonical schema definitions should live in a shared package or schema directory and must not be independently reinvented by each service.

---

# 13. Blockchain Stack

## 13.1 V1 Chain

### Base Sepolia

Use **Base Sepolia** as the first blockchain implementation target.

The test network is a natural fit because the reference x402 network configuration currently includes Base Sepolia as `eip155:84532`. citeturn455086search3

The original VeriGuard PRD also selected Base as the demo chain, so this keeps continuity while moving the product toward an agent-payment use case. fileciteturn0file0L452-L457

V1 progression:

```text
Base Sepolia
    ↓
Base Mainnet
    ↓
Additional chain adapters
```

The SDK must not hard-code Base-only abstractions.

---

## 13.2 EVM Client

Use **viem** as the primary EVM TypeScript library.

Viem provides low-level, type-safe, composable Ethereum primitives and supports Base through its chain definitions. citeturn455086search0turn455086search10

Use viem for:

- RPC access
- transaction preparation
- contract reads/writes
- ABI encoding/decoding
- typed data
- chain interaction
- receipt retrieval

Avoid introducing both `ethers` and `viem` for the same job unless a specific external dependency requires it.

---

# 14. Smart Account / Account Abstraction

Use an **ERC-4337-compatible smart-account architecture**.

ERC-4337 models account-abstraction actions as `UserOperation`s and provides a framework for programmable smart-contract accounts and validation. citeturn676300search12

The security goal is:

```text
AI Agent
   ↓
SentinelPay Capability / Authorization
   ↓
Smart Account
   ↓
Allowed operation
```

Not:

```text
AI Agent
   ↓
Raw private key
   ↓
Unlimited wallet
```

The V1 implementation should keep signing authority outside the model's reasoning context and enforce spending/capability boundaries at the execution boundary.

---

# 15. Payment Rail — x402

Use **x402 + USDC** as the reference machine-to-machine payment path.

Current x402 network support includes:

- Base
- Base Sepolia

and lists USDC as the configured EVM default asset for these networks. citeturn455086search3

Reference flow:

```text
Agent needs service
      ↓
Service requests payment
      ↓
x402 payment requirement
      ↓
SentinelPay firewall
      ↓
Transaction validation
      ↓
Human approval if policy requires
      ↓
Smart-account payment
      ↓
Service response
```

x402 is an **execution/payment adapter**, not the security layer itself.

---

# 16. Transaction Construction and Decoding

Use deterministic TypeScript code for transaction construction and decoding.

Components:

```text
TransactionBuilder
TransactionDecoder
TransactionValidator
TransactionPolicyAdapter
```

The decoder must determine what the actual transaction requests, including:

- chain
- sender
- recipient
- contract
- function selector/function
- parameters
- token
- amount
- approvals
- state-changing operations

The LLM's verbal description is never treated as sufficient evidence of what will execute.

---

# 17. Transaction Simulation

Transaction simulation is **not an LLM task**.

Use deterministic blockchain simulation.

Primary mechanisms:

- RPC `eth_call`
- state overrides where supported
- local chain forks for deeper testing
- trace tooling where available

The output must describe:

```text
Simulation status
Revert reason
Expected state changes
Balance changes
Token transfers
Contract interactions
Gas estimate
```

The security decision uses simulation results as evidence.

---

# 18. Local Blockchain Development

Use **Foundry** for smart-contract development and chain testing.

Use:

```text
forge  → build/test/contracts
anvil  → local EVM chain
cast   → RPC/transaction/debugging utilities
```

The purpose is to allow the team to reproduce dangerous transactions locally without depending on a live testnet.

---

# 19. Attestation / Proof Layer

Use:

- SHA-256 or Keccak-based commitments as appropriate
- Merkle tree construction
- Solidity Attestation Registry
- Base Sepolia for V1 publication

A successful or blocked decision should produce an auditable commitment containing references such as:

```text
agent_id
policy_version_hash
intent_id
trajectory_root
security_assessment_hash
transaction_hash (when applicable)
decision
timestamp
```

The chain should record **proof/commitment metadata**, not private or unnecessarily large raw trajectory data.

The original VeriGuard PRD established the same principle: the registry records policy/trajectory commitments and decision evidence while keeping the registry out of the funds path. fileciteturn0file0L193-L208

---

# 20. Merkle / Audit Architecture

```text
Trajectory Events
      ↓
Canonical serialization
      ↓
Event hashes
      ↓
Merkle root
      ↓
Attestation transaction
      ↓
Base Sepolia registry
```

Raw trajectory data stays in the application data plane.

The blockchain acts as the public proof/commitment layer.

---

# 21. Frontend / Dashboard

## Next.js + React + TypeScript

Use **Next.js** for the dashboard and demo application. Next.js is a React framework for full-stack web applications, and its App Router is the current modern routing model in the official documentation. citeturn676300search1

Use:

- App Router
- React
- TypeScript
- server-side capabilities where useful
- client components only where interactive state requires them

---

## Styling

Use:

- Tailwind CSS
- shadcn/ui or an equivalent minimal component layer

Security dashboard principles:

- dark-first
- clear PASS / BLOCK states
- progressive disclosure
- technical details available without overwhelming default views

This preserves the original VeriGuard dashboard direction. fileciteturn0file0L332-L369

---

# 22. Real-Time UI

Use **Server-Sent Events (SSE)** for one-way trajectory/security event streaming in V1.

Flow:

```text
Agent / services
     ↓
Event bus
     ↓
Backend SSE endpoint
     ↓
Dashboard
```

Move to WebSockets only if bidirectional real-time behavior becomes necessary.

---

# 23. Observability

Use **OpenTelemetry** as the instrumentation standard.

OpenTelemetry supports traces, metrics, logs, and baggage and is vendor-neutral. citeturn676300search5turn676300search15

Instrument:

- agent requests
- model inference
- policy compilation
- policy checks
- security assessments
- reputation queries
- simulations
- approval flow
- transaction submission
- confirmation latency
- attestation writes

Every transaction should be traceable across services with one correlation ID.

---

# 24. Logging

Use structured JSON logs.

Every log should include, when applicable:

```text
request_id
trace_id
organization_id
agent_id
intent_id
proposal_id
transaction_id
policy_version
service
severity
timestamp
```

Never log:

- private keys
- seed phrases
- raw secrets
- authentication tokens
- sensitive user content unless explicitly required

---

# 25. Authentication and Secrets

## Authentication

The first version can use:

- standard application authentication for the dashboard
- wallet signatures when cryptographic identity is needed
- organization-scoped API keys for SDK/service authentication

## Secrets

Use environment variables locally and a real secrets manager in deployed environments.

Never:

```text
commit private keys
commit seed phrases
commit production RPC credentials
commit API secrets
```

For demos, use dedicated low-value test wallets only.

---

# 26. SDK Stack

The SDK is the **actual product**.

## Primary SDK

### TypeScript SDK

```text
@sentinelpay/sdk
```

Responsibilities:

- initialize SentinelPay
- register agent
- load constitution
- submit intent
- submit action proposal
- request security assessment
- request approval
- prepare execution
- execute payment
- retrieve verification result
- retrieve audit/attestation

Example conceptual API:

```ts
const sentinel = createSentinelPay({
  apiKey,
  environment: "testnet"
});

const result = await sentinel.payment.request({
  intent,
  recipient,
  amount,
  asset,
  chain
});
```

The actual public API should be designed from the shared schemas, not invented separately by the demo application.

---

# 27. Python SDK / Adapter

A Python package may be provided for direct Python-agent integration:

```text
sentinelpay-python
```

This should wrap the same backend/security contract rather than implement a second independent policy engine.

---

# 28. MCP Integration

Use **MCP** as an interoperability boundary, not as the sole security mechanism.

SentinelPay should provide:

```text
SentinelPay MCP adapter
```

where suitable so an existing MCP-based agent can route protected tool/action flows through SentinelPay.

The old VeriGuard PRD already defined the trajectory proxy as MCP-compatible and aimed for framework-agnostic integration. fileciteturn0file0L141-L152

The key security boundary remains the SentinelPay authorization/execution boundary, not MCP itself.

---

# 29. Testing Stack

## Python

- Pytest
- property-based tests where useful
- model evaluation datasets
- security attack fixtures

## TypeScript

- Vitest
- integration tests
- contract/API schema tests

## Browser

- Playwright

## Solidity

- Foundry tests
- invariant/property tests where practical

---

# 30. Security Testing

The security test suite must include:

### Prompt / context attacks

- hidden instruction in tool output
- malicious web content
- malicious API response
- prompt injection in retrieved documents
- instruction hierarchy manipulation

### Financial attacks

- amount manipulation
- recipient substitution
- asset substitution
- chain substitution
- split-payment/structuring attack
- repeated-payment attack
- approval abuse
- replay attack

### Blockchain attacks

- malicious contract
- unexpected calldata
- approval to wrong spender
- unlimited approval
- token-transfer mismatch
- simulation/runtime mismatch

### Behavioral attacks

- abnormal spend spike
- rapid transaction burst
- new recipient
- new contract
- unusual time-of-day activity

### Provenance attacks

- repeated duplicate alerts
- false source independence
- missing provenance
- manipulated source metadata

---

# 31. Monorepo Tooling

## JavaScript/TypeScript package manager

Use **pnpm workspaces**.

Why:

- good monorepo support
- shared dependencies
- workspace linking
- fast installs

## Python package management

Use **uv** with lockfile-driven environments where practical.

## Formatting / linting

Use:

```text
TypeScript → ESLint + Prettier
Python     → Ruff + Black-compatible formatting policy
Solidity   → forge fmt
```

The exact formatter configuration should be centralized in the repository.

---

# 32. Repository Technology Layout

```text
sentinelpay/
│
├── apps/
│   ├── dashboard/              # Next.js
│   └── demo-agent/             # reference agent
│
├── packages/
│   ├── sdk/                    # public TypeScript SDK
│   ├── schemas/                # canonical shared contracts
│   ├── client/                 # generated/API client helpers
│   └── config/                 # shared config/types
│
├── services/
│   ├── core/                   # TypeScript control plane
│   ├── intent/                 # Python AI service
│   ├── security/               # Python security intelligence
│   ├── policy/                 # Python policy/compiler service
│   └── provenance/              # Python EIS/provenance service
│
├── blockchain/
│   ├── contracts/              # Solidity
│   ├── sdk/                    # chain adapters
│   ├── execution/              # transaction execution
│   └── scripts/
│
├── tests/
│   ├── fixtures/
│   ├── attacks/
│   ├── integration/
│   └── e2e/
│
├── infra/
│   ├── docker/
│   ├── local/
│   └── ci/
│
├── docs/
│
├── IDEA.md
├── SYSTEM_ARCHITECTURE.md
├── IMPLEMENTATION.md
├── TECH_STACK.md
└── package.json
```

---

# 33. Local Development Infrastructure

Use Docker Compose for:

```text
PostgreSQL
Redis
optional local services
```

Use Anvil for the local EVM development chain.

Recommended local flow:

```text
Docker Compose
   ├── PostgreSQL
   └── Redis

Anvil
   └── local EVM

Python services
Node services
Next.js dashboard
```

This lets the whole system run locally without depending on Base Sepolia for every test.

---

# 34. Environment Tiers

## Local

```text
LOCAL
├── local LLM or test model
├── PostgreSQL
├── Redis
├── Anvil
└── fake/test payment adapter
```

## Testnet

```text
TESTNET
├── approved model provider
├── PostgreSQL
├── Redis
├── Base Sepolia
├── USDC test asset
└── real x402 flow
```

## Production roadmap

```text
PRODUCTION
├── managed inference or private model deployment
├── production PostgreSQL
├── production Redis/event infrastructure
├── Base mainnet first
├── real USDC
├── production smart accounts
└── additional chain/payment adapters
```

Mainnet execution must be explicitly opt-in and must never be inferred simply because a production wallet exists.

---

# 35. Technology Decisions We Are Explicitly NOT Making

## No single-model dependency

Not permanently locked to Qwen, Gemini, OpenAI, or any other model.

## No single-agent-framework dependency

Not permanently locked to ADK, LangGraph, CrewAI, or another framework.

## No ethers + viem duplication

Use viem as the default EVM client unless a specific integration requires otherwise.

## No direct LLM wallet authority

A model cannot possess unrestricted signing authority.

## No LLM-only policy enforcement

Policy authorization must be deterministic after compilation.

## No LLM transaction simulation

Simulation must use actual chain semantics.

## No Base-specific public SDK

Base is V1 implementation infrastructure, not the product abstraction.

## No blockchain storage of complete raw traces

Store compact commitments on-chain; keep detailed traces off-chain in durable storage.

---

# 36. Technology Boundaries

The following boundaries are mandatory.

### AI boundary

```text
AI may:
- interpret
- reason
- classify
- recommend
- detect
- explain

AI may not:
- bypass policy
- directly authorize money
- directly modify immutable platform rules
- decide that simulation passed without actual simulation
```

### Backend boundary

```text
Backend may:
- orchestrate
- enforce
- persist
- request execution

Backend may not:
- secretly bypass policy for convenience
- assume a proposal is safe because an agent produced it
```

### Blockchain boundary

```text
Blockchain layer must:
- construct
- decode
- simulate
- execute
- verify receipts

Blockchain layer must not:
- interpret user intent using an LLM
```

---

# 37. V1 Reference Stack

The concrete first implementation should therefore be:

```text
                    SENTINELPAY V1

Frontend:
  Next.js + React + TypeScript

Public SDK:
  TypeScript

Control Plane:
  Node.js 24 LTS + TypeScript

AI / ML:
  Python 3.12+
  Qwen-family model via provider abstraction

Agent Framework:
  Framework-agnostic core
  Optional Google ADK reference adapter

Agent Protocol:
  MCP adapter

AI Services:
  FastAPI + Pydantic

Policy:
  Structured policy compiler
  Deterministic policy engine
  Formal solver adapter

Data:
  PostgreSQL 18
  Redis Streams

Blockchain:
  Base Sepolia
  viem
  Foundry
  Solidity

Execution:
  ERC-4337-compatible smart-account path
  x402 + USDC

Simulation:
  eth_call + local fork / deterministic tooling

Attestation:
  Merkle commitment + Solidity registry

Observability:
  OpenTelemetry

Testing:
  Pytest
  Vitest
  Playwright
  Foundry tests

Infrastructure:
  Docker Compose locally
  GitHub Actions CI
```

---

# 38. Why This Stack Fits the SentinelPay Product

The stack deliberately separates responsibilities:

```text
Qwen / AI models
       ↓
Reasoning + Intelligence
       ↓
Python security services
       ↓
SentinelPay control plane
       ↓
Deterministic policy
       ↓
Blockchain validation
       ↓
Smart-account execution
       ↓
x402 / payment rail
       ↓
Verified receipt
       ↓
Attestation + audit
```

This is exactly the trust model we want:

> **The model can be replaceable. The policy can be versioned. The execution can be simulated. The decision can be audited. The payment can be verified.**

---

# 39. Relationship to the Original VeriGuard Stack

The initial VeriGuard PRD proposed Next.js, Node.js/Fastify, Python/FastAPI, Redis Streams, PostgreSQL, Solidity, Base, MCP, a policy compiler, Z3, Merkle commitments, and an on-chain registry. fileciteturn0file0L418-L467

SentinelPay keeps the strongest parts of that foundation but changes the product center of gravity:

```text
VERIGUARD
  Agent Safety / Formal Policy / EIS / Attestation
                ↓
SENTINELPAY
  Agent Safety
       +
  Agentic Payment
       +
  Transaction Intelligence
       +
  Smart Account Execution
       +
  x402
       +
  SDK-first integration
```

The original technology choices should therefore be treated as useful context, not immutable constraints.

---

# 40. Kiro Instructions

When implementing from this document:

1. Prefer the listed technology rather than introducing a new framework without a documented reason.
2. Keep all public contracts typed and versioned.
3. Do not place private keys in model context or ordinary application memory.
4. Never let an LLM directly call the final wallet signing primitive.
5. Keep blockchain execution deterministic and independently testable.
6. Keep policy enforcement deterministic after compilation.
7. Keep the SDK independent of a specific agent framework.
8. Keep chain logic behind adapters.
9. Keep model logic behind provider interfaces.
10. Keep raw audit details off-chain and commitments on-chain.
11. Preserve the ability to run the full system locally.
12. Add tests before replacing security-sensitive behavior.
13. Do not change a core boundary merely to make the demo easier.
14. When a technology choice becomes obsolete, update this document and the implementation plan together rather than silently changing the stack.

---

# 41. Final Technology Principle

SentinelPay is not a single AI model, a single blockchain, or a single agent framework.

It is a **technology-independent security and execution layer** around autonomous financial agents.

The first implementation is intentionally concrete:

```text
Qwen-family model
        +
Python AI/security
        +
TypeScript control plane/SDK
        +
PostgreSQL + Redis
        +
viem + Foundry
        +
Base Sepolia
        +
ERC-4337 smart account
        +
USDC/x402
        +
Solidity attestation registry
        +
OpenTelemetry
```

But the public architecture remains:

```text
             ANY AGENT
                 │
                 ▼
          SENTINELPAY SDK
                 │
        ┌────────┼────────┐
        ▼        ▼        ▼
      POLICY  SECURITY  EXECUTION
        │        │        │
        └────────┼────────┘
                 ▼
          VERIFIED PAYMENT
```

**The implementation stack is replaceable. The security boundaries are not.**
