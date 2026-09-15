# SentinelPay — Backend / Sentinel Core

The **deterministic control plane** of SentinelPay. It sits between the AI/ML
subsystem and the Blockchain/Execution subsystem and turns a probabilistic agent's
proposed financial action into a deterministic, policy-enforced, auditable
authorization decision.

> **AI may recommend. Deterministic systems authorize.**
>
> The Core does not decide what the AI thinks. The Core decides what the AI is
> allowed to cause.

This is **Person 3's** subsystem. Physical root: `Orvex/Backend/`. Canonical specs:
`Orvex/Backend/Docs/` (8 documents) and `Orvex/Docs/CONTRACTS.md`.

---

## What Sentinel Core IS

The trusted authority boundary. Given an `ActionProposal` (from the agent) and a
`SecurityAssessment` (from Security Intelligence), the Core:

1. authenticates the caller and resolves the tenant,
2. validates agent / intent / capability / constitution,
3. evaluates the **deterministic policy engine**,
4. compares the concrete transaction against the proposal (transaction gate),
5. binds and checks **simulation**,
6. produces exactly one decision: **ALLOW / REVIEW / DENY**,
7. requires **human approval** when policy demands it,
8. performs **final revalidation**, reserves budget, and emits an authorized
   **ExecutionRequest**,
9. consumes the **ExecutionResult** + **ReceiptVerification**, commits/releases
   financial state, and writes the **audit** trail + **attestation** payload.

## What the Core OWNS

Company/tenant · agent registry · agent Constitution · capabilities · policy
lifecycle · deterministic policy engine · trajectory ingestion/state · security
orchestration · transaction gate · decision engine · approval engine · execution
gate · financial reservations/limits · idempotency · concurrency control · audit ·
attestation coordination · Core APIs · service authentication · observability.

## What the Core CONSUMES

- From **AI/ML** (`Orvex/ML/`, over HTTP): `Intent`, `ActionProposal`,
  `TrajectoryEvent`, `Evidence`, `SecurityAssessment` — all **advisory**, never
  authority.
- From **Blockchain/Execution** (`Orvex/Blockchain/`, over HTTP, via adapter):
  `TransactionAnalysis`, `SimulationResult`, `ExecutionResult`,
  `ReceiptVerification`, `AttestationResult`.

## What the Core DOES NOT OWN

Foundation-model training · agent reasoning · threat/risk/anomaly model training ·
private-key storage · smart-account internals · raw RPC · transaction building ·
signing · broadcasting. The Core never holds a private key and never broadcasts a
transaction.

---

## Non-negotiable security invariants

- AI output can never directly authorize execution.
- External content / tool output / memory can never create or override authority.
- Risk/reputation scores can never override a hard policy violation.
- Human approval can never make an invalid technical transaction valid.
- A materially changed transaction invalidates dependent simulation/approval.
- Unknown execution state is reconciled, never blindly retried.
- Duplicate execution is prevented via idempotency.
- Financial limits are protected against race conditions.
- Wrong chain / expired capability / expired approval → no execution.
- Security-critical uncertainty **fails closed**.

---

## Technology

TypeScript · Node.js 24 LTS · Fastify · Zod · PostgreSQL · Prisma · Redis /
Redis Streams · OpenTelemetry · Vitest. Financial amounts use exact decimal/integer
semantics — never floating point.

## How the AI subsystem connects

The Core calls the AI service (`Orvex/ML/`, FastAPI) through a typed AI client
(`src/application/clients/ai/`) with service authentication. The Core validates
every AI response against the shared contracts and treats it as intelligence only.

## How the Blockchain subsystem connects

The Core sends an authorized `ExecutionRequest` to the Execution service through a
typed execution client (`src/application/clients/execution/`). Until Person 4's
implementation exists, a **clearly-labeled deterministic mock adapter** is used
behind the same interface. Mocks never broadcast real transactions and never claim
to be real blockchain results.

---

## Directory layout

```
Orvex/Backend/
├── Docs/                 8 canonical backend specs
├── src/
│   ├── api/              routes, controllers, middleware, openapi
│   ├── domain/           companies, agents, capabilities, constitutions,
│   │                     policies, intents, proposals, decisions, approvals,
│   │                     executions, financial-state
│   ├── application/      orchestrator, services, clients (ai/execution/…), workers
│   ├── policy/           deterministic engine, rules, evaluator, versioning
│   ├── trajectory/       ingestion, processor, hashing, queries
│   ├── security/         security orchestrator
│   ├── decision/         deterministic decision engine
│   ├── approval/         human approval engine
│   ├── execution-gate/   final revalidation + execution request
│   ├── audit/            audit + attestation coordination
│   ├── repositories/     tenant-scoped data access
│   ├── events/           internal event bus / consumers
│   ├── config/           typed configuration
│   └── shared/           errors, logging, telemetry, TS/Zod contract schemas
├── db/                   prisma schema + migrations + fixtures
├── tests/                unit, contract, integration, security, property, e2e
└── scripts/
```

---

## Running locally

> Phases 0–1 establish the foundation. Full run requires PostgreSQL + Redis (Phase 1+).

```bash
cd Orvex/Backend
npm install
npm test          # Vitest
npm run dev       # Fastify (added in Phase 1)
```

Configuration is environment-driven (`.env.example`). Secrets are never printed or
committed. Default environment targets **Base Sepolia**; mainnet is disabled and
must be explicitly enabled.

---

## Implementation status

Built strictly in the phase order of `Docs/IMPLEMENTATION_PLAN_BACKEND.md`:

- [x] **Phase 0** — Repository alignment & baseline
- [ ] Phase 1 — Backend foundation / tooling
- [ ] Phase 2 — Shared contracts (TS/Zod mirror of CONTRACTS.md)
- [ ] Phases 3–21 — authority, policy, trajectory, orchestration, decision,
      approval, execution gate, verification, audit, SDK, red-team, real
      execution, E2E, hardening, acceptance.
