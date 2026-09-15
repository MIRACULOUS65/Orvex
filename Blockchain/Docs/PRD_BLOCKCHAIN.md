# SentinelPay — Blockchain & Execution Layer PRD

## Product Requirements Document — V1

**Document Type:** Engineering PRD  
**Team:** Blockchain / Execution  
**Product:** SentinelPay SDK  
**Version:** V1.0  
**Status:** Build Specification  
**Current Phase:** Post AI/ML → Core integration  
**Primary Goal:** Replace the deterministic mock execution adapter with a real, testnet-first execution system while preserving SentinelPay Core as the sole authorization boundary.

---

# 1. Current System State

The project has now reached the point where the AI/ML intelligence layer and SentinelPay Core are integrated and verified.

The verified flow is:

```text
Human
  ↓
Intent
  ↓
Agent Brain
  ↓
ActionProposal
  ↓
SecurityAssessment
  ↓
SentinelPay Core
  ↓
Policy + Decision Engine
  ↓
ALLOW / REVIEW / DENY
  ↓
Final Revalidation
  ↓
ExecutionRequest
  ↓
MockExecutionClient
```

The ML↔Core integration is verified through both in-process tests and a live two-service HTTP round-trip. The current reported state is 114 passing ML tests, 266 passing Core tests, clean typecheck, and a successful live round-trip. The existing AI/ML subsystem remains functionally unchanged; the integration was additive. fileciteturn3file12L1-L4

The next product milestone is therefore:

```text
REPLACE MOCK EXECUTION
          ↓
REAL BLOCKCHAIN EXECUTION
          ↓
REAL RECEIPT VERIFICATION
          ↓
REAL ATTESTATION PUBLICATION
```

Do not rebuild AI/ML. Do not redesign Core. Build the real execution layer behind the existing `ExecutionClient` boundary.

---

# 2. Mission of the Blockchain Team

The Blockchain / Execution team's mission is:

> **Turn an already-authorized SentinelPay ExecutionRequest into a precisely validated, simulated, executed, and independently verified payment without becoming an authorization engine itself.**

The team owns:

```text
1. Chain adapters
2. EVM RPC access
3. Transaction construction
4. Transaction decoding
5. Transaction analysis
6. Deterministic simulation
7. Smart-account integration
8. x402 integration
9. Signing boundary
10. Transaction submission
11. Execution-result retrieval
12. Receipt verification
13. On-chain attestation adapter
14. Blockchain-specific integration tests
15. Testnet deployment
```

The team does NOT own:

```text
AI reasoning
Intent interpretation
Policy authorization
DecisionEngine
Final authorization
Budget reservation semantics
Human approval authority
Core audit ownership
```

The existing Core owns final authorization. The blockchain layer executes exactly what has already been authorized.

---

# 3. Non-Negotiable Architecture

The execution boundary already exists:

```text
SentinelPay Core
       ↓
ExecutionRequest
       ↓
ExecutionClient
       ↓
Blockchain adapter
```

The blockchain implementation must plug into that boundary.

Core must NOT gain:

```text
viem imports
RPC clients
private keys
wallet clients
smart-account internals
x402 implementation
Base-specific execution logic
```

The correct architecture is:

```text
                    SENTINELPAY CORE
                           │
                           │ authorized ExecutionRequest
                           ▼
                  ┌───────────────────┐
                  │  ExecutionClient  │
                  └─────────┬─────────┘
                            │
            ┌───────────────┼────────────────┐
            │               │                │
            ▼               ▼                ▼
       validate()       simulate()       execute()
            │               │                │
            └───────────────┼────────────────┘
                            ▼
                   Blockchain Adapter
                            │
             ┌──────────────┼───────────────┐
             ▼              ▼               ▼
          Base EVM      Smart Account      x402
             │              │               │
             └──────────────┼───────────────┘
                            ▼
                       Base Sepolia
                            │
                            ▼
                         Receipt
                            │
                            ▼
                       Verification
                            │
                            ▼
                          Core
```

The Core decides **whether** execution is authorized.

The Blockchain layer determines **how** the already-authorized operation is validated and executed.

---

# 4. Governing Principle

The blockchain layer must never infer authorization from an AI proposal.

It receives an authorized execution request from Core.

Therefore:

```text
AI suggestion
      ≠
Execution authority
```

and:

```text
ExecutionRequest
      ≠
blind instruction to broadcast
```

The blockchain layer still performs deterministic validation and simulation before the final broadcast.

The design is intentionally defense-in-depth:

```text
AI
 ↓
Core policy
 ↓
Final revalidation
 ↓
ExecutionRequest
 ↓
Blockchain transaction validation
 ↓
Deterministic simulation
 ↓
Execution
 ↓
Receipt verification
```

---

# 5. V1 Blockchain Target

## Primary network

**Base Sepolia**

Current Base documentation identifies:

```text
Base Mainnet   = 8453
Base Sepolia   = 84532
```

Base's JSON-RPC API exposes the standard Ethereum JSON-RPC interface, including `eth_chainId`. citeturn119684search2turn119684search3

V1 progression:

```text
Local Anvil
    ↓
Base Sepolia
    ↓
Base Mainnet later
    ↓
Additional chain adapters later
```

Base Sepolia is an implementation target, not the permanent public-SDK abstraction. The SDK must remain chain-agnostic.

---

# 6. Payment Asset

For the reference machine-payment path:

```text
USDC
```

The x402 documentation currently lists Base Sepolia USDC as:

