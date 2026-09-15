# SentinelPay — API & External Credentials

**Document role:** canonical external-service/API and secret inventory for the SentinelPay monorepo.

**Status:** V1 baseline

**Purpose:** This document defines every external API, credential, token, secret, RPC endpoint, signing credential, and service integration that SentinelPay may require during development, demo operation, and future production deployment.

**Important:** not every item below is required on day one. The document separates **required for the V1 reference demo**, **optional**, and **production/customer-supplied** credentials so Kiro does not invent unnecessary dependencies.

---

# 1. API/Secret Philosophy

SentinelPay is an SDK-first product. External providers must sit behind adapters and must never become implicit architectural dependencies.

Rules:

1. API keys belong in server-side environment/secrets management only.
2. No API key, private key, seed phrase, access token, client secret, or provider credential may be committed to Git.
3. Browser/client code must never receive server-side provider secrets.
4. Provider-specific code must live behind an adapter.
5. A missing optional provider must degrade gracefully or disable only the feature that depends on it.
6. A missing required security/execution dependency must fail closed rather than silently bypass protection.
7. Customer credentials and SentinelPay infrastructure credentials are different trust domains.
8. Agent models must never receive raw API keys or private signing credentials in model context.
9. Testnet credentials and mainnet credentials must be separate.
10. Production secrets must use a managed secrets system rather than a plain `.env` file.

---

# 2. V1 Reference External Services

For the first complete demo, the intended minimum external integrations are:

```text
Qwen / Model Provider
        ↓
SentinelPay AI services
        ↓
Alchemy Base Sepolia RPC
        ↓
Base Sepolia blockchain
        ↓
USDC / smart-account execution
        ↓
x402 payment flow
```

A web research/search provider is recommended for the autonomous Agent Brain demo, but is intentionally pluggable.

The dashboard may optionally use GitHub authentication, but GitHub is not part of the core payment-security path.

---

# 3. Credential Classification

| Credential / Config | Required V1? | Secret? | Owner | Used By |
|---|---:|---:|---|---|
| `QWEN_API_KEY` | **Yes if using hosted Qwen inference** | Yes | AI/ML | Agent + security models |
| `ALCHEMY_API_KEY` | **Yes for reliable Base Sepolia RPC** | Yes | Blockchain | RPC, reads, simulation helpers |
| `BASE_SEPOLIA_RPC_URL` | **Yes** | Usually contains provider credential | Blockchain | Chain adapter |
| `BASE_SEPOLIA_CHAIN_ID` | **Yes** | No | Blockchain | Chain validation |
| `BASE_SEPOLIA_USDC_ADDRESS` | **Yes** | No | Blockchain | Payment adapter |
| `AGENT_EXECUTION_SIGNER` / signer reference | **Yes for signed testnet execution** | **Critical secret** | Blockchain | Executor |
| `ATTESTATION_CONTRACT_ADDRESS` | **Yes after deployment** | No | Blockchain | Attestation writer |
| `X402_*` configuration | **Needed for x402 demo** | May include secrets depending on settlement/client setup | Blockchain | x402 adapter |
| `MODEL_API_KEY` | Optional abstraction alias | Yes | AI/ML | Model provider interface |
| `GEMINI_API_KEY` | Optional | Yes | AI/ML | Gemini adapter / optional ADK path |
| `OPENAI_API_KEY` | Optional | Yes | AI/ML | Optional model/evaluation adapter |
| `OPENROUTER_API_KEY` | Optional | Yes | AI/ML | Optional multi-model routing |
| `SEARCH_API_KEY` / provider-specific key | Optional but likely needed for web-research demo | Yes | AI/ML | Research agent |
| `GITHUB_CLIENT_ID` | Optional dashboard auth | No/low sensitivity | Backend | GitHub OAuth |
| `GITHUB_CLIENT_SECRET` | Optional dashboard auth | **Yes** | Backend | GitHub OAuth |
| `GITHUB_OAUTH_REDIRECT_URI` | Optional | No | Backend | GitHub OAuth |
| `DATABASE_URL` | **Yes** | Contains credential in deployed environments | Backend | PostgreSQL |
| `REDIS_URL` | **Yes** | May contain credential | Backend | Redis Streams |
| `SENTINELPAY_API_KEY` | **Yes for SDK authentication** | **Yes** | Backend | SDK/API gateway |
| `INTERNAL_SERVICE_TOKEN` | Recommended | **Yes** | Backend | service-to-service authentication |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional | No | Backend | Observability |
| `OTEL_EXPORTER_OTLP_HEADERS` | Optional | **Yes** if provider requires auth | Backend | Observability |

