# @sentinelpay/blockchain

The **Execution subsystem** for SentinelPay. It is the real implementation behind the
Core `ExecutionClient` boundary.

> Core decides **whether** an already-authorized action may execute.
> This package decides **how** it is executed on-chain and **independently verifies**
> that what happened matches what Core authorized.

## Boundary rules (invariants)

1. No raw execute path outside the `ExecutionClient` interface.
2. The AI/ML layer and Core never receive signing keys. Signing material lives only in
   this execution boundary (from env / secret provider), never in source, git, logs,
   audit, trajectory, or AI prompts.
3. Core imports **no** viem/RPC/wallet/signer internals — only the `ExecutionClient` type.
4. No execution before validation + simulation.
5. Simulation binds to the exact transaction payload; a material change invalidates it.
6. `UNKNOWN` is not `FAILED` — it is reconciled, never blind-retried.
7. Receipt verification is independent: RPC "success" is not financial success.
8. Mainnet is hard-gated: a testnet configuration can never fall back to mainnet.

## Layout

```
src/
  config/        env + execution config (typed, validated)
  shared/        errors, money, hashing, logging-safe redaction
  chains/        ChainRegistry (Anvil + Base Sepolia), chain metadata
  rpc/           narrow RpcProvider abstraction (viem-backed) + chain-match guard
  contracts/     local mirror of the frozen Core execution/transaction contracts
  transactions/  TransactionBuilder / Decoder / Analyzer / Validator (ERC-20 USDC)
  simulation/    deterministic Simulator (eth_call/simulateContract) + payload binding
  receipts/      ReceiptClient / Parser / Verifier / TokenTransfer + StateChange verify
  smart-account/ ERC-4337 SmartAccountAdapter / UserOp / Bundler / EntryPoint
  x402/          X402Adapter / requirement parse / payload build / facilitator / settle
  attestation/   AttestationAdapter (writes compact commitments to the registry)
  execution/     BaseSepoliaExecutionClient (implements the Core ExecutionClient)
  integration/   factory to build the client Core wires in (config-driven)
contracts/       Solidity (Foundry): attestation registry + a local test USDC
test/            Vitest (unit + mock-transport integration); anvil/ + sepolia/ opt-in
scripts/         deploy + smoke scripts
```

## Tests

```
npm test                 # deterministic offline suite (mock viem transport)
npm run test:anvil       # requires Anvil running (self-skips otherwise)
npm run test:sepolia     # requires Base Sepolia creds in env (self-skips otherwise)
forge test               # Solidity contract tests (requires Foundry)
```

Anvil / Sepolia / Foundry suites **self-skip** when the tooling or credentials are
absent, so the default `npm test` is fully deterministic and offline.