```text
Network:       eip155:84532
Token:         USDC
Address:       0x036CbD53842c5426634e7929541eC2318f3dCF7e
Decimals:      6
Transfer:      EIP-3009
```

The address must remain configuration-driven rather than scattered throughout application code. citeturn725370search0

---

# 7. Technology Stack

## Application runtime

```text
Node.js
TypeScript
```

The execution adapter should live in the existing TypeScript execution environment.

## EVM client

```text
viem
```

Use viem for:

```text
RPC access
contract reads/writes
ABI encoding
ABI decoding
transaction preparation
chain interaction
receipt retrieval
```

The existing project stack explicitly selects viem as the primary EVM client and avoids duplicating viem and ethers for the same responsibilities.

## Smart contracts / local chain

```text
Solidity
Foundry
```

Use:

```text
forge  → build / test / deploy / verify
anvil  → local Ethereum JSON-RPC development node
cast   → chain interaction / debugging
```

Foundry's official documentation describes `forge` as the build/test/deploy tool, `anvil` as a local Ethereum JSON-RPC node, and `cast` as the chain-interaction CLI. citeturn725370search1turn725370search7

## Account abstraction

```text
ERC-4337-compatible Smart Account
```

ERC-4337 defines `UserOperation`, EntryPoint, Smart Contract Accounts, bundlers, and optional paymasters. It also defines UserOperation simulation/validation as part of the execution path. citeturn119684search4

## Machine payment rail

```text
x402 + USDC
```

x402 supports Base Sepolia and uses CAIP-2 network identifiers such as `eip155:84532`. Its current documentation also shows USDC as a default EVM asset for Base Sepolia and examples of usage-based `upto` payments. citeturn725370search0turn725370search4

## Testing

```text
Vitest
Foundry tests
Anvil
Base Sepolia integration tests
```

---

# 8. Blockchain Layer Components

The implementation should be divided into the following components.

```text
1. Chain Registry
2. RPC Provider
3. Transaction Builder
4. Transaction Decoder
5. Transaction Analyzer
6. Transaction Validator
7. Simulation Engine
8. Smart Account Adapter
9. x402 Adapter
10. ExecutionClient implementation
11. Receipt/State Verifier
12. Attestation Adapter
13. Blockchain Configuration
14. Blockchain Test Harness
```

Each component must have a narrow responsibility.

---

# 9. Component 1 — Chain Registry

Create a chain abstraction.

Conceptually:

```text
ChainRegistry
 ├── BaseSepolia
 └── future BaseMainnet
```

Each network definition should include:

```text
chainId
name
native currency
RPC configuration
explorer configuration
supported assets
contract addresses
smart-account configuration
x402 network identifier
```

Do not scatter chain IDs throughout source code.

The adapter must validate the chain at runtime using the configured chain ID and the connected RPC's reported chain ID. Base documents `eth_chainId` as the authoritative RPC method for querying the connected network; Base Sepolia reports `84532`. citeturn119684search2

---

# 10. Component 2 — RPC Provider

Create a provider abstraction around viem.

Responsibilities:

```text
getChainId()
getBlockNumber()
getBalance()
getCode()
call()
estimateGas()
getTransaction()
getTransactionReceipt()
getLogs()
```

The higher layers must not know whether the underlying RPC provider is:

```text
Alchemy
Base public RPC
another compatible provider
local Anvil
```

Configuration must decide the provider.

---

# 11. Component 3 — Transaction Builder

Create:

```text
TransactionBuilder
```

Input:

```text
TransactionIntent / ExecutionRequest
```

Output:

```text
TransactionRequest
```

The builder must construct the exact EVM operation required by the authorized payment.

For a simple ERC-20 payment this means producing the correctly encoded contract call, recipient, asset, amount, sender context, and chain.

All financial amounts remain exact integer/decimal representations. Do not use floating-point arithmetic for authorization or token-unit calculations.

---

# 12. Component 4 — Transaction Decoder

Create:

```text
TransactionDecoder
```

It must decode the concrete transaction and determine:

```text
chain
sender
recipient
contract
function selector
function name where ABI is known
parameters
asset
actioned amount
approvals
nested calls where relevant
```

The decoder must never rely on:

```text
agent explanation
LLM reasoning
human-readable description
```

as proof of what the transaction does.

---

# 13. Component 5 — Transaction Analyzer

Create:

```text
TransactionAnalyzer
```

Input:

```text
TransactionRequest
```

Output:

```text
TransactionAnalysis
```

It should identify:

```text
expected recipient
actual recipient
expected asset
actual asset
expected amount
actual amount
contract
function
network
potential approvals
unexpected state-changing operations
```

This is one of SentinelPay's critical security boundaries.

Example:

```text
Proposal says:
PAY 5 USDC to API provider

Actual calldata:
approve(spender, 2^256-1)
```

The analyzer must surface the mismatch.

---

# 14. Component 6 — Transaction Validator

The validator should run deterministic checks before simulation.

Minimum checks:

```text
chain identity
sender identity
recipient
asset
amount
contract
function
calldata
execution context hash
idempotency context
allowed network
```

Failure must prevent execution.

---

# 15. Component 7 — Deterministic Simulation

Simulation is NOT an LLM task.

Use actual blockchain semantics.

Primary mechanisms:

```text
eth_call
viem simulateContract where applicable
local Anvil/fork simulation
trace/debug facilities where available
```