---

# 4. Qwen / AI Model Credentials

## 4.1 Primary V1 model credential

### `QWEN_API_KEY`

Use when SentinelPay calls hosted Qwen inference through Alibaba Cloud Model Studio / DashScope.

Alibaba Cloud's current documentation says Qwen API access requires an API key and that the key can be supplied through an environment variable; the endpoint/base URL varies by region. citeturn745404search1turn745404search13

### Required related configuration

```env
MODEL_PROVIDER=qwen
QWEN_API_KEY=
QWEN_BASE_URL=
QWEN_MODEL=
```

Do **not** hard-code a region-specific endpoint into application logic. `QWEN_BASE_URL` should be configuration because the provider documents regional endpoints. citeturn745404search7turn745404search14

### Used by

- Intent Agent
- Agent Brain
- Intent Verification model
- Threat Detection model where enabled
- Risk/Anomaly model where model inference is used
- Policy semantic extraction

### Security rule

The Qwen API key must never be exposed to the browser or included in an Action Proposal, model prompt, trajectory event, or audit record.

---

# 5. Optional Gemini Credentials

## `GEMINI_API_KEY`

Gemini is **not required for the core V1 architecture**, but the model abstraction may support Gemini as an alternative provider or for benchmarking.

Google's current Gemini documentation requires an API key for Gemini API requests and recommends using environment variables/server-side secret handling. citeturn191094search0turn191094search1

If enabled:

```env
MODEL_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=
```

Do not put `GEMINI_API_KEY` into frontend environment variables.

Google's current documentation also distinguishes newer authorization keys from older unrestricted standard keys; new integrations should follow Google's current key restrictions rather than assuming legacy unrestricted keys are acceptable. citeturn191094search0

---

# 6. Optional OpenAI Credential

## `OPENAI_API_KEY`

This is **not required** for the reference architecture.

It may be useful for:

- evaluation comparisons
- fallback model provider
- benchmark experiments
- customer-configured provider support

If enabled:

```env
OPENAI_API_KEY=
OPENAI_MODEL=
```

OpenAI must remain an optional provider adapter; the SDK must not require OpenAI-specific APIs to function.

---

# 7. Optional OpenRouter Credential

## `OPENROUTER_API_KEY`

This can be used as an optional multi-provider routing layer during experimentation.

```env
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
```

It is **not part of the required V1 execution path**.

If used, the routing layer must preserve the same structured-output and model-provider interface as direct model providers.

---

# 8. Web Research / Search API

The autonomous Agent Brain needs a way to discover external information for the demo scenario. Search should be abstracted behind a `SearchProvider` interface.

Recommended configuration shape:

```env
SEARCH_PROVIDER=
SEARCH_API_KEY=
SEARCH_BASE_URL=
```

The exact provider is intentionally not fixed in the core SDK.

Example adapter shape:

```text
SearchProvider
 ├── TavilySearchProvider
 ├── OtherSearchProvider
 └── MockSearchProvider
```

Rules:

- Search results are **untrusted external data**.
- Search-provider credentials are never sent to the agent.
- Search output must carry provenance metadata.
- The existence of a successful search request must never imply that a result is trustworthy.

---

# 9. Blockchain RPC — Base Sepolia

## `ALCHEMY_API_KEY`

Alchemy provides Base Sepolia RPC endpoints and development tooling. Its current Base Sepolia endpoint is `https://base-sepolia.g.alchemy.com/v2/<api-key>`, with chain ID `84532`. citeturn745404search0turn745404search6

Configuration:

```env
ALCHEMY_API_KEY=
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}
BASE_SEPOLIA_CHAIN_ID=84532
```

