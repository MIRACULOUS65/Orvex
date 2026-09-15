# SentinelPay — BLOCKCHAIN_SECURITY_MODEL.md

## 1. Purpose

The Blockchain layer is the final technical execution boundary before value moves.

It therefore performs defense-in-depth checks even after Core authorization.

Its job is not to replace Core.

Its job is to ensure:

> the thing that executes is the thing that was authorized, simulated, and verified.

---

# 2. Trust Model

```text
Core Authorization
       ↓
ExecutionRequest
       ↓
Blockchain Validation
       ↓
Simulation
       ↓
Execution
       ↓
Receipt
       ↓
Independent Verification
```

The blockchain layer must trust only authenticated structured execution requests, not raw model output.

---

# 3. Non-Negotiable Invariants

1. AI cannot call Blockchain directly.
2. Blockchain cannot invent authorization.
3. Only valid ExecutionRequests can enter execution.
4. Network identity must be verified.
5. Simulation must correspond to the exact execution payload.
6. Material transaction changes invalidate simulation.
7. Private keys stay outside ML.
8. Mainnet cannot be reached accidentally from testnet configuration.
9. UNKNOWN cannot be blindly retried.
10. Successful transaction submission is not financial success until verification passes.
11. Receipt mismatch prevents financial commit.
12. Attestation failure cannot corrupt payment state.

---

# 4. Chain Mismatch Protection

Validate:

```text
ExecutionRequest.chain
vs
configured chain
vs
RPC-reported chain
```

Reject any mismatch.

Example:

```text
request = Base Sepolia
RPC = Base Mainnet

→ reject
```

---

# 5. Recipient Mismatch Protection

Expected:

```text
recipient = Provider A
```

Actual transaction:

```text
recipient = Provider B
```

Block before execution if discovered during validation/simulation; otherwise verification must fail after execution.

---

# 6. Asset Mismatch

Expected:

```text
USDC
```

Actual:

```text
WETH
```

Reject unless the ExecutionRequest explicitly authorizes that asset.

---

# 7. Amount Mismatch

Expected:

```text
5 USDC
```

Actual:

```text
500 USDC
```

Reject.

Never use floating-point comparison.

---

# 8. Contract / Function Mismatch

Expected:

```text
ERC20 transfer()
```

Actual:

```text
approve()
```

or arbitrary function:

```text
dangerousCall(...)
```

must be detected by decoding/analyzing calldata.

---

# 9. Unexpected Approval Protection

Unlimited approval is especially sensitive.

The analyzer should identify:

```text
approve(spender, MAX_UINT)
```

and compare it with what the authorized payment actually requires.

A normal payment request must never silently become unlimited token approval.

---

# 10. Simulation Binding

Hash/bind the transaction payload and relevant execution context.

Conceptually:

```text
simulation_payload_hash
```

must match:

```text
execution_payload_hash
```

If not:

```text
simulation invalid
→ re-simulate
```

---

# 11. Replay Protection

Use stable:

```text
idempotency_key
```

and appropriate transaction/account nonce mechanisms.

The system must distinguish:

```text
retry of same operation
```

from:

```text
new user operation
```

---

# 12. UNKNOWN Handling

UNKNOWN occurs when submission outcome cannot yet be established.

Example:

```text
submit
 ↓
RPC timeout
 ↓
UNKNOWN
```

Safe behavior:

```text
hold state
 ↓
query authoritative chain
 ↓
resolve
```

Never:

```text
timeout
 ↓
send again
```

without reconciliation.

---

# 13. Signer Isolation

Signing material must be isolated from:

```text
ML
Core
dashboard
trajectory
audit
logs
```

Preferred:

```text
Execution service
 ↓
secure signing provider
 ↓
Smart Account / transaction
```

The model must never receive the signing secret.

---

# 14. Mainnet Safety

V1 is testnet-first.

Rules:

```text
No automatic mainnet fallback.
No testnet → mainnet inference.
No shared signer unless explicitly intended and securely isolated.
No mainnet default.
```

Any future mainnet mode must be explicit.

---

# 15. x402 Security

An x402 payment requirement is an external input.

Validate:

```text
network
asset
recipient
amount
resource/service
expiry
nonce/authorization fields
```

before constructing payment.

Do not assume:

```text
HTTP 402 = safe payment
```

---

# 16. Smart Account Security

Smart-account execution must enforce the intended capability boundary.

Avoid:

```text
AI → raw private key
```

Prefer:

```text
Core authorization
 ↓
constrained smart-account operation
```

Any paymaster/bundler integration must be treated as an execution dependency, not an authorization authority.

---

# 17. RPC Security

RPC results are important evidence but provider infrastructure may fail or return stale/error information.

For sensitive operations:

```text
chain ID verification
receipt confirmation
block reference
transaction hash verification
```

Use multiple reads or appropriate confirmation policies where required.

---

# 18. Receipt Verification Security

The verifier must independently derive actual financial state.

Do not trust:

```text
provider success boolean
```

alone.

Verify logs/state relevant to the payment.

---

# 19. Attestation Security

On-chain registry stores commitments.

It must never store:

```text
private key
raw credentials
raw user prompts
sensitive company policy
full evidence
private trajectory
```

The attestation record should be minimal and deterministic.

---

# 20. Security Test Matrix

Mandatory tests:

```text
wrong chain
wrong recipient
wrong amount
wrong asset
unexpected contract
unexpected function
unlimited approval
simulation mismatch
replay
UNKNOWN
receipt mismatch
signer unavailable
RPC failure
testnet/mainnet mismatch
x402 requirement tampering
```

---

# 21. Final Blockchain Security Principle

The Blockchain layer must prove:

```text
Authorized
     ↓
Simulated
     ↓
Executed
     ↓
Actually happened
```

and these four must correspond.

A transaction is not successful merely because the chain accepted it.