Viem's current documentation states that `simulateContract` validates a contract interaction without modifying blockchain state and is intended to be paired with `writeContract` for validated writes. `writeContract` broadcasts but does not itself guarantee that the write will succeed. citeturn119684search0turn119684search1

Therefore our execution sequence must be:

```text
Construct
   ↓
Validate
   ↓
Simulate
   ↓
Analyze result
   ↓
Confirm exact payload is unchanged
   ↓
Execute
```

The `SimulationResult` must include, where available:

```text
status
would_revert
revert_reason
gas estimate
expected state changes
balance changes
token transfers
contract interactions
simulator/provider metadata
```

---

# 16. Simulation Binding

A successful simulation is valid only for the exact transaction candidate that was simulated.

Bind simulation to:

```text
transaction payload hash
chain ID
sender
recipient
asset
amount
policy/authorization context where relevant
```

If a material field changes after simulation:

```text
old simulation = INVALID
new simulation required
```

This is mandatory.

---

# 17. Component 8 — Smart Account

Use an ERC-4337-compatible smart-account architecture.

The desired security boundary is:

```text
Agent
 ↓
SentinelPay Core
 ↓
Capability / authorization
 ↓
Smart Account
 ↓
Allowed operation
```

Not:

```text
Agent
 ↓
Raw private key
 ↓
Unlimited wallet
```

ERC-4337 uses `UserOperation` objects submitted through an EntryPoint/bundler architecture rather than treating the user's action as a conventional transaction from a raw key. The EIP also requires chain/EntryPoint binding for signature-based replay protection. citeturn119684search4

The signing authority must remain outside AI model context.

---

# 18. Smart Account Implementation Strategy

Do not start by inventing a custom account-abstraction protocol.

Use a proven ERC-4337-compatible implementation/provider where possible.

The adapter should isolate:

```text
smart-account implementation
bundler
EntryPoint
paymaster if used
signature mechanism
nonce strategy
```

The SentinelPay Core must see only:

```text
ExecutionRequest
ExecutionResult
```

---

# 19. UserOperation Flow

Conceptually:

```text
ExecutionRequest
      ↓
TransactionRequest
      ↓
SmartAccountAdapter
      ↓
UserOperation
      ↓
UserOperation validation/simulation
      ↓
Bundler
      ↓
EntryPoint
      ↓
Smart Account execution
      ↓
Base Sepolia
```

Do not allow a stale or modified Core `ExecutionRequest` to be transformed into a different UserOperation without invalidating the execution context.

---

# 20. Component 9 — x402 Adapter

x402 is a payment/execution adapter, not the security system.

The current x402 documentation supports Base Sepolia with `eip155:84532` and USDC. It also documents `exact`, `upto`, and batch-settlement payment schemes. citeturn725370search0turn725370search4

V1 should initially implement the simplest useful path:

```text
service returns 402
      ↓
payment requirement parsed
      ↓
SentinelPay creates authorized payment context
      ↓
Core authorizes
      ↓
Execution layer performs x402 payment
      ↓
service accepts payment
      ↓
response returned
```

The x402 adapter must validate:

```text
network
asset
recipient/payment destination
maximum amount
payment scheme
resource/origin where applicable
```

Do not accept an arbitrary 402 response as permission to spend.

---

# 21. Component 10 — Real ExecutionClient

Implement:

```text
BaseSepoliaExecutionClient
```

behind the existing interface:

```text
validate()
simulate()
execute()
getResult()
verify()
```

The Core should not need to know that the implementation is Base Sepolia.

The factory should select the implementation based on configuration:

```text
ExecutionClientFactory
    ↓
BaseSepoliaExecutionClient
```

Later:

```text
BaseMainnetExecutionClient
OtherChainExecutionClient
```

---

# 22. ExecutionClient.validate()

Responsibilities:

```text
validate ExecutionRequest
validate chain
validate context binding
validate transaction payload
validate supported payment rail
validate asset
validate recipient
validate idempotency
```

No broadcast.

No state mutation.

---

# 23. ExecutionClient.simulate()

Responsibilities:

```text
construct exact candidate
simulate it
produce SimulationResult
attach transaction hash/payload binding
```

No broadcast.

No financial commit.

---

# 24. ExecutionClient.execute()

This is the ONLY real broadcast boundary.

Requirements:

```text
valid ExecutionRequest
fresh final authorization context
simulation passed where required
exact payload unchanged
idempotency key valid
signer/smart account available
chain identity verified
```

The method must return an execution identifier / transaction hash and transition the Core's existing execution state machine through the normal `ExecutionResultService` path.

Do not implement financial commit inside the blockchain adapter.

---

# 25. Signing Boundary

Signing must be isolated from:

```text
AI process
Core process
model prompts
trajectory payloads
SecurityAssessment
ActionProposal
```

Preferred:

```text
Execution Adapter
       ↓
Secure signer / Smart Account
```

Development may use a dedicated low-value testnet signer where unavoidable.

Production should move toward a secure signer/HSM/KMS or controlled smart-account signing architecture.

Never store real private keys in Git.

Never put private keys in `.md`, tests, fixtures, logs, prompts, or audit events.

---

# 26. Testnet Wallet

Create a dedicated Base Sepolia test wallet/account for development.

Rules:

```text
testnet only
authorized team members only
minimal funds
automated rotation/recovery where appropriate
no production funds
```

The development private key, if used temporarily, must exist only in a secure environment variable/secret store.

---

# 27. Component 11 — Receipt Verification

After execution:

