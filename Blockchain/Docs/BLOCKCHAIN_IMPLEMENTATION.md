# SentinelPay — BLOCKCHAIN_IMPLEMENTATION.md

## 1. Goal

Implement the real Blockchain/Execution subsystem behind the existing `ExecutionClient`.

Work from scratch inside:

```text
OrvexMain/Blockchain/
```

Do not redesign completed Core or ML components.

---

## 2. Implementation Order

Use the following order. Developers may work ahead on independent units, but integration gates must be respected.

```text
B0  Freeze contracts
B1  Tooling + package foundation
B2  Chain registry + RPC
B3  Transaction builder
B4  Transaction decoder/analyzer/validator
B5  Simulation
B6  Local Anvil execution
B7  Base Sepolia execution
B8  Receipt verification
B9  Smart Account / ERC-4337
B10 x402
B11 Attestation registry
B12 Real ExecutionClient integration
B13 Full Core + Blockchain E2E
B14 Hardening / release
```

---

## 3. B0 — Freeze the Boundary

Before code:

- inspect existing `ExecutionClient`
- inspect `ExecutionRequest`
- inspect `TransactionRequest`
- inspect `TransactionAnalysis`
- inspect `SimulationResult`
- inspect `ExecutionResult`
- inspect `ReceiptVerification`
- inspect `AttestationRecord`

Use the existing contracts from `CONTRACTS.md`.

Do not create Blockchain-local competing versions.

If a real incompatibility exists, update the canonical contract first and add contract tests.

---

## 4. B1 — Package Foundation

Create:

```text
package.json
tsconfig.json
.env.example
README.md
foundry.toml
src/
contracts/
test/
scripts/
deployments/
anvil/
```

Install only necessary dependencies.

Primary application stack:

```text
Node.js
TypeScript
viem
Vitest
Foundry
Solidity
```

Add lint/format/typecheck consistent with the monorepo.

Add:

```text
npm test
npm run typecheck
```

and Foundry test commands.

---

## 5. B2 — Chain Registry + RPC

Implement:

```text
src/chains/
src/rpc/
```

First chain:

```text
Base Sepolia
chainId = 84532
```

Validate the live RPC's chain ID against configured chain ID before any write.

Support:

```text
local Anvil
Base Sepolia
```

The RPC URL must come from environment/configuration.

Never use hard-coded private infrastructure endpoints.

---

## 6. B3 — Transaction Builder

Implement:

```text
TransactionBuilder
```

Input:

```text
ExecutionRequest / TransactionIntent
```

Output:

```text
TransactionRequest
```

Start with the simplest V1 path:

```text
ERC-20 USDC transfer
```

Do not begin with arbitrary contract execution.

Exact token-unit handling is required.

Use integer token units or exact decimal conversion. Never use binary floating-point money arithmetic.

---

## 7. B4 — Decoder / Analyzer / Validator

Implement:

```text
TransactionDecoder
TransactionAnalyzer
TransactionValidator
```

Decode:

```text
chain
from
to
contract
selector
function
args
token
amount
approvals
logs/expected calls where possible
```

Validate against the execution context:

```text
expected chain
expected asset
expected amount
expected recipient
expected action
```

A mismatch fails validation.

---

## 8. B5 — Simulation

Implement:

```text
Simulator
```

V1 simulation order:

```text
Anvil/local
 ↓
eth_call
 ↓
viem simulateContract where appropriate
 ↓
trace/state-change normalization
```

Return:

```text
PASS
REVERT
INSUFFICIENT_FUNDS
UNEXPECTED_STATE_CHANGE
UNSUPPORTED
ERROR
```

The simulator should capture:

```text
wouldRevert
revertReason
gasEstimate
expected state changes
token transfer effects
```

If a required simulation cannot be performed, do not silently mark it as passed.

---

## 9. B6 — Local Anvil Execution

Before testnet, fully close the loop locally:

