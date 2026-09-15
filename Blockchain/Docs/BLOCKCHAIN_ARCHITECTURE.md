# SentinelPay — BLOCKCHAIN_ARCHITECTURE.md

## 1. Purpose

This document defines the architecture of the standalone `OrvexMain/Blockchain/` subsystem.

The Blockchain layer is the **execution implementation** behind the already-existing SentinelPay Core `ExecutionClient` boundary.

It does not own:
- user intent
- AI reasoning
- policy authorization
- ALLOW/REVIEW/DENY
- final revalidation
- financial policy state

It owns:
- chain interaction
- transaction construction
- transaction decoding
- transaction analysis
- deterministic simulation
- smart-account execution
- x402 payment execution
- transaction submission
- receipt retrieval
- receipt/state verification
- blockchain attestation publication

Core principle:

> Core decides **whether** an action may execute. Blockchain decides **how** the already-authorized action is executed and verified.

---

## 2. Monorepo Boundary

```text
OrvexMain/
├── ML/
├── Backend/
└── Blockchain/
```

Logical dependency:

```text
ML
 ↓
Backend / Sentinel Core
 ↓
ExecutionRequest
 ↓
Blockchain
 ↓
Base Sepolia / future chains
```

The Blockchain package must not import AI/ML implementation details.

It may consume shared execution contracts and authenticated requests from Backend.

---

## 3. High-Level Architecture

```text
                     SENTINELPAY CORE
                            │
                            │ ExecutionRequest
                            ▼
                  ┌──────────────────────┐
                  │  EXECUTION CLIENT    │
                  │  interface           │
                  └──────────┬───────────┘
                             │
                 ┌───────────┼────────────┐
                 ▼           ▼            ▼
              Validate    Simulate      Execute
                 │           │            │
                 └───────────┼────────────┘
                             ▼
                    Blockchain Runtime
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
       EVM Chain        Smart Account          x402
          │                  │                  │
          └──────────────────┼──────────────────┘
                             ▼
                        Base Sepolia
                             │
                             ▼
                         Receipt
                             │
                             ▼
                    Receipt / State Verify
                             │
                             ▼
                           Core
                             │
                  ┌──────────┴──────────┐
                  ▼                     ▼
             Financial State         Audit
                                          │
                                          ▼
                                     Attestation
```

---

## 4. Core Integration Boundary

The only Core-facing execution abstraction is:

```ts
interface ExecutionClient {
  validate(request): Promise<...>;
  simulate(request): Promise<...>;
  execute(request): Promise<...>;
  getResult(executionId): Promise<...>;
  verify(request, result): Promise<...>;
}
```

The exact TypeScript signature must match the repository's existing interface. Do not invent a second version.

The real implementation will be:

```text
MockExecutionClient
BaseSepoliaExecutionClient
FutureExecutionClients
```

Core must not know which concrete implementation is active.

---

## 5. Internal Blockchain Architecture

```text
┌───────────────────────────────────────────────┐
│ Execution Client                              │
├───────────────────────────────────────────────┤
│ Chain Registry                                │
│ RPC Provider                                  │
│ Transaction Builder                           │
│ Transaction Decoder                           │
│ Transaction Analyzer                          │
│ Transaction Validator                         │
│ Simulation Engine                             │
│ Smart Account Adapter                         │
│ x402 Adapter                                  │
│ Receipt/State Verifier                        │
│ Attestation Adapter                           │
└───────────────────────────────────────────────┘
```

Each module should have one narrow responsibility.

---

## 6. Chain Registry

The chain registry owns network metadata.

```text
ChainRegistry
 ├── BaseSepolia
 ├── BaseMainnet (future)
 └── additional adapters (future)
```

A chain definition should contain:

```text
chain id
name
RPC configuration
explorer
native currency
supported assets
contract addresses
x402 network identifier
smart-account configuration
```

Source code must not scatter raw chain IDs.

---

## 7. RPC Abstraction