Alchemy documents API keys as credentials for JSON-RPC and related APIs. citeturn745404search4turn745404search9

### Used for

- reading blockchain state
- reading balances
- reading transaction receipts
- smart-contract calls
- transaction submission where the selected execution path uses the RPC provider
- simulation helpers
- block/transaction inspection
- contract event listening where applicable

### Important

The code should treat the RPC URL as a configurable chain adapter endpoint. Do not spread Alchemy-specific URL construction throughout the repository.

---

# 10. Base Mainnet

Base mainnet is a **future production target**, not the default demo environment.

Base mainnet uses chain ID `8453`; Base Sepolia uses `84532`. citeturn745404search3turn745404search15

Future configuration:

```env
BASE_MAINNET_RPC_URL=
BASE_MAINNET_CHAIN_ID=8453
```

Mainnet variables must be completely separated from testnet variables.

The demo must not be able to switch from testnet to mainnet merely by changing one casual boolean.

---

# 11. Block Explorer / Blockchain Data API

A block explorer API is useful for:

- human-readable transaction details
- contract metadata when available
- audit links
- optional reputation enrichment
- dashboard explorer integration

This is **not required for the core authorization path**.

The blockchain adapter should work from direct RPC data even if a block explorer API is unavailable.

Optional configuration:

```env
BLOCK_EXPLORER_PROVIDER=
BLOCK_EXPLORER_API_KEY=
BLOCK_EXPLORER_BASE_URL=
```

Do not design security decisions that depend solely on an explorer's centralized API response.

---

# 12. Blockchain Reputation / Risk Data

The Risk Engine may need chain-history data for the exact recipient, contract, token, or account involved in a proposed transaction.

The preferred hierarchy is:

```text
Direct chain/RPC evidence
        ↓
First-party contract/event data
        ↓
Trusted indexed blockchain data
        ↓
Third-party reputation APIs
        ↓
Untrusted public/web claims
```

A third-party blockchain data API may therefore require its own credential, but the architecture must support running without one.

Configuration shape:

```env
CHAIN_DATA_PROVIDER=
CHAIN_DATA_API_KEY=
CHAIN_DATA_BASE_URL=
```

The Risk Engine must distinguish:

```text
observed on-chain fact
```

from:

```text
provider interpretation / risk label
```

Those must not be conflated.

---

# 13. Wallet / Execution Credentials

## 13.1 Most important rule

A raw private key is **not an API key**, but it is a highly sensitive secret and must be handled more strictly than ordinary provider API credentials.

For testnet development, the execution service may use a dedicated low-value signer:

```env
EXECUTION_SIGNER_REFERENCE=
```

or, only in isolated local/testnet development when unavoidable:

```env
TESTNET_PRIVATE_KEY=
```

### Hard rules

- Never commit a private key.
- Never store it in PostgreSQL.
- Never put it into LLM context.
- Never log it.
- Never return it in an API response.
- Never expose it to the browser.
- Never use a real-value wallet for the demo.
- Production should prefer a secure signer/HSM/KMS or smart-account authorization architecture.

The preferred V1 architecture remains:

```text
Agent
  ↓
SentinelPay authorization
  ↓
Smart Account / constrained executor
  ↓
Secure signer
```

not:

```text
Agent
  ↓
raw private key
```

---

# 14. Smart Account / ERC-4337 Credentials

ERC-4337-compatible smart-account infrastructure may require external bundler/paymaster credentials depending on which implementation is selected.

The core SDK therefore exposes generic configuration:

```env
SMART_ACCOUNT_PROVIDER=
BUNDLER_RPC_URL=
BUNDLER_API_KEY=
PAYMASTER_URL=
PAYMASTER_API_KEY=
```

For the earliest testnet slice, these can remain optional if the team uses a direct/simple smart-account execution path that does not require an external managed bundler/paymaster.

Never create a hard-coded dependency on one bundler or paymaster provider in the core SDK.

---

# 15. x402 Configuration

x402 is treated as a **payment protocol**, not an API-key provider.

The x402 adapter should therefore not invent a fake `X402_API_KEY` unless a specific payment facilitator/settlement provider actually requires one.

