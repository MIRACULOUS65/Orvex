/**
 * ActionProposal contract — Phase 2, Task 2.1.
 *
 * Mirrors CONTRACTS.md §13/§14 and Orvex/ML/schemas/action_proposal.py. The
 * ActionProposal is the boundary between Agent Intelligence and SentinelPay
 * security/execution: it describes what the agent WANTS to do. It is NOT a signed
 * transaction, NOT authorization, and MUST NEVER contain a private key
 * (CONTRACTS.md §14). The absence of authority/key fields is enforced structurally
 * (the fields are simply not declared) and asserted by the authority-boundary tests.
 *
 * Consumer-side: `.passthrough()` for forward-compat.
 */
import { z } from "zod";
import { idString, isoTimestamp, Money } from "./primitives.js";

export const ActionType = z.enum([
  "PAY",
  "TRANSFER",
  "PURCHASE",
  "CALL_API",
  "SWAP",
  "OTHER",
]);
export type ActionType = z.infer<typeof ActionType>;

export const RecipientRefType = z.enum([
  "SERVICE",
  "WALLET",
  "CONTRACT",
  "MERCHANT",
  "UNKNOWN",
]);
export type RecipientRefType = z.infer<typeof RecipientRefType>;

export const RecipientRef = z
  .object({
    type: RecipientRefType.default("UNKNOWN"),
    identifier: z.string().nullish(),
    address: z.string().nullish(),
    network: z.string().nullish(),
  })
  .passthrough();
export type RecipientRef = z.infer<typeof RecipientRef>;

export const ActionProposal = z
  .object({
    schema_version: z
      .literal("action_proposal.v1")
      .default("action_proposal.v1"),
    proposal_id: idString,
    intent_id: idString,
    agent_id: idString,

    action_type: ActionType,
    purpose: z.string(),

    recipient: RecipientRef.nullish(),
    amount: Money.nullish(),
    payment_method: z.string().nullish(),
    network: z.string().nullish(),

    reason: z.string().default(""),
    evidence_ids: z.array(z.string()).default([]),
    trajectory_event_ids: z.array(z.string()).default([]),

    created_at: isoTimestamp,
  })
  .passthrough();
export type ActionProposal = z.infer<typeof ActionProposal>;