Higher layers consume a narrow RPC provider abstraction.

```text
RpcProvider
 ├── getChainId()
 ├── getBlockNumber()
 ├── getBalance()
 ├── getCode()
 ├── call()
 ├── estimateGas()
 ├── getTransaction()
 ├── getReceipt()
 └── getLogs()
```

Viem is the concrete EVM implementation in V1.

Provider selection remains configurable.

---

## 8. Transaction Pipeline

```text
ExecutionRequest
      ↓
Transaction Builder
      ↓
TransactionRequest
      ↓
Transaction Validator
      ↓
Transaction Decoder
      ↓
TransactionAnalyzer
      ↓
Simulation
      ↓
SimulationResult
      ↓
Execution
```

The exact transaction payload that passed simulation must be the payload that reaches execution.

Material changes invalidate the previous simulation.

---

## 9. Transaction Security Boundary

A natural-language proposal is not sufficient.

Example:

```text
Agent proposal:
"Pay 5 USDC to Provider A."
```

The blockchain layer must inspect the concrete transaction and independently derive:

```text
recipient
asset
amount
contract
function
parameters
network
state-changing effects
```

The execution layer trusts the transaction bytes and verified contract semantics, not the agent's explanation.

---

## 10. Simulation Boundary

Simulation must use chain semantics.

Allowed:

```text
eth_call
simulateContract
local fork/Anvil
trace/debug facilities
```

Not sufficient:

```text
LLM says it should work
```

Simulation returns the `SimulationResult` contract.

---

## 11. Smart Account Boundary

Preferred model:

```text
Core
 ↓
ExecutionRequest
 ↓
Smart Account
 ↓
UserOperation
 ↓
EntryPoint / bundler infrastructure
 ↓
Chain
```

The model/agent must never receive an unrestricted private key.

Signing infrastructure stays outside the AI reasoning context.

---

## 12. x402 Boundary

x402 is an execution/payment adapter:

```text
X402Adapter
```

It is not the authorization layer.

Flow:

```text
HTTP 402 payment requirement
 ↓
parse requirement
 ↓
map to execution context
 ↓
Core authorization
 ↓
x402 payment creation
 ↓
settlement
 ↓
verification
```

The same Core authorization boundary applies whether payment occurs through x402 or another future rail.

---

## 13. Receipt Verification

A successful RPC receipt is not enough.

Compare:

```text
authorized expectation
VS
actual transaction/receipt/state
```

Required verification dimensions:

```text
network
recipient
asset
amount
transaction status
relevant logs
expected state change
```

Mismatch must produce verification failure and must not silently become financial success.

---

## 14. Attestation

The attestation adapter writes compact commitments to an on-chain registry.

Conceptual data:

```text
agent_id
policy_hash
intent_id
trajectory_root
security_assessment_hash
decision
transaction_hash
timestamp
```

Do not put raw prompts, secrets, full trajectories, or proprietary evidence on-chain.

---

## 15. Failure Boundary

The blockchain layer must distinguish:

```text
VALIDATION_FAILED
SIMULATION_FAILED
SUBMISSION_FAILED
CONFIRMED
FAILED
UNKNOWN
VERIFICATION_FAILED
```

`UNKNOWN` is not `FAILED`.

It must be reconciled before retry.

---

## 16. Architectural Invariants

1. No raw execute endpoint outside ExecutionClient.
2. No AI access to signing keys.
3. No Core imports of viem/RPC/signer/wallet implementation.
4. No execution before required validation.
5. No execution before required simulation.
6. Simulation binds to exact payload.
7. No blind retry for UNKNOWN.
8. Receipt verification is independent.
9. Mainnet credentials never fall back from testnet configuration.
10. Blockchain code cannot change Core authorization state directly.

---

## 17. Reference Flow

```text
Human
 ↓
ML
 ↓
Core
 ↓
ALLOW
 ↓
Final Revalidation
 ↓
ExecutionRequest
 ↓
Blockchain Validation
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