```text
transaction hash
       ↓
receipt retrieval
       ↓
logs/events
       ↓
state/balance checks where required
       ↓
ReceiptVerification
```

Compare expected vs actual:

```text
network
sender where relevant
recipient
asset
amount
contract
function/action
transaction success
expected state change
```

A successful transaction receipt does not automatically mean a successful SentinelPay payment.

Example:

```text
Expected:
5 USDC → Provider A

Actual:
5 USDC → Attacker B

Blockchain:
SUCCESS

SentinelPay:
VERIFICATION_FAILED
```

---

# 28. Unknown Execution State

The blockchain layer must preserve the Core's existing UNKNOWN semantics.

Example:

```text
broadcast
 ↓
network timeout
 ↓
receipt unavailable
```

This is:

```text
UNKNOWN
```

NOT:

```text
FAILED
```

and definitely not:

```text
retry immediately
```

Reconciliation must determine whether the original transaction was included before any retry is considered.

The existing Core financial reservation system remains responsible for holding the budget while the state is UNKNOWN.

---

# 29. Idempotency and Replay

Every execution must use the existing `idempotency_key` from `ExecutionRequest`.

The execution layer must not create a second transaction for the same logical request simply because an HTTP/RPC request timed out.

The system must distinguish:

```text
not submitted
submitted but unknown
confirmed
failed
```

before deciding whether another attempt is permissible.

ERC-4337's own model includes nonce-based replay protection, with chain/EntryPoint binding relevant to signature uniqueness; SentinelPay still needs its application-level idempotency semantics above that protocol layer. citeturn119684search4

---

# 30. Component 12 — Attestation Adapter

The existing Core already has an abstract attestation boundary.

Implement a real blockchain adapter for the Solidity registry.

Use:

```text
Solidity
Foundry
Base Sepolia
viem
```

The registry should store compact commitments rather than raw agent traces.

Suggested record:

```text
agent_id
policy_hash
intent_id or reference
trajectory_root
security_assessment_hash
decision
transaction_hash
timestamp
```

The existing architecture explicitly treats the on-chain layer as a public proof/commitment mechanism, not a storage location for complete traces. fileciteturn3file4L1-L3

Attestation failure remains isolated from payment state.

---

# 31. Solidity Attestation Registry

V1 responsibilities should stay minimal.

Example conceptual interface:

```solidity
interface IAttestationRegistry {
    function attest(
        bytes32 traceRoot,
        bytes32 policyHash,
        bytes32 securityAssessmentHash,
        bytes32 transactionHash,
        uint8 decision,
        uint64 timestamp
    ) external;

    function getAttestation(bytes32 transactionHash)
        external
        view
        returns (...);
}
```

The actual interface must be finalized against the existing `AttestationRecord` contract and repository contracts.

Do not introduce custodial funds into the registry.

---

# 32. Local Development Strategy

Build blockchain functionality from the cheapest/most deterministic environment upward.

## Stage 1 — Anvil

Use Foundry Anvil.

Test:

```text
transaction construction
contract calls
USDC-like token fixture
simulation
execution
receipt
verification
attestation
```

## Stage 2 — Anvil fork where useful

Use a local fork when stateful mainnet/testnet-style behavior matters.

## Stage 3 — Base Sepolia

Use real RPC and testnet assets.

## Stage 4 — Real x402 integration

Connect to an x402-compatible service.

## Stage 5 — Real Smart Account path

Use the selected ERC-4337 implementation and bundler infrastructure.

---

# 33. Phase Plan

The blockchain work must be implemented in the following phases.

---

# Phase B0 — Execution Boundary Freeze

## Objective

Lock the existing interface before implementing real blockchain behavior.

## Tasks

- inspect `ExecutionClient`
- inspect `ExecutionRequest`
- inspect `TransactionRequest`
- inspect `TransactionAnalysis`
- inspect `SimulationResult`
- inspect `ExecutionResult`
- inspect `ReceiptVerification`
- inspect `AttestationRecord`
- inspect `FinalRevalidationService`
- inspect `ExecutionResultService`
- inspect `FinancialService`
- inspect existing mock adapter

## Deliverables

```text
ExecutionClient remains unchanged unless an explicit contract gap exists.
Blockchain adapter interface mapping documented.
Mock tests remain green.
```

## Exit Criteria

```text
[ ] Core still typechecks
[ ] Core tests pass
[ ] no blockchain imports in Core
[ ] no wallet in Core
```

---

# Phase B1 — Blockchain Repository / Tooling Foundation

## Objective

Create an isolated blockchain implementation area.

## Build

```text
Blockchain/ or existing execution package
├── src/
├── contracts/
├── test/
├── scripts/
├── foundry.toml
└── README.md
```

Add:

```text
viem
Foundry
Anvil tooling
chain configuration
environment validation
```

## Exit Criteria

```text
forge build ✅
forge test ✅
anvil starts ✅
TypeScript package builds ✅
```

---

# Phase B2 — Chain Registry + RPC Layer

## Objective

Create the chain abstraction and reliable RPC boundary.

## Build

```text
ChainRegistry
BaseSepoliaConfig
RpcProvider
```

## Tests

```text
correct chain ID
wrong chain ID
RPC unavailable
RPC timeout
invalid configuration
```

## Exit Criteria

```text
local Anvil works
Base Sepolia read works
chain mismatch fails closed
```

---

# Phase B3 — Transaction Builder + Decoder

## Objective

Construct and decode deterministic ERC-20 payment transactions.

## Build

