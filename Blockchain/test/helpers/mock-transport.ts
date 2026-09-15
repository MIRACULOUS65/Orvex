/**
 * Deterministic mock viem transport. Answers a configurable set of JSON-RPC methods with
 * canned results so RPC/simulation/receipt logic can be tested fully offline. No network.
 */
import {
  custom,
  decodeFunctionData,
  encodeAbiParameters,
  getAddress,
  slice,
  type Transport,
} from "viem";
import { ERC20_ABI } from "../../src/transactions/erc20-abi.js";

export type RpcHandler = (method: string, params: unknown[]) => Promise<unknown> | unknown;

export interface MockRpcState {
  chainId: number;
  handlers?: Partial<Record<string, RpcHandler>>;
}

/** Build a viem transport backed by an in-memory handler map. */
export function mockTransport(state: MockRpcState): Transport {
  const handlers = state.handlers ?? {};
  return custom({
    async request({ method, params }: { method: string; params?: unknown }) {
      const p = (params as unknown[]) ?? [];
      const h = handlers[method];
      if (h) return h(method, p);
      switch (method) {
        case "eth_chainId":
          return `0x${state.chainId.toString(16)}`;
        case "eth_blockNumber":
          return "0x1";
        default:
          throw new Error(`mockTransport: unhandled method ${method}`);
      }
    },
  });
}

/**
 * A deterministic in-memory ERC-20 token used to simulate transfers offline. Backs a
 * transport that answers balanceOf reads (eth_call) and simulateContract/estimateGas for
 * `transfer` based on the sender's balance — enough to exercise PASS / REVERT /
 * INSUFFICIENT_FUNDS without any network.
 */
export interface MockTokenState {
  chainId: number;
  tokenAddress: string;
  balances: Record<string, bigint>;
  /** If set, ALL transfer simulations revert with this reason (generic REVERT case). */
  forceRevert?: string | null;
}

/**
 * A test-only Signer (implements the src Signer seam) that mines a deterministic receipt
 * into a shared receipt store. It decodes the transfer from calldata and records a
 * Transfer log, so the full pipeline (submit -> receipt -> verify) runs offline.
 *
 * The `mineAs` overrides let tests simulate receipt mismatch (different recipient/amount)
 * and reverted transactions without any network.
 */
export interface MockReceiptStore {
  receipts: Map<string, unknown>;
}

export interface MockSignerOptions {
  address: `0x${string}`;
  chainId: number;
  tokenAddress: string;
  store: MockReceiptStore;
  /** Force the mined receipt to differ from calldata (receipt-mismatch tests). */
  mineAs?: { to?: string; value?: bigint; reverted?: boolean };
  /** If set, sendTransaction throws (submission uncertainty / UNKNOWN tests). */
  throwOnSend?: Error;
  /** If true, records the receipt as NOT-mined (returns hash but no receipt) => UNKNOWN. */
  neverMine?: boolean;
}

export function makeReceiptStore(): MockReceiptStore {
  return { receipts: new Map<string, unknown>() };
}