Configuration should instead be structured around the selected facilitator/network/payment implementation:

```env
X402_ENABLED=true
X402_NETWORK=base-sepolia
X402_ASSET=USDC
X402_FACILITATOR_URL=
X402_FACILITATOR_API_KEY=
```

`X402_FACILITATOR_API_KEY` is optional because the required credential depends on the facilitator/settlement architecture chosen for the implementation.

Rule:

> Do not make the SDK assume that x402 itself always requires an API key.

---

# 16. USDC Configuration

The USDC contract address is configuration, not a secret.

For Base Sepolia:

```env
BASE_SEPOLIA_USDC_ADDRESS=
```

The exact address must be sourced from the official testnet/payment integration documentation used by the implementation and must never be guessed or embedded in arbitrary application code.

Also configure:

```env
PAYMENT_ASSET=USDC
PAYMENT_DECIMALS=6
```

The implementation must validate that the asset address and chain ID agree.

---

# 17. SentinelPay SDK/API Authentication

The eventual public SDK should authenticate to SentinelPay with organization-scoped credentials.

Recommended shape:

```env
SENTINELPAY_API_KEY=
SENTINELPAY_API_URL=
SENTINELPAY_ORG_ID=
```

### Important distinction

This key authenticates a **company/application to SentinelPay**.

It does not authorize blockchain spending by itself.

Financial authority must still be enforced through the Agent Constitution, capability/policy layer, approval state, and execution authorization.

The SDK must never treat possession of `SENTINELPAY_API_KEY` as permission to bypass policy.

---

# 18. Internal Service Authentication

The monorepo may contain:

```text
agent service
security service
core service
execution service
```

These services should authenticate with short-lived internal credentials where practical.

Configuration:

```env
INTERNAL_SERVICE_TOKEN=
```

For production, replace a shared static token with service identity/mTLS/workload identity where appropriate.

A shared development token is acceptable only in local/dev environments.

---

# 19. Database Credentials

## PostgreSQL

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/sentinelpay
```

`DATABASE_URL` is a secret in deployed environments because it normally contains credentials.

Never print it in logs.

Never put it into model context.

---

# 20. Redis Credentials

```env
REDIS_URL=redis://USER:PASSWORD@HOST:6379
```

For local Docker development it may not require authentication; production should use the deployment's secure authentication mechanism.

Redis is used for event/trajectory processing, not as the permanent source of truth for audit history.

---

# 21. GitHub Authentication — Optional Dashboard Feature

The original product direction included GitHub-based application authentication. fileciteturn0file0L270-L273

If enabled:

```env
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_OAUTH_REDIRECT_URI=
```

GitHub OAuth requires an application client ID and client secret for the normal web application flow. GitHub explicitly recommends keeping the client secret secure and server-side. citeturn666639search0turn666639search2

The GitHub identity path must never receive payment authority.

It is an application-authentication convenience, not a wallet authorization mechanism.

---

# 22. Observability Credentials

OpenTelemetry itself is not an API-key service. The credentials depend on the telemetry backend.

Generic configuration:

```env
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=
OTEL_EXPORTER_OTLP_HEADERS=
OTEL_SERVICE_NAME=sentinelpay
OTEL_ENVIRONMENT=development
```

If the selected telemetry backend requires authentication, store those headers/credentials as secrets.

Never include:

- private keys
- payment secrets
- API keys
- full authorization headers

inside ordinary trace attributes.

---

# 23. Complete `.env.example`

The repository should contain a safe `.env.example` similar to:

```env
# ============================================================
# Runtime
# ============================================================
NODE_ENV=development
ENVIRONMENT=testnet

# ============================================================
# SentinelPay API / SDK
# ============================================================
SENTINELPAY_API_URL=http://localhost:8000
SENTINELPAY_API_KEY=
SENTINELPAY_ORG_ID=
INTERNAL_SERVICE_TOKEN=

# ============================================================
# AI / Model Provider
# ============================================================
MODEL_PROVIDER=qwen
MODEL_ENDPOINT=
MODEL_API_KEY=
MODEL_NAME=

