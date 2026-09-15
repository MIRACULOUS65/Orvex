# SentinelPay — BLOCKCHAIN_TECH_STACK.md

## 1. V1 Stack

```text
Runtime:        Node.js + TypeScript
EVM Client:     viem
Network:        Base Sepolia
Contracts:      Solidity
Contract Tool:  Foundry
Local Chain:    Anvil
Tests:          Vitest + Foundry
Account Model:  ERC-4337-compatible Smart Account
Payment Rail:   x402 + USDC
RPC:            Configurable EVM RPC provider
Attestation:    Solidity registry
Observability:  Existing Core/monorepo conventions
```

---

## 2. Why TypeScript

The existing Core and `ExecutionClient` boundary are TypeScript.

Keeping Blockchain in TypeScript allows:

```text
shared types
contract compatibility
native viem integration
simple adapter wiring
single runtime for Backend/Blockchain
```

---

## 3. viem

Use viem for:

```text
public client / RPC
wallet/client abstractions
contract reads
contract writes
ABI encoding
ABI decoding
simulation
gas estimation
receipt retrieval
logs
typed chain definitions
```

Do not add ethers for responsibilities already handled by viem.

---

## 4. Foundry

Use Foundry for:

```text
Solidity compilation
Solidity unit tests
deployment scripts
local Anvil
contract debugging
```

Commands:

```text
forge build
forge test
forge script
anvil
cast
```

---

## 5. Network Strategy

V1:

```text
Anvil
 ↓
Base Sepolia
```

Later:

```text
Base Sepolia
 ↓
Base Mainnet
 ↓
additional adapters
```

All chain-specific details must be represented through a chain adapter.

---

## 6. Smart Account Strategy

Use an ERC-4337-compatible smart account.

Conceptual stack:

```text
SentinelPay Core
 ↓
ExecutionRequest
 ↓
SmartAccountAdapter
 ↓
UserOperation
 ↓
Bundler
 ↓
EntryPoint
 ↓
Smart Contract Account
```

The model never receives unrestricted signing authority.

---

## 7. x402

x402 is used as a machine-to-machine payment rail.

V1 reference:

```text
Base Sepolia
USDC
EIP-3009-compatible payment flow
```

x402 belongs behind:

```text
X402Adapter
```

It must not define the entire SDK execution abstraction.

---

## 8. Environment Variables

Example:

```text
NODE_ENV
BLOCKCHAIN_ENV
BASE_SEPOLIA_RPC_URL
BASE_SEPOLIA_CHAIN_ID
BASE_SEPOLIA_USDC_ADDRESS

EXECUTION_MODE
EXECUTION_TIMEOUT_MS

SMART_ACCOUNT_ADDRESS
ENTRYPOINT_ADDRESS
BUNDLER_URL

X402_NETWORK
X402_FACILITATOR_URL

ATTESTATION_REGISTRY_ADDRESS

# signer configuration must use a secure secret provider in real deployments
SIGNING_PROVIDER_REFERENCE
```

Never commit secret values.

`.env.example` contains placeholders only.

---

## 9. Secret Boundary

Private signing material may exist only in the execution/signing process.

It must not enter:

```text
AI prompts
ActionProposal
SecurityAssessment
Core decision
logs
trajectory
audit
attestation
```

---

## 10. Financial Data Representation

Never use JavaScript floating-point numbers for token amounts.

Use:

```text
bigint
or
validated exact decimal strings
```

For ERC-20:

```text
human amount
 ↓
exact decimal conversion
 ↓
integer token units
 ↓
ABI encoding
```

---

## 11. RPC Provider Strategy

Use a small provider abstraction:

```text
RpcProvider
```

Concrete provider configuration can later use:

```text
Base RPC
Alchemy
other compatible provider
Anvil
```

Provider failure must return explicit errors.

---

## 12. Simulation Strategy

Use:

```text
eth_call
simulateContract
Anvil
local fork/tracing where required
```

Simulation must be bound to the exact transaction that is later executed.

---

## 13. Testing Stack

Application tests:

```text
Vitest
```

Contract tests:

```text
Foundry
```

Local integration:

```text
Anvil
```

Network smoke tests:

```text
Base Sepolia
```

Security fixtures should include:

```text
wrong chain
wrong recipient
wrong amount
wrong asset
unexpected approval
revert
receipt mismatch
replay
UNKNOWN
```

---

## 14. Package Boundary

`Blockchain/` should expose a small public API.

Recommended:

```text
ExecutionClient
BaseSepoliaExecutionClient
ChainRegistry
TransactionBuilder
TransactionAnalyzer
Simulator
SmartAccountAdapter
X402Adapter
ReceiptVerifier
AttestationAdapter
```

Do not export internal helper classes unless necessary.

---

## 15. Non-Goals

V1 does not require:

```text
Base mainnet
multi-chain production
cross-chain bridges
DeFi swap engine
card rails
custody platform
custom bundler
custom paymaster infrastructure
```

These can be future adapters/features.