export function mockTokenTransport(state: MockTokenState & { store?: MockReceiptStore }): Transport {
  const token = getAddress(state.tokenAddress);
  const balances = new Map<string, bigint>();
  for (const [k, v] of Object.entries(state.balances)) balances.set(getAddress(k), v);
  const store = state.store;

  // Shape an EVM revert the way an RPC node would, so viem surfaces the reason text.
  function rpcRevert(message: string): Error {
    const err = new Error(message) as Error & { code?: number; details?: string; shortMessage?: string };
    err.code = 3; // JSON-RPC "execution reverted"
    err.details = message;
    err.shortMessage = message;
    return err;
  }

  function handleCall(to: string, data: string): string {
    if (getAddress(to) !== token) throw new Error("call to unexpected address");
    const selector = slice(data as `0x${string}`, 0, 4).toLowerCase();
    // balanceOf(address)
    if (selector === "0x70a08231") {
      const decoded = decodeFunctionData({ abi: ERC20_ABI, data: data as `0x${string}` });
      const [acct] = decoded.args as [`0x${string}`];
      const bal = balances.get(getAddress(acct)) ?? 0n;
      return encodeAbiParameters([{ type: "uint256" }], [bal]);
    }
    // transfer(address,uint256) succeeds here; reverts are enforced in the eth_call handler.
    if (selector === "0xa9059cbb") {
      return encodeAbiParameters([{ type: "bool" }], [true]);
    }
    throw new Error(`mockTokenTransport: unhandled selector ${selector}`);
  }

  return custom({
    async request({ method, params }: { method: string; params?: unknown }) {
      const p = (params as unknown[]) ?? [];
      switch (method) {
        case "eth_chainId":
          return `0x${state.chainId.toString(16)}`;
        case "eth_blockNumber":
          return "0x10";
        case "eth_call": {
          const call = p[0] as { to: string; data: string; from?: string };
          const selector = slice(call.data as `0x${string}`, 0, 4).toLowerCase();
          if (selector === "0xa9059cbb") {
            if (state.forceRevert) throw rpcRevert(state.forceRevert);
            if (call.from) {
              const decoded = decodeFunctionData({ abi: ERC20_ABI, data: call.data as `0x${string}` });
              const [, amount] = decoded.args as [`0x${string}`, bigint];
              const bal = balances.get(getAddress(call.from)) ?? 0n;
              if (bal < amount) throw rpcRevert("execution reverted: transfer amount exceeds balance");
            }
          }
          return handleCall(call.to, call.data);
        }
        case "eth_estimateGas":
          return "0xc350"; // 50000
        case "eth_getTransactionReceipt": {
          const hash = String(p[0]).toLowerCase();
          return store?.receipts.get(hash) ?? null;
        }
        default:
          throw new Error(`mockTokenTransport: unhandled method ${method}`);
      }
    },
  });
}

/** Left-pad an address into a 32-byte event topic. */
export function padTopic(addr: string): string {
  return "0x" + getAddress(addr).slice(2).toLowerCase().padStart(64, "0");
}

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/**
 * Build a test Signer that decodes the transfer from calldata, mines a deterministic
 * receipt into the shared store, and returns a tx hash. Exercises the full
 * submit->receipt->verify path offline.
 */
export function mockSigner(opts: MockSignerOptions): {
  address: `0x${string}`;
  sendTransaction(tx: { to: `0x${string}`; data: `0x${string}`; value: bigint; chainId: number }): Promise<`0x${string}`>;
} {
  const token = getAddress(opts.tokenAddress);
  let counter = 0;
  return {
    address: opts.address,
    async sendTransaction(tx) {
      if (opts.throwOnSend) throw opts.throwOnSend;
      counter += 1;
      const hash = ("0x" + counter.toString(16).padStart(64, "0")) as `0x${string}`;
      if (opts.neverMine) return hash; // no receipt recorded => pipeline times out => UNKNOWN

      const decoded = decodeFunctionData({ abi: ERC20_ABI, data: tx.data });
      let to = opts.address;
      let value = 0n;
      if (decoded.functionName === "transfer") {
        const [t, v] = decoded.args as [`0x${string}`, bigint];
        to = getAddress(t);
        value = v;
      }
      // Overrides for receipt-mismatch tests.
      if (opts.mineAs?.to) to = getAddress(opts.mineAs.to);
      if (opts.mineAs?.value !== undefined) value = opts.mineAs.value;
      const reverted = Boolean(opts.mineAs?.reverted);

      const logs = reverted
        ? []
        : [
            {
              address: token,
              topics: [TRANSFER_TOPIC, padTopic(opts.address), padTopic(to)],
              data: encodeAbiParameters([{ type: "uint256" }], [value]),
              blockNumber: "0x10",
              transactionHash: hash,
              transactionIndex: "0x0",
              blockHash: ("0x" + "1".repeat(64)) as string,
              logIndex: "0x0",
              removed: false,
            },
          ];

      opts.store.receipts.set(hash.toLowerCase(), {
        transactionHash: hash,
        status: reverted ? "0x0" : "0x1",
        from: opts.address,
        to: token,
        logs,
        blockNumber: "0x10",
        blockHash: ("0x" + "1".repeat(64)) as string,
        gasUsed: "0xc350",
        cumulativeGasUsed: "0xc350",
        effectiveGasPrice: "0x3b9aca00",
        contractAddress: null,
        logsBloom: ("0x" + "0".repeat(512)) as string,
        type: "eip1559",
        transactionIndex: "0x0",
      });
      return hash;
    },
  };
}
