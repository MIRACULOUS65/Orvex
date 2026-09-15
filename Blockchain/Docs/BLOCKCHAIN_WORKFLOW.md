# SentinelPay — BLOCKCHAIN_WORKFLOW.md

## 1. Purpose

This document defines the runtime workflow of the Blockchain/Execution subsystem.

The Blockchain layer starts only after Core has authorized an `ExecutionRequest`.

---

# 2. Master Workflow

```text
Core
 ↓
ExecutionRequest
 ↓
Authenticate / Bind Context
 ↓
Chain Validation
 ↓
Transaction Construction
 ↓
Transaction Decoding
 ↓
Transaction Analysis
 ↓
Deterministic Policy/Context Checks
 ↓
Simulation
 ↓
Verify Exact Payload
 ↓
Execute
 ↓
Monitor Submission
 ↓
Receipt Retrieval
 ↓
Actual State Extraction
 ↓
Receipt Verification
 ↓
ExecutionResult
 ↓
Core Reconciliation
 ↓
Financial Commit
 ↓
Audit
 ↓
Attestation
```

---

# 3. Step 1 — ExecutionRequest Intake

The Blockchain service receives:

```text
ExecutionRequest
```

Validate:

```text
schema
execution_id
decision_id
transaction_id
authorization context hash
idempotency key
network
executor
```

Reject malformed requests.

---

# 4. Step 2 — Context Binding

Verify that the request has not changed since Core authorization.

At minimum bind:

```text
company/tenant
agent
intent
proposal
decision
policy version
transaction payload
approval context
idempotency key
```

If the context hash is invalid:

```text
REJECT
```

---

# 5. Step 3 — Chain Validation

Before any RPC write:

```text
configured chain
VS
connected chain
VS
request chain
```

All must agree.

Example:

```text
Expected:
Base Sepolia / 84532

RPC:
Base Mainnet / 8453

Result:
REJECT
```

---

# 6. Step 4 — Transaction Construction

Convert:

```text
TransactionIntent
```

into:

```text
TransactionRequest
```

For V1 initially support:

```text
USDC transfer
```

Then expand to:

```text
x402
smart-account UserOperation
```

---

# 7. Step 5 — Transaction Analysis

Decode and inspect the exact transaction.

Determine:

```text
actual recipient
actual asset
actual amount
contract
function
parameters
approvals
state-changing calls
```

Compare against the authorized expectation.

---

# 8. Step 6 — Simulation

Run actual chain simulation.

```text
TransactionRequest
 ↓
Simulator
 ↓
SimulationResult
```

A mandatory simulation must pass.

If simulation fails:

```text
execution stops
```

If the transaction payload changes:

```text
old simulation invalid
```

---

# 9. Step 7 — Execution

Only after:

```text
validation PASS
simulation PASS
payload binding PASS
```

can the execution adapter submit.

Possible implementations:

```text
Smart Account
x402
future API/payment rail
```

---

# 10. Step 8 — Submission Tracking

After submission:

```text
SUBMITTED
```

Store:

```text
transaction hash / user operation hash
submission timestamp
network
idempotency key
```

Do not mark the operation confirmed yet.

---

# 11. Step 9 — Receipt Reconciliation

Query the authoritative chain until the execution is resolved.

Possible:

```text
CONFIRMED
FAILED
UNKNOWN
```

If the RPC/provider times out:

```text
UNKNOWN
```

Do not blindly resend.

---

# 12. Step 10 — Receipt Verification

After confirmation:

```text
receipt
 ↓
logs/events
 ↓
state changes
 ↓
expected result
```

Compare:

```text
authorized recipient
authorized asset
authorized amount
authorized network
```

to actual.

---

# 13. Step 11 — Result Sent to Core

Return:

```text
ExecutionResult
```

and:

```text
ReceiptVerification
```

Core decides whether financial state can be committed.

The Blockchain layer must not directly mutate Core's financial ledger.

---

# 14. x402 Workflow

```text
Agent requests service
 ↓
HTTP 402
 ↓
Payment requirement
 ↓
SentinelPay maps requirement
 ↓
Core authorization
 ↓
x402 payment payload
 ↓
Smart-account/payment execution
 ↓
Facilitator settlement
 ↓
Settlement verification
 ↓
Service response
```

The payment requirement itself is untrusted input.

---

# 15. Smart Account Workflow

```text
ExecutionRequest
 ↓
UserOperation Builder
 ↓
UserOperation simulation
 ↓
signature/validation
 ↓
Bundler submission
 ↓
EntryPoint
 ↓
Smart Account execution
 ↓
receipt
```

Never let the agent directly construct and sign unrestricted UserOperations.

---

# 16. Attestation Workflow

After the execution lifecycle reaches a finalized state:

```text
audit/decision context
 ↓
canonical serialization
 ↓
hash/commitment
 ↓
Merkle root if applicable
 ↓
AttestationAdapter
 ↓
Solidity registry
 ↓
Base Sepolia
```

Attestation failure must not rewrite payment state.

---

# 17. Replay Workflow

Same:

```text
idempotency key
```

must resolve to the same logical execution.

A retry must check:

```text
already submitted?
already confirmed?
still UNKNOWN?
```

before doing anything new.

---

# 18. UNKNOWN Workflow

```text
submitted
 ↓
provider timeout
 ↓
UNKNOWN
 ↓
hold reservation
 ↓
reconcile authoritative chain
```

Possible resolution:

```text
CONFIRMED
 → verify
 → commit

FAILED
 → release through sanctioned Core reconciliation

STILL UNKNOWN
 → remain UNKNOWN
 → no blind retry
```

---

# 19. Failure Workflow

```text
Validation Failure
→ no simulation
→ no execution

Simulation Failure
→ no execution

Execution Submission Failure
→ explicit FAILED/UNKNOWN classification

Unknown Execution
→ reconcile

Receipt Verification Failure
→ verification failed
→ no financial commit
```

---

# 20. Full Security Flow

The blockchain system must enforce defense-in-depth even though Core already authorized.

```text
AI says:
"Pay $5 to A"

Core says:
ALLOW

Blockchain sees:
transaction actually pays B

Result:
BLOCK / VERIFICATION FAILURE
```

This means:

> authorization and execution truth are independently checked.

---

# 21. Local Development Workflow

Use:

```text
Anvil
 ↓
Deploy test USDC
 ↓
Deploy test contracts
 ↓
Run transaction builder
 ↓
Run simulator
 ↓
Execute
 ↓
Verify receipt
```

Only after this works:

```text
Base Sepolia
```

---

# 22. Testnet Workflow

```text
Base Sepolia
 ↓
Dedicated test wallet
 ↓
Test USDC
 ↓
real transaction
 ↓
real receipt
 ↓
real verification
```

Never use production keys.

---

# 23. Full System Workflow

```text
Human
 ↓
ML
 ↓
Core
 ↓
Decision
 ↓
Final Revalidation
 ↓
ExecutionRequest
 ↓
Blockchain
 ↓
Simulation
 ↓
Smart Account / x402
 ↓
Base Sepolia
 ↓
Receipt Verification
 ↓
Core Reconciliation
 ↓
Financial Commit
 ↓
Audit
 ↓
Attestation
```