```text
ExecutionRequest
 ↓
TransactionRequest
 ↓
Decode
 ↓
Analyze
 ↓
Simulate
 ↓
Execute on Anvil
 ↓
Receipt
 ↓
Verify
```

Create deterministic test accounts and a local ERC-20 fixture.

Tests:

```text
normal transfer
insufficient balance
wrong recipient
wrong amount
revert
duplicate execution
receipt mismatch
```

---

## 10. B7 — Base Sepolia

After Anvil is green:

Configure:

```text
BASE_SEPOLIA_RPC_URL
BASE_SEPOLIA_CHAIN_ID=84532
BASE_SEPOLIA_PRIVATE_KEY or signing-provider reference
BASE_SEPOLIA_USDC_ADDRESS
```

Private keys must be held only by the execution process and must never be passed to ML/Core.

Use a dedicated test wallet.

Never use production credentials.

---

## 11. B8 — Receipt Verification

Implement:

```text
ReceiptClient
ReceiptParser
ReceiptVerifier
TokenTransferVerifier
StateChangeVerifier
```

Verify:

```text
receipt status
tx hash
chain
recipient
asset
amount
logs
expected state change
```

Example:

```text
authorized:
5 USDC → Provider A

actual:
5 USDC → Provider B

result:
VERIFICATION_FAILED
```

Do not commit funds for a mismatch.

---

## 12. B9 — Smart Account

Implement after direct EVM transfer path is stable.

Use an ERC-4337-compatible design.

Build:

```text
SmartAccountAdapter
UserOperationBuilder
BundlerClient
EntryPointClient
AccountFactory
```

Lifecycle:

```text
ExecutionRequest
 ↓
UserOperation
 ↓
UserOperation validation/simulation
 ↓
Bundler
 ↓
EntryPoint
 ↓
Smart Account
 ↓
transaction
 ↓
receipt
```

The signing service remains isolated.

---

## 13. B10 — x402

Build:

```text
X402Adapter
PaymentRequirementParser
PaymentPayloadBuilder
FacilitatorClient
SettlementVerifier
```

Target:

```text
Base Sepolia
USDC
```

The adapter must map the x402 payment requirement to the already-authorized execution context.

It must not bypass Core.

---

## 14. B11 — Attestation Registry

Create a minimal Solidity registry.

Responsibilities:

```text
store commitment
store decision
store tx hash
store timestamp
allow lookup
```

The contract must not custody user funds.

Use:

```text
forge build
forge test
forge script
```

Deploy first to Anvil, then Base Sepolia.

---

## 15. B12 — Real ExecutionClient

Implement:

```text
BaseSepoliaExecutionClient
```

against the existing interface.

Methods:

```text
validate()
simulate()
execute()
getResult()
verify()
```

Internally it can use:

```text
chain registry
RPC provider
transaction builder
transaction analyzer
simulator
smart account
x402
receipt verifier
```

Core should remain unchanged except for configuration selecting the real adapter.

---

## 16. B13 — Full Integration

Final runtime:

```text
AI/ML
 ↓
Core
 ↓
ALLOW
 ↓
FinalRevalidation
 ↓
ExecutionRequest
 ↓
BaseSepoliaExecutionClient
 ↓
Transaction Validation
 ↓
Simulation
 ↓
Smart Account / x402
 ↓
Base Sepolia
 ↓
Receipt
 ↓
Verification
 ↓
Financial Commit
 ↓
Audit
 ↓
Attestation
```

---

## 17. B14 — Hardening

Before declaring complete:

- run unit tests
- run Foundry tests
- run Anvil integration tests
- run Base Sepolia smoke tests
- run Core integration
- run failure-mode tests
- run replay tests
- run unknown-state recovery tests
- run wrong-chain tests
- run receipt mismatch tests
- run signer isolation tests
- run typecheck

---

## 18. Development Rule

Move quickly by batching independent tasks.

Do not move quickly by:
- skipping simulation
- skipping receipt verification
- using fake success
- bypassing Core
- embedding secrets
- accepting type errors
- disabling tests

Every security boundary must have automated tests.