QWEN_API_KEY=
QWEN_BASE_URL=
QWEN_MODEL=

# Optional providers
GEMINI_API_KEY=
GEMINI_MODEL=

OPENAI_API_KEY=
OPENAI_MODEL=

OPENROUTER_API_KEY=
OPENROUTER_MODEL=

# ============================================================
# Research / Search
# ============================================================
SEARCH_PROVIDER=
SEARCH_API_KEY=
SEARCH_BASE_URL=

# ============================================================
# Data stores
# ============================================================
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sentinelpay
REDIS_URL=redis://localhost:6379

# ============================================================
# Base Sepolia
# ============================================================
ALCHEMY_API_KEY=
BASE_SEPOLIA_RPC_URL=
BASE_SEPOLIA_CHAIN_ID=84532
BASE_SEPOLIA_USDC_ADDRESS=

# ============================================================
# Future Base Mainnet
# ============================================================
BASE_MAINNET_RPC_URL=
BASE_MAINNET_CHAIN_ID=8453

# ============================================================
# Blockchain / Explorer / Reputation
# ============================================================
BLOCK_EXPLORER_PROVIDER=
BLOCK_EXPLORER_API_KEY=
BLOCK_EXPLORER_BASE_URL=

CHAIN_DATA_PROVIDER=
CHAIN_DATA_API_KEY=
CHAIN_DATA_BASE_URL=

# ============================================================
# Execution / Wallet
# ============================================================
EXECUTION_SIGNER_REFERENCE=
# TESTNET_PRIVATE_KEY=   # only for isolated testnet/local execution

SMART_ACCOUNT_PROVIDER=
BUNDLER_RPC_URL=
BUNDLER_API_KEY=
PAYMASTER_URL=
PAYMASTER_API_KEY=

# ============================================================
# x402
# ============================================================
X402_ENABLED=true
X402_NETWORK=base-sepolia
X402_ASSET=USDC
X402_FACILITATOR_URL=
X402_FACILITATOR_API_KEY=

# ============================================================
# Attestation
# ============================================================
ATTESTATION_CONTRACT_ADDRESS=
ATTESTATION_DEPLOYER_REFERENCE=

# ============================================================
# Optional GitHub authentication
# ============================================================
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/github/callback

# ============================================================
# Observability
# ============================================================
OTEL_ENABLED=false
OTEL_EXPORTER_OTLP_ENDPOINT=
OTEL_EXPORTER_OTLP_HEADERS=
OTEL_SERVICE_NAME=sentinelpay
OTEL_ENVIRONMENT=development
```

The `.env.example` must contain **placeholders only**.

---

# 24. Which Credentials We Actually Need to Create First

For the initial four-person implementation, do **not** create every credential in this document.

Create only:

### AI/ML team

```text
1. QWEN_API_KEY
2. QWEN_BASE_URL
3. QWEN_MODEL
```

### Blockchain team

```text
4. ALCHEMY_API_KEY
5. BASE_SEPOLIA_RPC_URL
6. BASE_SEPOLIA_USDC_ADDRESS
7. TESTNET execution signer / secure signer reference
```

### Backend team

```text
8. DATABASE_URL
9. REDIS_URL
10. INTERNAL_SERVICE_TOKEN
11. SENTINELPAY_API_KEY (once public SDK auth is implemented)
```

### Optional for demo UI

```text
12. GITHUB_CLIENT_ID
13. GITHUB_CLIENT_SECRET
```

### Optional agent research

```text
14. SEARCH_API_KEY
15. SEARCH_BASE_URL
```

Everything else can remain disabled until its feature is actively implemented.

---

# 25. Credential Ownership

| Credential | Team owner | Backup owner |
|---|---|---|
| Qwen credentials | AI/ML | Backend |
| Search credentials | AI/ML | Backend |
| Alchemy credentials | Blockchain | Backend |
| Test signer | Blockchain | Team lead |
| Smart-account/bundler credentials | Blockchain | Backend |
| x402 facilitator credential | Blockchain | Backend |
| Database credential | Backend | Team lead |
| Redis credential | Backend | Team lead |
| SentinelPay SDK/API key | Backend | Team lead |
| GitHub OAuth credentials | Backend | Frontend |
| Observability credentials | Backend | Team lead |

The principle is:

> **The person who owns the external integration owns its credentials, but no individual credential should give that person authority to bypass SentinelPay policy.**

---

# 26. API Adapter Interfaces

External APIs must be wrapped by explicit interfaces.

## Model

```ts
interface ModelProvider {
  generate(request: ModelRequest): Promise<ModelResponse>;
  stream?(request: ModelRequest): AsyncIterable<ModelChunk>;
}
```

## Search

```ts
interface SearchProvider {
  search(request: SearchRequest): Promise<SearchResponse>;
}
```

## Blockchain

```ts
interface ChainProvider {
  getBalance(...): Promise<...>;
  getTransaction(...): Promise<...>;
  call(...): Promise<...>;
  simulate(...): Promise<...>;
  submit(...): Promise<...>;
  getReceipt(...): Promise<...>;
}
```

## Reputation

```ts
interface ReputationProvider {
  analyzeRecipient(request: ReputationRequest): Promise<ReputationResult>;
}
```

## Payment

```ts
interface PaymentAdapter {
  prepare(request: PaymentRequest): Promise<PreparedPayment>;
  execute(request: ApprovedPayment): Promise<ExecutionResult>;
  verify(request: ExecutionVerificationRequest): Promise<VerifiedResult>;
}
```

No provider-specific API response should leak directly through the public SDK.

---

# 27. API Failure Behavior

Every external API call must be classified.

```text
TRANSIENT
    ↓
