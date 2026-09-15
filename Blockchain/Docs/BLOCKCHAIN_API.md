# SentinelPay — BLOCKCHAIN_API.md

## 1. Purpose

This document defines the internal API and adapter boundaries of `OrvexMain/Blockchain/`.

The Blockchain layer must consume the existing shared contracts.

Do not invent a second public SentinelPay execution contract.

---

# 2. ExecutionClient

The primary interface is the existing Core contract.

Conceptual API:

```ts
interface ExecutionClient {
  validate(request: ExecutionRequest): Promise<TransactionAnalysis>;
  simulate(request: ExecutionRequest): Promise<SimulationResult>;
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
  getResult(executionId: string): Promise<ExecutionResult>;
  verify(
    request: ExecutionRequest,
    result: ExecutionResult
  ): Promise<ReceiptVerification>;
}
```

Use the actual repository interface if its method signatures differ.

---

# 3. Blockchain Adapter

```ts
interface BlockchainExecutionAdapter {
  validate(request): Promise<TransactionAnalysis>;
  simulate(request): Promise<SimulationResult>;
  execute(request): Promise<ExecutionResult>;
  getResult(executionId): Promise<ExecutionResult>;
  verify(request, result): Promise<ReceiptVerification>;
}
```

V1 implementation:

```text
BaseSepoliaExecutionClient
```

---

# 4. Chain API

```ts
interface ChainAdapter {
  getChainId(): Promise<number>;
  getBlockNumber(): Promise<bigint>;
  getBalance(address, asset?): Promise<bigint>;
  getCode(address): Promise<Hex>;
}
```

The actual chain adapter can expose additional internal methods.

---

# 5. Transaction Builder API

```ts
interface TransactionBuilder {
  build(request: ExecutionRequest): Promise<TransactionRequest>;
}
```

Output must contain the exact concrete transaction to be simulated/executed.

---

# 6. Transaction Decoder API

```ts
interface TransactionDecoder {
  decode(request: TransactionRequest): Promise<TransactionAnalysis>;
}
```

It must not accept the agent's text as transaction truth.

---

# 7. Simulation API

```ts
interface Simulator {
  simulate(request: TransactionRequest): Promise<SimulationResult>;
}
```

The simulator is deterministic and chain-backed.

---

# 8. Receipt API

```ts
interface ReceiptClient {
  getReceipt(txHash: string): Promise<unknown>;
}
```

The application should normalize provider-specific receipt data before Core consumes it.

---

# 9. Receipt Verification API

```ts
interface ReceiptVerifier {
  verify(
    request: ExecutionRequest,
    result: ExecutionResult
  ): Promise<ReceiptVerification>;
}
```

It verifies expected-vs-actual execution.

---

# 10. Smart Account API

```ts
interface SmartAccountAdapter {
  getAddress(): Promise<Address>;
  buildUserOperation(request: ExecutionRequest): Promise<UserOperation>;
  simulateUserOperation(op: UserOperation): Promise<SimulationResult>;
  executeUserOperation(op: UserOperation): Promise<ExecutionResult>;
  getResult(executionId: string): Promise<ExecutionResult>;
}
```

Exact UserOperation shape should follow the selected ERC-4337/account-abstraction implementation.

---

# 11. x402 API

```ts
interface X402Adapter {
  parseRequirement(input): Promise<PaymentRequirement>;
  buildPayment(requirement, request): Promise<PaymentPayload>;
  submitPayment(payload): Promise<ExecutionResult>;
  verifySettlement(
    payload,
    result
  ): Promise<ReceiptVerification>;
}
```

The adapter must not create authorization.

---

# 12. Attestation API

```ts
interface AttestationAdapter {
  write(record: AttestationRecord): Promise<AttestationResult>;
  get(attestationId: string): Promise<AttestationResult>;
}
```

Failure is isolated from payment state.

---

# 13. Internal Service Endpoints

The Blockchain service may expose health/control endpoints if deployed independently:

```text
GET /health
GET /ready
GET /version
GET /metrics
```

Do not expose an unauthenticated:

```text
POST /execute
```

that accepts arbitrary transaction payloads.

Execution must be driven by the authenticated Core execution boundary.

---

# 14. Integration API with Backend

The primary integration is service-to-service:

```text
Backend
  ↓
ExecutionRequest
  ↓
Blockchain ExecutionClient
```

Required metadata:

```text
company_id / tenant
agent_id
execution_id
decision_id
transaction_id
authorization_context_hash
idempotency_key
network
```

The Blockchain layer should reject requests missing required identity/binding fields.

---

# 15. Error API

Normalize errors into:

```text
BLOCKCHAIN_CONFIG_ERROR
CHAIN_MISMATCH
RPC_ERROR
INVALID_TRANSACTION
TRANSACTION_VALIDATION_FAILED
SIMULATION_FAILED
SUBMISSION_FAILED
EXECUTION_FAILED
EXECUTION_UNKNOWN
RECEIPT_NOT_FOUND
RECEIPT_VERIFICATION_FAILED
SIGNING_ERROR
SMART_ACCOUNT_ERROR
X402_ERROR
ATTESTATION_ERROR
TIMEOUT
```

Provider-specific error text should not leak directly to API consumers.

---

# 16. Execution State

Use a clear lifecycle:

```text
NOT_STARTED
VALIDATING
SIMULATING
READY
SUBMITTING
SUBMITTED
CONFIRMED
FAILED
UNKNOWN
VERIFIED
VERIFICATION_FAILED
```

Core's existing execution state is authoritative for financial state.

The Blockchain layer reports execution reality.

---

# 17. API Idempotency

Every financial execution must use:

```text
idempotency_key
```

The Blockchain layer must not submit the same logical execution twice merely because a client retries.

A retry must reconcile existing state first.

---

# 18. API Security

All service-to-service writes require:

```text
authentication
tenant binding
request validation
context binding
idempotency
```

Do not accept:

```text
"AI approved this"
```

as an authentication or authorization mechanism.
