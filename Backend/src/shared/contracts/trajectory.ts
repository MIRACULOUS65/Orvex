/**
 * TrajectoryEvent contract — Phase 2, Task 2.1.
 *
 * Mirrors CONTRACTS.md §9/§10 and Orvex/ML/schemas/trajectory.py. Trajectory events
 * record the agent's observable, ordered sequence of actions and form a
 * tamper-evident hash chain (previous_event_hash -> event_hash). Consumer-side:
 * `.passthrough()` for forward-compat.
 */
import { z } from "zod";
import { idString, isoTimestamp } from "./primitives.js";

export const TrustLevel = z.enum([
  "TRUSTED",
  "INTERNAL",
  "EXTERNAL",
  "UNTRUSTED",
  "UNKNOWN",
]);
export type TrustLevel = z.infer<typeof TrustLevel>;

/** V1 event types (CONTRACTS.md §9). */
export const EventType = z.enum([
  "USER_REQUEST",
  "INTENT_CREATED",
  "INTENT_UPDATED",
  "PLAN_CREATED",
  "TOOL_CALL",
  "TOOL_RESULT",
  "WEB_ACCESS",
  "API_CALL",
  "MEMORY_READ",
  "MEMORY_WRITE",
  "EXTERNAL_INPUT",
  "OBSERVATION",
  "PLAN_CHANGE",
  "RECIPIENT_CHANGE",
  "AMOUNT_CHANGE",
  "ASSET_CHANGE",
  "PROPOSAL_CREATED",
  "SECURITY_ANALYSIS",
  "POLICY_CHECK",
  "SIMULATION",
  "APPROVAL_REQUEST",
  "APPROVAL_RESULT",
  "EXECUTION_REQUEST",
  "EXECUTION_RESULT",
  "TOOL_ERROR",
]);
export type EventType = z.infer<typeof EventType>;

export const TrustContext = z
  .object({
    source_type: z.string(),
    trust_level: TrustLevel,
  })
  .passthrough();
export type TrustContext = z.infer<typeof TrustContext>;

export const TrajectoryEvent = z
  .object({
    schema_version: z
      .literal("trajectory_event.v1")
      .default("trajectory_event.v1"),
    event_id: idString,
    trace_id: idString,
    sequence: z.number().int(),
    timestamp: isoTimestamp,
    agent_id: idString,
    event_type: EventType,
    action: z.record(z.string(), z.unknown()).default({}),
    input_ref: idString.nullish(),
    output_ref: idString.nullish(),
    trust_context: TrustContext.nullish(),
    previous_event_hash: z.string(),
    event_hash: z.string(),
  })
  .passthrough();
export type TrajectoryEvent = z.infer<typeof TrajectoryEvent>;