```text
TransactionBuilder
TransactionDecoder
TransactionAnalyzer
TransactionValidator
```

## First target

Simple:

```text
USDC transfer
```

Do not start with arbitrary contract calls.

## Exit Criteria

```text
TransactionIntent
 ↓
builder
 ↓
TransactionRequest
 ↓
decoder
 ↓
TransactionAnalysis
```

The decoded recipient/asset/amount/network must exactly match the intended action.

---

# Phase B4 — Deterministic Simulation

## Objective

Prove the transaction will behave as expected before execution.

## Build

```text
Simulator
SimulationResult
payload hash binding
revert decoding
expected state-change extraction
```

## Test Cases

```text
valid transfer
insufficient balance
wrong recipient
wrong asset
revert
invalid contract
unexpected calldata
wrong network
```

## Exit Criteria

```text
every executable transaction has a simulation state
material payload mutation invalidates simulation
```

---

# Phase B5 — Local Execution

## Objective

Execute the validated transaction against Anvil.

Flow:

```text
ExecutionRequest
 ↓
validate
 ↓
simulate
 ↓
execute
 ↓
receipt
 ↓
verify
```

## Exit Criteria

```text
valid payment succeeds
invalid payment never broadcasts
receipt returned
verification passes
```

---

# Phase B6 — Real Base Sepolia Execution

## Objective

Move the same execution implementation from Anvil to Base Sepolia.

Base Sepolia is chain ID `84532`; verify the RPC reports that chain before every testnet execution. citeturn119684search2turn119684search3

## Build

```text
BaseSepoliaExecutionClient
BaseSepolia RPC config
USDC config
Testnet signer/Smart Account config
Explorer links
```

## Exit Criteria

```text
testnet read works
simulation works
testnet transaction executes
receipt is retrieved
receipt is independently verified
```

---

# Phase B7 — Smart Account / ERC-4337

## Objective

Replace unrestricted EOA-style execution with a constrained smart-account path.

## Build

```text
SmartAccountAdapter
UserOperation builder
UserOperation simulator
Bundler adapter
EntryPoint configuration
nonce/replay controls
```

## Exit Criteria

```text
authorized ExecutionRequest
 ↓
UserOperation
 ↓
validation
 ↓
bundler
 ↓
EntryPoint
 ↓
smart-account execution
 ↓
receipt
```

The model never sees the signing credential.

---

# Phase B8 — x402

## Objective

Demonstrate an actual machine-to-machine payment flow.

## Build

```text
X402Adapter
PaymentRequirement parser
PaymentAuthorization builder
Facilitator integration
Settlement verification
```

## First flow

```text
Agent
 ↓
API request
 ↓
HTTP 402
 ↓
x402 requirement
 ↓
SentinelPay Core authorization
 ↓
x402 payment
 ↓
API response
```

The x402 docs currently demonstrate Base Sepolia with `eip155:84532` and a USDC-based EVM scheme, including fixed and usage-based settlement modes. citeturn725370search4

---

# Phase B9 — Receipt / State Verification

## Objective

Make the blockchain result authoritative for actual financial state.

## Build

```text
ReceiptVerifier
StateChangeVerifier
TokenTransferDecoder
```

Compare:

```text
authorized
vs
submitted
vs
actual
```

## Exit Criteria

```text
correct result → VERIFIED
wrong recipient → MISMATCH
wrong amount → MISMATCH
wrong network → MISMATCH
failed receipt → FAILED
unknown receipt → UNKNOWN
```

---

# Phase B10 — Attestation Registry

## Objective

Publish compact cryptographic proof after verified outcomes.

## Build

```text
AttestationRegistry.sol
AttestationAdapter
Deployment script
Verification script
```

## Exit Criteria

```text
verified execution
 ↓
attestation payload
 ↓
Solidity registry
 ↓
transaction hash
 ↓
read-back verification
```

Attestation failure must not rewrite payment state.

---

# Phase B11 — Implement Real ExecutionClient

## Objective

Connect the complete blockchain stack to the existing Core interface.

Replace:

```text
MockExecutionClient
```

with:

```text
BaseSepoliaExecutionClient
```

but leave Core architecture intact.

Final path:

```text
Core
 ↓
FinalRevalidation
 ↓
ExecutionRequest
 ↓
BaseSepoliaExecutionClient
 ↓
validate
 ↓
simulate
 ↓
execute
 ↓
ExecutionResult
 ↓
ReceiptVerification
 ↓
Financial Commit
 ↓
Audit
 ↓
Attestation
```

## Exit Criteria

```text
no Core redesign
no raw execution bypass
real Base Sepolia settlement
verified financial result
```

---

# Phase B12 — Full End-to-End SentinelPay

This is the blockchain team's final integration milestone.

Target:

```text
Human
 ↓
Intent
 ↓
Agent Brain
 ↓
ActionProposal
 ↓
SecurityAssessment
 ↓
Core
 ↓
Policy
 ↓
ALLOW / REVIEW / DENY
 │
 ├── DENY → STOP
 │
 ├── REVIEW → Human Approval
 │
 └── ALLOW
       ↓
Final Revalidation
       ↓
ExecutionRequest
       ↓
BaseSepoliaExecutionClient
       ↓
Transaction Analysis
       ↓
Simulation
       ↓
Smart Account / x402
       ↓
Base Sepolia
       ↓
Receipt
       ↓
Receipt Verification
       ↓
Financial Commit
       ↓
Audit
       ↓
Attestation
```

---

