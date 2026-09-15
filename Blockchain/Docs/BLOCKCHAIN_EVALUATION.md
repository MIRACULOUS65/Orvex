# SentinelPay — BLOCKCHAIN_EVALUATION.md

## 1. Purpose

Evaluate the Blockchain/Execution subsystem independently and as part of the complete SentinelPay system.

The evaluation goal is:

> No unauthorized or materially altered operation should become a successful financial execution through the Blockchain layer.

---

# 2. Test Levels

```text
L1 Unit
L2 Contract
L3 Anvil integration
L4 Base Sepolia integration
L5 Core ↔ Blockchain integration
L6 Full AI → Core → Blockchain E2E
L7 Failure / Recovery
L8 Security / Adversarial
```

---

# 3. Unit Tests

Test:

```text
chain registry
RPC normalization
transaction builder
decoder
analyzer
validator
simulation result normalization
receipt parser
receipt verifier
idempotency
error mapping
```

---

# 4. Transaction Tests

Valid:

```text
USDC transfer
correct recipient
correct amount
correct chain
```

Invalid:

```text
wrong recipient
wrong asset
wrong amount
wrong network
wrong contract
wrong function
malformed calldata
```

---

# 5. Simulation Tests

Cases:

```text
PASS
REVERT
INSUFFICIENT_FUNDS
UNEXPECTED_STATE_CHANGE
RPC ERROR
TIMEOUT
```

Test:

```text
simulation payload hash == execution payload hash
```

and:

```text
changed payload → old simulation invalid
```

---

# 6. Anvil Tests

The full local lifecycle must work:

```text
ExecutionRequest
 ↓
Build
 ↓
Decode
 ↓
Validate
 ↓
Simulate
 ↓
Execute
 ↓
Receipt
 ↓
Verify
```

No network dependency for this suite.

---

# 7. Base Sepolia Smoke Tests

Use a dedicated test wallet.

Verify:

```text
chain ID
RPC connectivity
balance
USDC balance
transaction submission
receipt retrieval
receipt verification
```

Keep these separate from normal CI if they require external credentials.

---

# 8. Smart Account Tests

Test:

```text
UserOperation creation
UserOperation simulation
invalid operation rejection
wrong target
wrong value
authorization failure
bundler failure
receipt resolution
```

Do not use production signing keys.

---

# 9. x402 Tests

Test:

```text
valid payment requirement
wrong network
wrong asset
wrong amount
expired requirement
tampered recipient
settlement success
settlement failure
```

---

# 10. Receipt Verification Tests

Expected success:

```text
authorized = actual
```

Expected failure:

```text
recipient mismatch
amount mismatch
asset mismatch
network mismatch
transaction reverted
missing receipt
unexpected log
```

---

# 11. Replay Tests

Send the same:

```text
execution_id
idempotency_key
```

multiple times.

Expected:

```text
one logical execution
```

Never multiple payments.

---

# 12. UNKNOWN Tests

Simulate:

```text
submitted
→ timeout
→ UNKNOWN
```

Then:

```text
query chain
→ CONFIRMED
→ verify
```

Also:

```text
UNKNOWN
→ FAILED
→ release via sanctioned Core path
```

No blind retry.

---

# 13. Security Regression Tests

Mandatory:

```text
wrong chain cannot execute
wrong recipient cannot execute
wrong amount cannot execute
invalid transaction cannot execute
failed simulation cannot execute
modified transaction cannot reuse simulation
receipt mismatch cannot commit
attestation failure cannot alter payment result
```

---

# 14. Core Integration Tests

Test:

```text
Core ALLOW
 ↓
FinalRevalidation
 ↓
ExecutionRequest
 ↓
Blockchain
```

and:

```text
Core DENY
 ↓
Blockchain never called
```

and:

```text
Core REVIEW
 ↓
No execution until approval
```

---

# 15. Full E2E Test

The hero success case:

```text
Human
 ↓
Intent
 ↓
Agent
 ↓
SecurityAssessment
 ↓
Core ALLOW
 ↓
FinalRevalidation
 ↓
ExecutionRequest
 ↓
Blockchain validation
 ↓
Simulation
 ↓
Smart Account / x402
 ↓
Base Sepolia
 ↓
Verified receipt
 ↓
Audit
 ↓
Attestation
```

---

# 16. Hero Attack Test

```text
User asks for API under $10
 ↓
Malicious website redirects recipient
 ↓
Agent proposes attacker
 ↓
AI Security flags threat
 ↓
Core DENY
 ↓
No ExecutionRequest
or
no blockchain call
```

This proves the defense-in-depth architecture.

---

# 17. Broken-AI Test

Force AI to return:

```text
ALLOW
confidence=1.0
no threat
low risk
```

with a transaction that violates policy.

Expected:

```text
Core DENY
Blockchain never executes
```

---

# 18. Broken-Blockchain Tests

Simulate blockchain layer returning:

```text
simulation PASS
```

for a malicious transaction.

Core/transaction validation must still provide independent safeguards.

Also simulate:

```text
receipt says success
```

but actual transfer differs.

Expected:

```text
VERIFICATION_FAILED
```

---

# 19. Performance Tests

Measure:

```text
transaction construction latency
decode latency
simulation latency
receipt retrieval latency
verification latency
total execution latency
```

Do not optimize away required security checks.

---

# 20. Release Gates

Do not connect real Core traffic to the real execution adapter unless:

```text
[ ] unit tests pass
[ ] Anvil tests pass
[ ] Foundry tests pass
[ ] transaction analyzer tests pass
[ ] simulation tests pass
[ ] receipt verification tests pass
[ ] replay tests pass
[ ] UNKNOWN tests pass
[ ] security regressions pass
[ ] Base Sepolia smoke test passes
```

For final E2E:

```text
[ ] Core ALLOW reaches blockchain
[ ] Core DENY never reaches blockchain
[ ] Core REVIEW waits for approval
[ ] payload binding works
[ ] receipt verification works
[ ] financial commit occurs only after verified success
```

---

# 21. Definition of Done

Blockchain V1 is complete when:

```text
[ ] local execution works
[ ] Base Sepolia execution works
[ ] deterministic simulation works
[ ] transaction decoding works
[ ] receipt verification works
[ ] smart account path works
[ ] x402 reference path works
[ ] real ExecutionClient works
[ ] Core integration works
[ ] UNKNOWN reconciliation works
[ ] idempotency works
[ ] attestation publication works
[ ] adversarial tests pass
[ ] no signer/secret leaks
[ ] mainnet is still explicitly gated
[ ] all existing Core tests remain green
[ ] Blockchain tests are green
[ ] end-to-end SentinelPay test passes
```