retry with bounded backoff

RATE_LIMITED
    ↓
respect retry-after / bounded backoff

AUTHENTICATION_FAILURE
    ↓
hard configuration error

PROVIDER_UNAVAILABLE
    ↓
retry / degraded mode

INVALID_PROVIDER_RESPONSE
    ↓
fail closed for security-sensitive decision

SECURITY_SIGNAL_UNAVAILABLE
    ↓
do not silently convert unknown risk to safe
```

The key rule is:

> **Unknown is not the same as safe.**

For example, if recipient reputation is unavailable, the system may permit a policy-defined `REVIEW` path, but it must not convert “unable to check” into `ALLOW` merely to keep the demo moving.

---

# 28. API Keys vs Financial Authority

This distinction must remain explicit in code and documentation.

```text
API KEY
  = permission to call a service

PRIVATE KEY / SIGNER
  = cryptographic authority to sign

AGENT CONSTITUTION
  = business authorization policy

SENTINELPAY DECISION
  = runtime safety authorization

SMART ACCOUNT / CAPABILITY
  = bounded financial execution authority
```

Never combine these concepts.

Possessing an API key must never imply permission to spend money.

Possessing an LLM provider key must never imply permission to execute a payment.

---

# 29. Production Secret Management

Local development:

```text
.env.local
```

and equivalent local secret tooling may be used.

Production:

```text
Managed Secret Store
        ↓
Service Runtime
        ↓