# 34. Hero Blockchain Demo

The first complete demo should use a simple machine-to-machine payment.

Example:

```text
User:
"Find a useful API and pay up to $10."
```

The legitimate path should produce:

```text
API provider
 ↓
ActionProposal
 ↓
Security PASS
 ↓
Core ALLOW
 ↓
Final Revalidation
 ↓
USDC / x402 payment
 ↓
Base Sepolia
 ↓
Verified receipt
 ↓
Attestation
```

The attack path should produce:

```text
Malicious webpage
 ↓
payment redirection
 ↓
ActionProposal with attacker recipient
 ↓
Security HIGH
 ↓
Core DENY
 ↓
NO blockchain transaction
```

This directly demonstrates the SentinelPay product thesis: the AI can be manipulated without giving it unrestricted financial authority.

---

# 35. Security Requirements

Before enabling the real adapter, all of these must be true:

```text
[ ] chain ID verified
[ ] RPC network verified
[ ] sender verified
[ ] recipient verified
[ ] asset verified
[ ] amount verified
[ ] contract verified
[ ] function/calldata decoded
[ ] transaction analysis passed
[ ] simulation passed
[ ] simulation bound to exact payload
[ ] authorization context still valid
[ ] idempotency key enforced
[ ] replay protection handled
[ ] signer isolated
[ ] private key not visible to AI/Core
[ ] mainnet disabled
[ ] receipt independently verified
[ ] UNKNOWN state reconciled safely
[ ] no double-spend on retries
[ ] attestation isolated from financial state
```

---

# 36. Blockchain Tests

## Unit tests

```text
chain configuration
amount conversion
ABI encoding
ABI decoding
transaction builder
transaction decoder
chain validation
```

## Simulation tests

```text
success
revert
insufficient balance
wrong recipient
unexpected call
unexpected state change
```

## Execution tests

```text
successful execution
failure
UNKNOWN
retry
idempotency
receipt retrieval
```

## Smart-account tests

```text
valid UserOperation
invalid UserOperation
replay
wrong EntryPoint
wrong chain
bad signature
capability violation
```

## x402 tests

```text
valid 402
invalid network
invalid token
amount exceeds policy
wrong payment recipient
settlement success
settlement mismatch
```

## Attestation tests

```text
write
read-back
hash mismatch
duplicate attestation
failed RPC
failure isolation
```

---

# 37. Critical Blockchain Security Tests

### Test 1 — Wrong Recipient

Authorized:

```text
$5 USDC → Provider A
```

Actual transaction:

```text
$5 USDC → Provider B
```

Expected:

```text
validation or verification failure
NO financial commit
```

### Test 2 — Wrong Network

```text
ExecutionRequest = Base Sepolia
Transaction = Base Mainnet
```

Expected:

```text
DENY / validation failure
```

### Test 3 — Payload Mutation

```text
simulation payload = A
execution payload = B
```

Expected:

```text
B is rejected
```

### Test 4 — Unknown Timeout

```text
broadcast
 ↓
RPC timeout
 ↓
receipt unknown
```

Expected:

```text
UNKNOWN
reservation held
NO blind retry
```

### Test 5 — Duplicate Request

Same `idempotency_key` submitted twice.

Expected:

```text
one logical execution
```

### Test 6 — AI Does Not Bypass Blockchain Validation

AI says:

```text
recipient = Provider A
```

actual transaction:

```text
recipient = B
```

Expected:

```text
validation failure
```

### Test 7 — Simulation Revert

Expected:

```text
no broadcast
```

### Test 8 — Receipt Mismatch

Blockchain reports success but actual event data does not match the authorized amount/recipient.

Expected:

```text
VERIFICATION_FAILED
NO financial commit
```

---

# 38. Environment Configuration

Development:

```env
BLOCKCHAIN_ENV=local
BASE_SEPOLIA_CHAIN_ID=84532
BASE_SEPOLIA_RPC_URL=
BASE_SEPOLIA_USDC_ADDRESS=
```

Execution:

```env
EXECUTION_MODE=mock|testnet
EXECUTION_SIGNER_REFERENCE=
SMART_ACCOUNT_ADDRESS=
BUNDLER_RPC_URL=
BUNDLER_API_KEY=
```

x402:

```env
X402_ENABLED=false
X402_NETWORK=eip155:84532
X402_ASSET=USDC
X402_FACILITATOR_URL=
X402_FACILITATOR_API_KEY=
```

Attestation:

```env
ATTESTATION_REGISTRY_ADDRESS=
ATTESTATION_DEPLOYER_REFERENCE=
```

No production credentials in source control.

---

# 39. Mainnet Safety

Mainnet is out of scope for the first implementation milestone.

The configuration must make accidental mainnet use difficult.

Rules:

```text
TESTNET_RPC != MAINNET_RPC
TESTNET_SIGNER != MAINNET_SIGNER
TESTNET_CONTRACTS != MAINNET_CONTRACTS
TESTNET_ENV != PRODUCTION
```

No automatic fallback:

```text
Base Sepolia → Base Mainnet
```

A missing testnet RPC must not silently use a mainnet RPC.

---

# 40. Secrets

Never put the following into:

```text
AI prompts
ActionProposal
SecurityAssessment
TrajectoryEvent
AuditEvent
AttestationRecord
Git
tests
fixtures
```

Secrets include:

```text
private keys
seed phrases
API keys
OAuth secrets
bundler keys
facilitator keys
RPC credentials
signer credentials
```

