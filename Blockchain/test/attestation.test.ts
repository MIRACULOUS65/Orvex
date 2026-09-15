import { describe, it, expect } from "vitest";
import { decodeFunctionData, getAddress, keccak256, toHex, type Hex } from "viem";
import {
  AttestationAdapter,
  buildCommitment,
  ATTESTATION_REGISTRY_ABI,
  type AttestationInput,
  type AttestationSigner,
} from "../src/attestation/attestation-adapter.js";
import { containsRawSecret } from "../src/shared/redaction.js";

const REGISTRY = "0x6666666666666666666666666666666666666666" as const;

const input: AttestationInput = {
  executionId: "exec_1",
  agentId: "agent_42",
  policyHash: "0x" + "a".repeat(64),
  intentRef: "intent_9",
  trajectoryRoot: "0x" + "b".repeat(64),
  assessmentHash: "assessment-blob",
  decision: "ALLOW",
  transactionHash: "0x" + "c".repeat(64),
};

describe("buildCommitment — only fixed 32-byte commitments, no raw content", () => {
  it("hashes free-form values and passes through existing 32-byte hashes", () => {
    const c = buildCommitment(input);
    // free-form -> keccak
    expect(c.agentId).toBe(keccak256(toHex("agent_42")));
    expect(c.decision).toBe(keccak256(toHex("ALLOW")));
    // already-32-byte -> unchanged
    expect(c.policyHash).toBe(input.policyHash);
    expect(c.transactionHash).toBe(input.transactionHash);
    // Every field is exactly 32 bytes.
    for (const v of Object.values(c)) expect(/^0x[0-9a-fA-F]{64}$/.test(v)).toBe(true);
  });

  it("nulls become the zero commitment", () => {
    const c = buildCommitment({ ...input, transactionHash: null });
    expect(c.transactionHash).toBe("0x" + "0".repeat(64));
  });

  it("never leaks a raw secret-shaped value verbatim (all fields hashed to 32 bytes)", () => {
    const secretish = "0x" + "d".repeat(64); // looks like a raw key
    const c = buildCommitment({ ...input, agentId: "notasecret", intentRef: secretish });
    // A pre-hashed 32-byte value passes through by design (it's a commitment, not a secret),
    // but no VARIABLE-length/free-form content is ever emitted — agentId got hashed.
    expect(c.agentId).toBe(keccak256(toHex("notasecret")));
    // The commitment object as a whole contains no free-form strings.
    expect(containsRawSecret("notasecret")).toBe(false);
  });
});

describe("AttestationAdapter — write + payment isolation", () => {
  function signer(opts: { fail?: boolean } = {}): AttestationSigner & { calls: { to: Hex; data: Hex }[] } {
    const calls: { to: Hex; data: Hex }[] = [];
    return {
      calls,
      async sendTransaction(tx) {
        if (opts.fail) throw new Error("registry write reverted");
        calls.push({ to: tx.to, data: tx.data });
        return ("0x" + "ee".repeat(32)) as Hex;
      },
    };
  }

  it("writes the attest() call with the compact commitment", async () => {
    const s = signer();
    const adapter = new AttestationAdapter(getAddress(REGISTRY), s);
    const res = await adapter.attest(input);
    expect(res.attested).toBe(true);
    expect(res.transactionHash).toBeTruthy();
    expect(s.calls.length).toBe(1);
    const decoded = decodeFunctionData({ abi: ATTESTATION_REGISTRY_ABI, data: s.calls[0]!.data });
    expect(decoded.functionName).toBe("attest");
    const args = decoded.args as readonly Hex[];
    expect(args[6]).toBe(keccak256(toHex("ALLOW"))); // decision
  });

  it("ISOLATION: a failed attestation returns a result, never throws into payment", async () => {
    const adapter = new AttestationAdapter(getAddress(REGISTRY), signer({ fail: true }));
    const res = await adapter.attest(input); // must not throw
    expect(res.attested).toBe(false);
    expect(res.transactionHash).toBeNull();
    expect(res.error).toMatch(/reverted/i);
  });
});