Environment / secret injection
```

Examples of acceptable production mechanisms include cloud secret managers, Kubernetes secrets backed by a proper secret store, HSM/KMS-backed signing services, or equivalent enterprise secret infrastructure.

The exact production provider is deliberately not fixed in V1.

---

# 30. Mainnet Safety Rules

Mainnet credentials must be a completely separate configuration universe.

Requirements:

```text
TESTNET_RPC_URL     != MAINNET_RPC_URL
TESTNET_SIGNER      != MAINNET_SIGNER
TESTNET_CONTRACTS   != MAINNET_CONTRACTS
TESTNET_DATABASE    != PRODUCTION_DATABASE
```

The demo should contain multiple explicit mainnet gates before any real-value execution becomes possible.

A developer should not be able to accidentally activate mainnet because a string changed from `testnet` to `mainnet`.

---

# 31. No Secret in Agent Context

The following must never appear in LLM prompts, tool descriptions, retrieved documents, action traces, or model-visible state:

```text
API keys
provider secrets
private keys
seed phrases
wallet encryption passwords
OAuth client secrets
session secrets
internal service tokens
production database credentials
```

The agent can receive **capabilities** and **authorized actions**, not raw credentials.

---

# 32. No Secret in Audit Log

Audit events may record:

```text
provider name
operation type
request ID
latency
status
error class
hash of sensitive payload
```

They must never record:

```text
raw API keys
Authorization headers
private keys
passwords
seed phrases
full access tokens
```

---

# 33. API Keys Required vs Optional — Final Matrix

### Required for the first complete reference implementation

```text
QWEN_API_KEY
ALCHEMY_API_KEY
BASE_SEPOLIA_RPC_URL
BASE_SEPOLIA_USDC_ADDRESS
DATABASE_URL
REDIS_URL
TESTNET execution signer/reference
```

### Required once SDK authentication is exposed

```text
SENTINELPAY_API_KEY
```

### Required if the autonomous research demo uses an external search provider

```text
SEARCH_API_KEY
SEARCH_BASE_URL
```

### Optional model providers

```text
GEMINI_API_KEY
OPENAI_API_KEY
OPENROUTER_API_KEY
```

### Optional external infrastructure

```text
BUNDLER_API_KEY
PAYMASTER_API_KEY
X402_FACILITATOR_API_KEY
BLOCK_EXPLORER_API_KEY
CHAIN_DATA_API_KEY
```

### Optional dashboard authentication

```text
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
```

### Optional observability authentication

```text
OTEL_EXPORTER_OTLP_HEADERS
```

---

# 34. Kiro Rules for Credentials

Kiro must follow these rules when writing code:

1. Never invent an API key.
2. Never hard-code an API key.
3. Never hard-code a private key.
4. Never print secrets for debugging.
5. Never add `.env` files containing real secrets to the repository.
6. Update `.env.example` when introducing a new credential.
7. Validate required configuration at process startup.
8. Clearly distinguish optional from required configuration.
9. Keep provider-specific credentials inside adapters.
10. Do not expose server-side secrets through Next.js public environment variables.
11. Do not place secrets into model prompts or trajectory traces.
12. Do not silently skip a missing security dependency.
13. Use testnet credentials for all demo execution.
14. Keep mainnet configuration disabled until explicitly enabled through a multi-step production deployment process.
15. Document the source/provider of every newly added external credential in this file.

---

# 35. Final API/Secret Architecture

```text
                         SENTINELPAY
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
   AI PROVIDERS          DATA PROVIDERS        PAYMENT / CHAIN
        │                     │                     │
   Qwen / Gemini         Search / Chain       Alchemy / x402
   optional OpenAI       Reputation           Smart account
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
                    ADAPTER / SECURITY BOUNDARY
                              │
                              ▼
                       SENTINEL CORE
                              │
                              ▼
                     DETERMINISTIC POLICY
                              │
                              ▼
                         EXECUTOR
                              │
                              ▼
                         VERIFIED RESULT
```

The central idea is unchanged:

> **External APIs provide information or infrastructure. They do not receive authority over SentinelPay's financial decision.**

---

# 36. Source Notes

- Qwen / Alibaba Cloud Model Studio: API-key creation, environment-variable usage, and regional endpoints. citeturn745404search1turn745404search13turn745404search7
- Gemini: API-key requirements, server-side secret handling, and current key restrictions. citeturn191094search0turn191094search1
- Base Sepolia / Alchemy: chain ID `84532`, RPC endpoint, API-key usage. citeturn745404search0turn745404search5turn745404search9
- Base mainnet: chain ID `8453`. citeturn745404search3turn745404search15
- GitHub OAuth: client ID/client secret requirements and server-side secret handling. citeturn666639search0turn666639search2
- The original VeriGuard PRD also established policy compilation, trajectory interception, MCP/SDK integration, and on-chain attestation as core architectural concepts that this credential/API layer supports. fileciteturn0file0L59-L77 fileciteturn0file0L246-L256

---

# 37. Final Rule

SentinelPay must remain functional as an **SDK and security layer** even when an individual external provider changes.

Providers are replaceable.

The following are not:

```text
Intent boundary
Policy boundary
Security boundary
Execution authorization boundary
Receipt verification
Auditability
```

Those are SentinelPay's product guarantees.