Use environment variables locally and managed secret storage in deployment.

---

# 41. Observability

The Blockchain layer should emit structured events such as:

```text
transaction.validate.started
transaction.validate.completed
transaction.simulation.started
transaction.simulation.completed
execution.submission.started
execution.submitted
execution.confirmed
execution.failed
execution.unknown
receipt.verification.started
receipt.verification.completed
attestation.submission.started
attestation.submission.completed
attestation.failed
```

Every event should include:

```text
correlation_id
company_id
agent_id
execution_id
transaction_id
```

Never log private signing material.

---

# 42. Performance Expectations

Correctness and security take priority over raw throughput.

The implementation should still support:

```text
bounded RPC retries
request timeouts
receipt polling backoff
simulation caching only when safely bound
connection pooling
concurrent read operations
```

Never optimize by skipping required validation or simulation.

---

# 43. Failure Classification

Blockchain errors must be normalized.

Recommended categories:

```text
CHAIN_MISMATCH
RPC_UNAVAILABLE
RPC_TIMEOUT
INVALID_TRANSACTION
SIMULATION_FAILED
INSUFFICIENT_FUNDS
SIGNING_FAILED
BUNDLER_REJECTED
USER_OPERATION_REJECTED
TRANSACTION_REVERTED
TRANSACTION_UNKNOWN
RECEIPT_MISMATCH
VERIFICATION_FAILED
ATTESTATION_FAILED
CONFIGURATION_ERROR
```

The Core must be able to distinguish:

```text
known failure
```

from:

```text
unknown execution state
```

---

# 44. Development Sequence — Exact Order

The blockchain team should execute in this exact order:

```text
B0  Freeze / inspect execution boundary
        ↓
B1  Tooling + repository foundation
        ↓
B2  Chain registry + RPC
        ↓
B3  Transaction builder + decoder + validator
        ↓
B4  Deterministic simulation
        ↓
B5  Local Anvil execution
        ↓
B6  Base Sepolia execution
        ↓
B7  Smart Account / ERC-4337
        ↓
B8  x402
        ↓
B9  Receipt/state verification hardening
        ↓
B10 Attestation Registry
        ↓
B11 Real ExecutionClient integration
        ↓
B12 Full SentinelPay E2E
```

Do not reverse the dependency order.

Do not start with x402 before simple transaction execution works.

Do not start with mainnet.

Do not connect real execution to Core until the standalone blockchain tests pass.

---

# 45. Parallel Team Strategy

While the Blockchain team works, the other teams should not be blocked.

AI/ML:

```text
maintain integration
fix model/security regressions only
```

Backend/Core:

```text
maintain deterministic execution boundary
support integration contracts
```

Blockchain:

```text
build real execution adapter
```

SDK/UI:

```text
can consume existing mock execution
then switch to real adapter once B11 is complete
```

---

# 46. Final Integration Test

The blockchain phase is considered complete only when this exact path works:

```text
Human
 ↓
AI/ML
 ↓
Intent
 ↓
Agent Brain
 ↓
ActionProposal
 ↓
SecurityAssessment
 ↓
Core
 ↓
Policy
 ↓
ALLOW
 ↓
FinalRevalidation
 ↓
ExecutionRequest
 ↓
Real ExecutionClient
 ↓
TransactionValidation
 ↓
Simulation
 ↓
Smart Account / x402
 ↓
Base Sepolia
 ↓
ExecutionResult
 ↓
ReceiptVerification
 ↓
Financial Commit
 ↓
Audit
 ↓
Attestation
```

And the blocked attack must work:

```text
Malicious external instruction
 ↓
Agent manipulated
 ↓
Malicious ActionProposal
 ↓
SecurityAssessment HIGH
 ↓
Core DENY
 ↓
NO ExecutionRequest
 ↓
NO blockchain transaction
```

---

# 47. Definition of Done — Blockchain Layer

The Blockchain / Execution phase is complete only when:

```text
[ ] ExecutionClient implementation exists
[ ] Base Sepolia adapter works
[ ] Chain registry works
[ ] RPC layer works
[ ] TransactionBuilder works
[ ] TransactionDecoder works
[ ] TransactionAnalyzer works
[ ] TransactionValidator works
[ ] deterministic simulation works
[ ] Anvil tests pass
[ ] Base Sepolia test passes
[ ] Smart Account path works
[ ] x402 adapter works for the reference flow
[ ] receipt verification works
[ ] UNKNOWN execution is safe
[ ] idempotency works
[ ] replay protection works
[ ] attestation registry works
[ ] attestation read-back works
[ ] Core uses the real adapter without architecture changes
[ ] no raw execution bypass exists
[ ] no AI signing authority exists
[ ] no private key reaches AI
[ ] mainnet remains disabled
[ ] all existing Core tests pass
[ ] all Blockchain tests pass
[ ] full E2E passes
```

---

# 48. Final Architecture After Blockchain Completion

```text
                         HUMAN
                           │
                           ▼
                      AI / ORVEX
                           │
                           ▼
                        INTENT
                           │
                           ▼
                     AGENT BRAIN
                           │
                           ▼
                  ACTION PROPOSAL
                           │
                           ▼
               SECURITY ASSESSMENT
                           │
                           ▼
                    SENTINEL CORE
                           │
                 POLICY + DECISION
                           │
             ┌─────────────┼────────────┐
             ▼             ▼            ▼
           DENY          REVIEW        ALLOW
                           │             │
                           │             ▼
                           │      FINAL REVALIDATION
                           │             │
                           │             ▼
                           │      EXECUTION REQUEST
                           │             │
                           │             ▼
                           │      BLOCKCHAIN LAYER
                           │             │
                           │     ┌───────┼────────┐
                           │     ▼       ▼        ▼
                           │  Validate Simulate Execute
                           │             │        │
                           │             │        ▼
                           │             │   Smart Account
                           │             │      / x402
                           │             │        │
                           │             └────────┤
                           │                      ▼
                           │                 Base Sepolia
                           │                      │
                           │                      ▼
                           │                    Receipt
                           │                      │
                           │                      ▼
                           │              Receipt Verification
                           │                      │
                           │                      ▼
                           │               Financial Commit
                           │                      │
                           │                      ▼
                           │                     Audit
                           │                      │
                           │                      ▼
                           │                 Attestation
                           │
                           └──── approval when required
```

---

# 49. Remaining Product Roadmap After Blockchain

Once B0–B12 are complete, the remaining product work is no longer basic infrastructure. It becomes product hardening and SDKization.

Recommended next order:

```text
Blockchain + Core integration
        ↓
Full E2E testnet demo
        ↓
Human approval/dashboard polish
        ↓
Public SDK packaging
        ↓
MCP/framework adapters
        ↓
Developer onboarding
        ↓
Security/red-team hardening
        ↓
Reliability / observability hardening
        ↓
Production secret management
        ↓
Base mainnet readiness review
        ↓
Additional payment rails / chains
```

Do not jump to multi-chain or mainnet before the single reference flow is robust.

---

# 50. Kiro / Implementation Rules

When implementing this PRD, Kiro must:

1. Read `CONTRACTS.md`, `SECURITY_MODEL.md`, `SDK_SPEC.md`, `TECH_STACK.md`, `WORKFLOW.md`, and the existing Backend/ML implementation first.
2. Preserve the existing `ExecutionClient` contract.
3. Do not modify AI/ML to move blockchain logic into Python.
4. Do not add wallet/RPC/viem logic to Core.
5. Keep transaction construction deterministic.
6. Keep simulation deterministic.
7. Never let an AI output authorize an execution.
8. Bind simulation to the exact transaction payload.
9. Preserve idempotency.
10. Preserve UNKNOWN execution handling.
11. Never blindly retry an unknown transaction.
12. Verify actual receipt/state against the authorized expectation.
13. Keep attestation failure isolated.
14. Keep Base-specific details inside adapters.
15. Never commit private keys or secrets.
16. Never silently fall back from Base Sepolia to mainnet.
17. Write tests before declaring each blockchain phase complete.
18. Run the complete existing Core suite after integrating the real adapter.
19. Do not create parallel transaction or execution abstractions unless a genuine contract gap is discovered.
20. If a contract gap is discovered, update the shared contract first, then update all affected consumers and tests.

---

# 51. Final Blockchain Product Thesis

The Blockchain layer is not the security system.

It is the **trusted execution and verification layer** beneath SentinelPay Core.

The final responsibility split is:

```text
AI / ML
    Understands
    Reasons
    Plans
    Detects
    Assesses
    Explains

CORE
    Enforces
    Authorizes
    Revalidates
    Reserves
    Decides

BLOCKCHAIN / EXECUTION
    Constructs
    Decodes
    Simulates
    Signs
    Executes
    Retrieves
    Verifies

AUDIT / ATTESTATION
    Records
    Commits
    Proves
```

The target property is:

> **A compromised AI may propose a bad action, but it cannot cause SentinelPay to execute an unauthorized or materially different financial action.**

The implementation should therefore optimize for one thing above all else:

```text
Correct authorized transaction
        ↓
Exact simulation
        ↓
Exact execution
        ↓
Independent verification
        ↓
Tamper-evident proof
```

That is the blockchain contribution to the SentinelPay architecture.

---

# 52. Source Notes

The blockchain PRD is grounded in the project's existing architecture documents and the current official documentation for the selected V1 infrastructure:

- The existing Backend plan assigns the downstream blockchain team `TransactionRequest`, `TransactionAnalysis`, `SimulationResult`, Smart Account, x402, Base Sepolia, Execution, Receipt, Verification, and Attestation responsibilities. fileciteturn3file1
- The existing technology specification selects Base Sepolia first, viem as the EVM client, an ERC-4337-compatible smart-account path, x402+USDC, deterministic transaction decoding/simulation, Foundry, and a compact on-chain attestation commitment. fileciteturn3file11
- The shared contracts explicitly place `TransactionRequest → SimulationResult → ExecutionRequest → ExecutionResult → ReceiptVerification → AuditEvent → AttestationRecord` in the execution lifecycle and prohibit bypassing the Core decision boundary. fileciteturn3file0
- Base's current documentation identifies Base Sepolia as chain ID `84532`. citeturn119684search2turn119684search3
- viem's current documentation recommends simulating contract writes before broadcasting and explains that `writeContract` sends a transaction but does not itself validate successful execution. citeturn119684search0turn119684search1
- ERC-4337 defines UserOperations, EntryPoint, smart accounts, bundlers, paymasters, and replay-related chain/EntryPoint binding. citeturn119684search4
- x402's current documentation supports Base Sepolia and USDC, including the EVM network identifier `eip155:84532`. citeturn725370search0turn725370search4
- Foundry's current documentation describes Forge, Anvil, and Cast as the smart-contract build/test/development toolkit. citeturn725370search1turn725370search7

