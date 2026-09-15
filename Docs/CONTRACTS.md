# SentinelPay — CONTRACTS.md

## Canonical Cross-Team Data Contracts

**Document Type:** Engineering Contract Specification  
**Product:** SentinelPay SDK  
**Version:** V1.0  
**Status:** Canonical shared interface specification  
**Audience:** AI/ML, Backend/Core, Blockchain/Execution, SDK, QA/Evaluation, Kiro

---

# 1. Purpose

`CONTRACTS.md` defines the canonical data structures exchanged across the SentinelPay monorepo.

The purpose of this document is to prevent the four development areas from independently inventing incompatible representations of:

- user intent
- company policy
- agent actions
- trajectory events
- proposed payments
- evidence
- security intelligence
- risk
- anomaly detection
- transaction validation
- simulation
- human approval
- execution
- verification
- audit records

The project is being developed by multiple people in parallel. Therefore, these contracts are more important than any individual service implementation.

A component may change internally without changing its public contract.

---

# 2. Contract Philosophy

SentinelPay follows these rules:

1. **Schemas are shared infrastructure.**
2. **No team owns a private version of a shared object.**
3. **Every cross-service payload is versioned.**
4. **Every security assessment is evidence-linked.**
5. **AI outputs are advisory and never constitute authorization.**
6. **Deterministic core decisions consume structured outputs rather than parsing model prose.**
7. **Execution results are derived from actual payment-rail evidence, not model claims.**
8. **Unknown or missing information must be represented explicitly. It must not silently become a safe value.**
9. **Backward-compatible changes are preferred.**
10. **Breaking contract changes require an explicit schema-version change.**

The fundamental trust rule is:

> **AI may recommend. Deterministic systems authorize.**

---

# 3. Contract Layers

The contracts are divided into logical layers.

```text
┌──────────────────────────────────────────────┐
│                USER / COMPANY                │
├──────────────────────────────────────────────┤
│ Intent                                       │
│ Agent Constitution / Policy                 │
├──────────────────────────────────────────────┤
│ Agent Intelligence                          │
│ Action Proposal                             │
│ Trajectory Event                            │
├──────────────────────────────────────────────┤
│ Security Intelligence                       │
│ Evidence                                     │
│ Intent Verification                          │
│ Threat Assessment                            │
│ Reputation Assessment                        │
│ Risk Assessment                              │
│ Anomaly Assessment                           │
│ Security Assessment                          │
├──────────────────────────────────────────────┤
│ Deterministic Core                           │
│ Policy Evaluation                            │
│ Transaction Request                          │
│ Simulation Result                            │
│ Decision                                     │
├──────────────────────────────────────────────┤
│ Execution                                    │
│ Approval                                     │
│ Execution Result                             │
│ Receipt Verification                         │
├──────────────────────────────────────────────┤
│ Audit                                        │
│ Audit Event / Attestation                    │
└──────────────────────────────────────────────┘
```

---

# 4. Shared Conventions

## 4.1 IDs

All major objects use opaque string identifiers.

Recommended format:

```text
intent_...
proposal_...
trajectory_...
evidence_...
policy_...
assessment_...
transaction_...
approval_...
execution_...
audit_...
```

IDs must not encode business meaning.

---

## 4.2 Timestamps

All machine timestamps use ISO-8601 UTC.

Example:

```text
2026-09-11T12:30:45.123Z
```

Do not store local timezone timestamps in shared contracts.

---

## 4.3 Currency Amounts

Never represent financial amounts internally as binary floating-point numbers.

Preferred representation:

```json
{
  "value": "4.200000",
  "currency": "USDC",
  "decimals": 6
}
```

Rules:

- `value` is a decimal string.
- Currency is an explicit identifier.
- Token/asset decimals are explicit when needed.
- No shared contract should rely on floating-point equality.

---

## 4.4 Addresses

Blockchain addresses must be explicit strings.

A blockchain-specific address object should include its network where ambiguity is possible.

```json
{
  "address": "0x...",
  "network": "base-sepolia"
}
```

Do not assume that the same address string implies the same asset, contract, or chain context.

---

## 4.5 Unknown Values

Unknown information must be represented explicitly.

Allowed:

```json
{
  "status": "INSUFFICIENT_EVIDENCE"
}
```

Not allowed:

```json
{
  "risk": 0
}
```

when risk is simply unknown.

---

## 4.6 Confidence

Confidence is different from authorization.

For example:

```json
{
  "confidence": 0.93,
  "intent_match": true
}
```

does **not** mean:

```text
AUTHORIZED = TRUE
```

Only the deterministic core can produce the final authorization decision.

---

# 5. Contract Status Vocabulary

Shared lifecycle/status values must come from controlled enumerations.

## General Processing

```text
PENDING
PROCESSING
COMPLETED
FAILED
EXPIRED
CANCELLED
```

## Security Assessment

```text
UNANALYZED
ANALYZING
ANALYZED
INSUFFICIENT_EVIDENCE
ERROR
```

## Final Decision

```text
ALLOW
REVIEW
DENY
```

## Execution

```text
NOT_STARTED
SIMULATION_PENDING
SIMULATION_PASSED
SIMULATION_FAILED
APPROVAL_PENDING
READY
SUBMITTED
CONFIRMED
FAILED
REVERSED
UNKNOWN
```

---

# 6. `Intent`

## Purpose

`Intent` represents the user's actual requested goal after natural-language interpretation.

The Intent Engine produces it.

The Agent Brain consumes it.

The Core may inspect it.

The Intent object is not itself a payment authorization.

---

## Canonical Shape

```json
{
  "schema_version": "intent.v1",
  "intent_id": "intent_001",
  "user_id": "user_001",
  "agent_id": "agent_001",

  "user_goal": "Get reliable market-data API access",

  "purpose": "market_data_access",

  "desired_outcome": "usable_market_data_service",

  "constraints": [],

  "budget": {
    "maximum": "10.00",
    "currency": "USD",
    "period": "daily"
  },

  "authorized_actions": [
    "PAY"
  ],

  "forbidden_actions": [
    "TRANSFER_TO_UNKNOWN_WALLET"
  ],

  "autonomy_level": "AUTOMATIC",

  "approval_conditions": [],

  "valid_from": "2026-09-11T00:00:00Z",
  "valid_until": "2026-09-12T00:00:00Z",

  "status": "VALID",

  "confidence": 0.96,

  "ambiguities": [],

  "created_at": "2026-09-11T12:00:00Z"
}
```

---

## Required Intent Fields

```text
schema_version
intent_id
user_goal
purpose
desired_outcome
constraints
budget
authorized_actions
forbidden_actions
autonomy_level
valid_from
valid_until
status
created_at
```

---

## Autonomy Levels

```text
MANUAL
CONDITIONAL
AUTOMATIC
```

Meaning:

### `MANUAL`

Every financial action requires explicit human approval.

### `CONDITIONAL`

Actions may execute automatically only if predefined conditions are satisfied.

### `AUTOMATIC`

The agent may execute within the allowed capability/policy envelope.

---

## Intent Ambiguity

An Intent may not be valid for execution if mandatory information is missing.

Example:

```json
{
  "status": "NEEDS_CLARIFICATION",
  "ambiguities": [
    {
      "field": "budget.maximum",
      "reason": "No maximum spending amount was supplied."
    }
  ]
}
```

The agent must not invent the missing value.

---

# 7. `AgentConstitution`

The Agent Constitution describes what the company has authorized a particular agent to do.

The Constitution is broader than an individual task Intent.

```text
Intent:
"What does the user want now?"

Constitution:
"What is this agent allowed to do in general?"
```

---

## Canonical Shape

```json
{
  "schema_version": "constitution.v1",
  "constitution_id": "constitution_001",
  "company_id": "company_001",
  "agent_id": "agent_001",

  "purpose": "Autonomous vendor and API payments",

  "allowed_actions": [
    "PAY"
  ],

  "blocked_actions": [
    "UNAPPROVED_TRANSFER"
  ],

  "allowed_assets": [
    "USDC"
  ],

  "allowed_networks": [
    "base-sepolia"
  ],

  "allowed_categories": [
    "API",
    "CLOUD",
    "DATA"
  ],

  "blocked_categories": [
    "GAMBLING"
  ],

  "spending_limits": {
    "single_transaction": "20.00",
    "daily": "100.00"
  },

  "approval_rules": [],

  "recipient_rules": {},

  "time_rules": {},

  "version": 1,

  "status": "ACTIVE",

  "created_at": "2026-09-11T12:00:00Z"
}
```

---

# 8. `Policy`

`Policy` is the executable representation of a Constitution/rulebook after compilation.

The AI team may help interpret natural language, but deterministic Core components own final enforcement.

---

## Policy Principle

```text
Natural language
      ↓
AI interpretation
      ↓
Structured Policy
      ↓
Deterministic compilation/validation
      ↓
Executable policy
```

---

## Canonical Rule

```json
{
  "rule_id": "rule_001",
  "type": "AMOUNT_LIMIT",
  "condition": {
    "category": "API"
  },
  "constraint": {
    "operator": "LTE",
    "field": "transaction.amount",
    "value": "20.00",
    "currency": "USDC"
  },
  "required_action": "ALLOW",
  "priority": 100,
  "enabled": true
}
```

---

## Rule Types

V1 must support at least:

```text
AMOUNT_LIMIT
CUMULATIVE_LIMIT
RECIPIENT_ALLOWLIST
RECIPIENT_BLOCKLIST
CATEGORY_ALLOW
CATEGORY_BLOCK
ASSET_ALLOW
NETWORK_ALLOW
TIME_WINDOW
NEW_RECIPIENT_APPROVAL
REQUIRED_PREDECESSOR
HUMAN_APPROVAL
NO_STRUCTURING
CAPABILITY_EXPIRY
```

The exact deterministic implementation belongs to the Core/Backend layer.

---

# 9. `TrajectoryEvent`

Trajectory events record the agent's observable sequence of actions.

This is inherited from the strongest concept in the original VeriGuard design: security must observe the path that led to a transaction, not only the final transaction.

---

## Canonical Shape

```json
{
  "schema_version": "trajectory_event.v1",

  "event_id": "trajectory_001",
  "trace_id": "trace_001",
  "sequence": 17,

  "timestamp": "2026-09-11T12:04:01.120Z",

  "agent_id": "agent_001",

  "event_type": "TOOL_CALL",

  "action": {
    "name": "web_fetch",
    "tool_id": "browser_001"
  },

  "input_ref": "evidence_010",
  "output_ref": "evidence_011",

  "trust_context": {
    "source_type": "EXTERNAL",
    "trust_level": "UNTRUSTED"
  },

  "previous_event_hash": "0x...",

  "event_hash": "0x..."
}
```

---

## V1 Event Types

```text
USER_REQUEST
INTENT_CREATED
INTENT_UPDATED
PLAN_CREATED
TOOL_CALL
TOOL_RESULT
WEB_ACCESS
API_CALL
MEMORY_READ
MEMORY_WRITE
EXTERNAL_INPUT
OBSERVATION
PLAN_CHANGE
RECIPIENT_CHANGE
AMOUNT_CHANGE
ASSET_CHANGE
PROPOSAL_CREATED
SECURITY_ANALYSIS
POLICY_CHECK
SIMULATION
APPROVAL_REQUEST
APPROVAL_RESULT
EXECUTION_REQUEST
EXECUTION_RESULT
```

---

# 10. Trajectory Integrity

Trajectory events should form a tamper-evident sequence.

Each event contains:

```text
previous_event_hash
event_hash
```

The resulting chain can later produce a Merkle root for attestation.

The AI layer may consume trajectory events, but it must not rewrite historical trajectory data.

---

# 11. `Evidence`

Evidence is any information used to support an AI/security assessment.

---

## Canonical Shape

```json
{
  "schema_version": "evidence.v1",

  "evidence_id": "evidence_001",

  "source": {
    "source_id": "web_123",
    "source_type": "WEBPAGE",
    "trust_level": "UNTRUSTED"
  },

  "content_type": "TEXT",

  "content_hash": "sha256:...",

  "claim": "Payment address was changed",

  "raw_reference": "https://example.com",

  "timestamp": "2026-09-11T12:04:00Z",

  "derived_from": [],

  "trajectory_event_ids": [
    "trajectory_010"
  ]
}
```

---

## Evidence Trust Levels

```text
TRUSTED
INTERNAL
EXTERNAL
UNTRUSTED
UNKNOWN
```

The trust level is contextual and must not be interpreted as proof of truth.

---

# 12. Evidence Provenance

Evidence may derive from other evidence.

Example:

```text
Evidence A
  │
  ├── cited by → Evidence B
  │
  └── cited by → Evidence C
```

This enables the Epistemic Independence system to determine whether apparent corroboration is actually independent.

The canonical field is:

```json
{
  "derived_from": [
    "evidence_root_001"
  ]
}
```

---

# 13. `ActionProposal`

The Action Proposal is the boundary between Agent Intelligence and SentinelPay security/execution systems.

It describes:

> What the agent wants to do.

It is not yet a signed blockchain transaction.

---

## Canonical Shape

```json
{
  "schema_version": "action_proposal.v1",

  "proposal_id": "proposal_001",
  "intent_id": "intent_001",
  "agent_id": "agent_001",

  "action_type": "PAY",

  "purpose": "market_data_access",

  "recipient": {
    "type": "SERVICE",
    "identifier": "example-api",
    "address": "0x...",
    "network": "base-sepolia"
  },

  "amount": {
    "value": "4.20",
    "currency": "USDC"
  },

  "payment_method": "X402",

  "network": "base-sepolia",

  "reason": "Provider offers the required service within the user's budget.",

  "evidence_ids": [
    "evidence_001",
    "evidence_002"
  ],

  "trajectory_event_ids": [
    "trajectory_015",
    "trajectory_017"
  ],

  "created_at": "2026-09-11T12:05:00Z"
}
```

---

# 14. Action Proposal Rules

The Action Proposal must:

- reference the originating Intent
- reference relevant trajectory events
- reference supporting evidence where available
- describe financial intent at a high level
- not contain a private key
- not itself authorize execution
- not be interpreted as a transaction receipt

---

# 15. `IntentVerificationResult`

This represents the AI assessment of whether the proposed action is consistent with the original Intent.

---

## Canonical Shape

```json
{
  "schema_version": "intent_verification.v1",

  "status": "PASS",

  "intent_match": true,

  "score": 0.96,

  "dimensions": {
    "purpose_alignment": 0.99,
    "amount_alignment": 1.00,
    "recipient_alignment": 0.95,
    "asset_alignment": 1.00,
    "category_alignment": 0.98,
    "action_alignment": 0.99,
    "temporal_alignment": 1.00,
    "evidence_alignment": 0.93,
    "autonomy_alignment": 1.00
  },

  "violations": [],

  "reasons": [
    "Payment directly corresponds to the requested service."
  ],

  "evidence_ids": [
    "evidence_001"
  ],

  "confidence": 0.94
}
```

---

## Status Values

```text
PASS
FAIL
UNCERTAIN
INSUFFICIENT_EVIDENCE
```

---

# 16. `ThreatAssessment`

Threat detection reports suspicious or manipulative behavior.

It is advisory intelligence.

---

## Canonical Shape

```json
{
  "schema_version": "threat_assessment.v1",

  "detected": true,

  "severity": "HIGH",

  "categories": [
    "PAYMENT_REDIRECTION",
    "INDIRECT_PROMPT_INJECTION"
  ],

  "confidence": 0.93,

  "evidence_ids": [
    "evidence_010",
    "evidence_011"
  ],

  "trajectory_event_ids": [
    "trajectory_021",
    "trajectory_022"
  ],

  "explanation": "External content attempted to replace the intended payment recipient.",

  "recommended_handling": "REVIEW"
}
```

---

## V1 Threat Categories

```text
DIRECT_PROMPT_INJECTION
INDIRECT_PROMPT_INJECTION
INSTRUCTION_OVERRIDE
PAYMENT_REDIRECTION
AUTHORIZATION_MANIPULATION
CREDENTIAL_REQUEST
SECRET_EXFILTRATION
TOOL_MANIPULATION
MEMORY_POISONING
SUSPICIOUS_EXTERNAL_INSTRUCTION
```

---

# 17. `ReputationAssessment`

Reputation intelligence describes what is known about a recipient/entity/address.

Raw blockchain intelligence may come from Blockchain/Backend systems.

The AI/security layer interprets it.

---

## Canonical Shape

```json
{
  "schema_version": "reputation_assessment.v1",

  "entity": {
    "type": "BLOCKCHAIN_ADDRESS",
    "address": "0x...",
    "network": "base-sepolia"
  },

  "score": 0.82,

  "level": "LOW",

  "signals": [
    {
      "type": "LONG_LIVED_ADDRESS",
      "severity": "LOW",
      "description": "Address has existed for a long period."
    },
    {
      "type": "NO_KNOWN_RISK_LABEL",
      "severity": "LOW",
      "description": "No known malicious label was supplied."
    }
  ],

  "data_quality": "GOOD",

  "evidence_ids": [
    "evidence_chain_001"
  ],

  "confidence": 0.84
}
```

Important:

> Reputation is evidence, not authorization.

A high reputation score can never override a hard policy block.

---

# 18. `RiskAssessment`

Risk aggregates security signals.

---

## Canonical Shape

```json
{
  "schema_version": "risk_assessment.v1",

  "score": 0.68,

  "level": "HIGH",

  "dimensions": {
    "intent_risk": 0.04,
    "threat_risk": 0.72,
    "recipient_risk": 0.18,
    "anomaly_risk": 0.61,
    "behavioral_risk": 0.40,
    "transaction_risk": 0.22
  },

  "drivers": [
    "payment redirection attempt detected",
    "recipient is new",
    "transaction amount is unusually high"
  ],

  "confidence": 0.89,

  "evidence_ids": [
    "evidence_010",
    "evidence_chain_001"
  ]
}
```

---

## Risk Level Vocabulary

```text
LOW
MEDIUM
HIGH
CRITICAL
INSUFFICIENT_EVIDENCE
```

Risk level is not equivalent to final decision.

---

# 19. `AnomalyAssessment`

Anomaly detection measures deviation from the agent's normal behavioral profile.

---

## Canonical Shape

```json
{
  "schema_version": "anomaly_assessment.v1",

  "score": 0.72,

  "level": "HIGH",

  "signals": [
    {
      "type": "AMOUNT_DEVIATION",
      "description": "Amount is 6.8x the historical median."
    },
    {
      "type": "RECIPIENT_NOVELTY",
      "description": "Recipient has not previously been observed."
    }
  ],

  "baseline_reference": {
    "window": "30d",
    "transactions_observed": 142
  },

  "confidence": 0.81,

  "evidence_ids": [
    "evidence_behavior_001"
  ]
}
```

---

# 20. `SecurityAssessment`

This is the primary AI/ML output delivered to SentinelPay Core.

It combines the independent AI/security assessments.

---

## Canonical Shape

```json
{
  "schema_version": "security_assessment.v1",

  "assessment_id": "assessment_001",

  "proposal_id": "proposal_001",

  "intent_verification": {},
  "threat_assessment": {},
  "reputation_assessment": {},
  "risk_assessment": {},
  "anomaly_assessment": {},

  "overall_assessment": {
    "status": "HIGH_RISK",
    "confidence": 0.91,

    "summary": "Potential payment redirection attack.",

    "recommended_handling": "REVIEW"
  },

  "evidence_ids": [
    "evidence_010",
    "evidence_011"
  ],

  "model_metadata": {
    "provider": "qwen",
    "model": "model-name",
    "model_version": "version",
    "configuration_version": "config-v1",
    "timestamp": "2026-09-11T12:05:10Z"
  },

  "created_at": "2026-09-11T12:05:10Z"
}
```

---

# 21. Security Assessment Authority Rule

`SecurityAssessment` cannot contain:

```json
{
  "execute": true
}
```

and the Core must never interpret AI output as direct authorization.

Allowed:

```json
{
  "recommended_handling": "REVIEW"
}
```

Not allowed:

```json
{
  "authorized": true
}
```

Final authorization belongs to the deterministic Core.

---

# 22. `TransactionIntent`

Before creating a concrete blockchain transaction, Core/Execution may normalize an approved Action Proposal into a transaction intent.

---

## Canonical Shape

```json
{
  "schema_version": "transaction_intent.v1",

  "transaction_id": "transaction_001",
  "proposal_id": "proposal_001",

  "action_type": "PAY",

  "network": "base-sepolia",

  "asset": {
    "symbol": "USDC",
    "address": "0x..."
  },

  "amount": "4.20",

  "recipient": {
    "address": "0x...",
    "type": "SERVICE"
  },

  "payment_method": "X402",

  "constraints": {
    "max_amount": "5.00"
  }
}
```

---

# 23. `TransactionRequest`

This is the concrete transaction candidate sent to validation/simulation.

---

## Canonical Shape

```json
{
  "schema_version": "transaction_request.v1",

  "transaction_id": "transaction_001",

  "chain": {
    "id": 84532,
    "name": "base-sepolia"
  },

  "from": "0x...",

  "to": "0x...",

  "value": "0",

  "data": "0x...",

  "asset": {
    "type": "ERC20",
    "symbol": "USDC",
    "address": "0x..."
  },

  "amount": "4.20",

  "proposal_id": "proposal_001",

  "intent_id": "intent_001",

  "created_at": "2026-09-11T12:06:00Z"
}
```

This object must describe exactly what may be simulated.

---

# 24. `TransactionAnalysis`

The Execution layer can decode and analyze the concrete transaction before signing.

---

## Canonical Shape

```json
{
  "schema_version": "transaction_analysis.v1",

  "transaction_id": "transaction_001",

  "contract": {
    "address": "0x...",
    "verified": true
  },

  "function": {
    "name": "transfer",
    "selector": "0xa9059cbb"
  },

  "decoded_arguments": {},

  "state_changes_expected": [],

  "recipient": "0x...",

  "amount": "4.20",

  "asset": "USDC",

  "risk_flags": [],

  "status": "VALID"
}
```

---

# 25. `SimulationResult`

Simulation is deterministic execution analysis.

It must not be generated by an LLM.

---

## Canonical Shape

```json
{
  "schema_version": "simulation_result.v1",

  "transaction_id": "transaction_001",

  "status": "PASS",

  "would_revert": false,

  "gas_estimate": {
    "gas": "120000"
  },

  "expected_state_changes": [
    {
      "type": "TOKEN_TRANSFER",
      "asset": "USDC",
      "from": "0x...",
      "to": "0x...",
      "amount": "4.20"
    }
  ],

  "unexpected_state_changes": [],

  "revert_reason": null,

  "simulator": {
    "provider": "simulator-name",
    "version": "version"
  },

  "simulated_at": "2026-09-11T12:07:00Z"
}
```

---

## Simulation Status

```text
PASS
REVERT
UNEXPECTED_STATE_CHANGE
INSUFFICIENT_FUNDS
UNSUPPORTED
ERROR
```

---

# 26. `PolicyEvaluation`

The deterministic policy engine returns an explicit machine-readable result.

---

## Canonical Shape

```json
{
  "schema_version": "policy_evaluation.v1",

  "policy_id": "policy_001",
  "policy_version": 7,

  "status": "PASS",

  "rules_checked": [
    {
      "rule_id": "rule_001",
      "result": "PASS"
    },
    {
      "rule_id": "rule_002",
      "result": "PASS"
    }
  ],

  "violations": [],

  "trajectory_context": {
    "trace_id": "trace_001",
    "events_considered": 19
  },

  "evaluated_at": "2026-09-11T12:07:10Z"
}
```

---

# 27. `PolicyViolation`

When a policy fails, the system must describe the exact violation.

```json
{
  "schema_version": "policy_violation.v1",

  "violation_id": "violation_001",

  "rule_id": "rule_002",

  "rule_type": "RECIPIENT_ALLOWLIST",

  "trajectory_event_id": "trajectory_020",

  "field": "transaction.recipient",

  "actual_value": "0xdead...",

  "expected": "recipient must be allowlisted",

  "severity": "CRITICAL",

  "message": "Recipient is not present in the configured allowlist."
}
```

---

# 28. `ApprovalRequest`

A human approval request is generated only when policy/decision logic requires it.

---

## Canonical Shape

```json
{
  "schema_version": "approval_request.v1",

  "approval_id": "approval_001",

  "proposal_id": "proposal_001",

  "transaction_id": "transaction_001",

  "reason": "New recipient requires approval for payments over $5.",

  "summary": {
    "purpose": "API access",
    "amount": "8.00",
    "currency": "USDC",
    "recipient": "0x..."
  },

  "security_summary": {
    "risk_level": "MEDIUM",
    "threats": [],
    "simulation": "PASS"
  },

  "expires_at": "2026-09-11T12:15:00Z",

  "required_role": "AUTHORIZED_OPERATOR",

  "created_at": "2026-09-11T12:08:00Z"
}
```

---

# 29. `ApprovalResult`

```json
{
  "schema_version": "approval_result.v1",

  "approval_id": "approval_001",

  "status": "APPROVED",

  "approved_by": "user_001",

  "approved_at": "2026-09-11T12:09:00Z",

  "authorization_reference": "approval_signature_or_record",

  "decision_context_hash": "sha256:..."
}
```

---

# 30. Approval Security Rule

An approval must bind to the exact transaction/decision context.

Approval cannot mean:

```text
"User generally approves this agent."
```

It must mean:

```text
"User approved THIS payment request under THIS policy/context."
```

The approved transaction must not be silently mutated after approval.

If material fields change, a new approval is required.

---

# 31. `Decision`

This is the Core's final authorization result before execution.

---

## Canonical Shape

```json
{
  "schema_version": "decision.v1",

  "decision_id": "decision_001",

  "proposal_id": "proposal_001",

  "transaction_id": "transaction_001",

  "result": "ALLOW",

  "reasons": [
    "Intent matched",
    "Policy passed",
    "No blocking threat detected",
    "Simulation passed"
  ],

  "policy_evaluation": {},
  "security_assessment": {},
  "transaction_analysis": {},
  "simulation_result": {},

  "approval": {
    "required": false,
    "status": "NOT_REQUIRED"
  },

  "decision_version": 1,

  "created_at": "2026-09-11T12:10:00Z"
}
```

---

# 32. Decision Rules

Final decision must always be one of:

```text
ALLOW
REVIEW
DENY
```

### `ALLOW`

All required conditions are satisfied.

### `REVIEW`

Human approval or further evidence is required.

### `DENY`

A hard security/policy constraint failed.

No downstream component may convert `DENY` into execution without a new valid authorization flow.

---

# 33. Decision Precedence

Unless a stricter company policy says otherwise:

```text
HARD BLOCK
    >
POLICY VIOLATION
    >
INVALID TRANSACTION
    >
FAILED SIMULATION
    >
EXPIRED AUTHORIZATION
    >
REQUIRED REVIEW
    >
AI RISK SIGNAL
    >
ALLOW
```

AI risk signals cannot override deterministic hard blocks.

---

# 34. `ExecutionRequest`

This object crosses from Core into the Execution layer.

```json
{
  "schema_version": "execution_request.v1",

  "execution_id": "execution_001",

  "decision_id": "decision_001",

  "transaction_id": "transaction_001",

  "executor": {
    "type": "SMART_ACCOUNT",
    "account": "0x..."
  },

  "payment_method": "X402",

  "network": "base-sepolia",

  "idempotency_key": "sha256:...",

  "authorization_context_hash": "sha256:...",

  "created_at": "2026-09-11T12:10:05Z"
}
```

---

# 35. Idempotency

Every executable financial operation must carry a stable idempotency key.

The key should be derived from the logical execution context.

For example:

```text
hash(
    company_id
    +
    agent_id
    +
    intent_id
    +
    proposal_id
    +
    transaction_payload
    +
    policy_version
)
```

Retries must not accidentally generate multiple independent payments for the same logical action.

---

# 36. `ExecutionResult`

```json
{
  "schema_version": "execution_result.v1",

  "execution_id": "execution_001",

  "status": "CONFIRMED",

  "transaction_hash": "0x...",

  "chain": "base-sepolia",

  "submitted_at": "2026-09-11T12:11:00Z",

  "confirmed_at": "2026-09-11T12:11:04Z",

  "receipt_reference": "receipt_001",

  "idempotency_key": "sha256:..."
}
```

---

# 37. `ReceiptVerification`

The blockchain/payment result must be checked against the expected transaction.

---

## Canonical Shape

```json
{
  "schema_version": "receipt_verification.v1",

  "execution_id": "execution_001",

  "verified": true,

  "transaction_hash": "0x...",

  "expected": {
    "recipient": "0x...",
    "asset": "USDC",
    "amount": "4.20",
    "network": "base-sepolia"
  },

  "actual": {
    "recipient": "0x...",
    "asset": "USDC",
    "amount": "4.20",
    "network": "base-sepolia"
  },

  "discrepancies": [],

  "verified_at": "2026-09-11T12:11:05Z"
}
```

---

# 38. Receipt Verification Rule

The blockchain/payment rail is the source of truth for actual execution.

The agent's statement:

```text
"I paid $4.20."
```

is not sufficient.

The system must verify:

```text
what was authorized
       VS
what was submitted
       VS
what actually happened
```

---

# 39. `AuditEvent`

All important state transitions should produce an audit event.

---

## Canonical Shape

```json
{
  "schema_version": "audit_event.v1",

  "audit_id": "audit_001",

  "event_type": "DECISION_MADE",

  "entity_type": "TRANSACTION",

  "entity_id": "transaction_001",

  "actor_type": "SYSTEM",

  "actor_id": "sentinel-core",

  "timestamp": "2026-09-11T12:10:00Z",

  "result": "ALLOW",

  "references": {
    "intent_id": "intent_001",
    "proposal_id": "proposal_001",
    "decision_id": "decision_001"
  },

  "previous_event_hash": "0x...",
  "event_hash": "0x..."
}
```

---

# 40. `AttestationRecord`

The on-chain attestation registry should receive a minimal cryptographic commitment, not sensitive raw data.

---

## Canonical Shape

```json
{
  "schema_version": "attestation.v1",

  "attestation_id": "attestation_001",

  "agent_id": "agent_001",

  "transaction_id": "transaction_001",

  "trace_merkle_root": "0x...",

  "policy_hash": "0x...",

  "decision": "ALLOW",

  "transaction_hash": "0x...",

  "timestamp": "2026-09-11T12:11:06Z",

  "registry_tx_hash": "0x..."
}
```

Do not place private business data, API credentials, full prompts, or raw evidence content on-chain.

---

# 41. `ThreatSignal`

This contract supports the provenance/Epistemic Independence system inherited from VeriGuard.

```json
{
  "schema_version": "threat_signal.v1",

  "incident_id": "incident_001",

  "affected_component": "provider_001",

  "raw_alert_count": 15,

  "independence_score": 1,

  "confidence_score": 0.94,

  "evidence_ids": [
    "evidence_101",
    "evidence_102"
  ],

  "provenance_root_ids": [
    "evidence_root_001"
  ],

  "issued_at": "2026-09-11T12:00:00Z",

  "expires_at": "2026-09-11T18:00:00Z",

  "issuer": "threat-intelligence-service",

  "signature": "..."
}
```

---

# 42. `EpistemicIndependenceAssessment`

This separates:

```text
How many alerts exist?
```

from:

```text
How many independent roots of evidence exist?
```

---

## Canonical Shape

```json
{
  "schema_version": "epistemic_assessment.v1",

  "incident_id": "incident_001",

  "raw_alert_count": 15,

  "independent_root_count": 1,

  "independence_score": 1,

  "confidence_score": 0.94,

  "source_credibility": 0.96,

  "evidence_type": "ON_CHAIN",

  "provenance_graph_reference": "graph_001",

  "recommended_handling": "MONITOR",

  "created_at": "2026-09-11T12:00:10Z"
}
```

Important:

The EIS produces scored intelligence. It does not own the downstream response policy.

---

# 43. `ModelMetadata`

Every AI-generated security output must identify how it was produced.

```json
{
  "provider": "qwen",
  "model": "model-name",
  "model_version": "version",
  "configuration_version": "config-v1",
  "prompt_version": "prompt-v3",
  "temperature": 0,
  "timestamp": "2026-09-11T12:05:10Z"
}
```

The implementation may later expand this with:

```text
system_prompt_hash
toolset_version
retrieval_version
classifier_version
embedding_model_version
```

---

# 44. `Error`

Cross-service errors must be machine-readable.

```json
{
  "schema_version": "error.v1",

  "code": "POLICY_VIOLATION",

  "message": "Recipient is not allowlisted.",

  "severity": "HIGH",

  "retryable": false,

  "details": {
    "rule_id": "rule_002"
  },

  "correlation_id": "corr_001"
}
```

---

## Error Categories

```text
INVALID_INPUT
SCHEMA_ERROR
AUTHENTICATION_ERROR
AUTHORIZATION_ERROR
POLICY_VIOLATION
THREAT_DETECTED
INSUFFICIENT_EVIDENCE
SIMULATION_FAILED
TRANSACTION_INVALID
EXECUTION_FAILED
EXECUTION_UNKNOWN
CHAIN_ERROR
PROVIDER_ERROR
TIMEOUT
CONFLICT
EXPIRED
RATE_LIMITED
INTERNAL_ERROR
```

---

# 45. Correlation IDs

Every end-to-end task must have a correlation ID.

A single execution should be traceable across:

```text
Intent
→ Agent
→ Trajectory
→ Security
→ Core
→ Simulation
→ Approval
→ Execution
→ Receipt
→ Audit
```

Every service event should carry:

```json
{
  "correlation_id": "corr_001"
}
```

This is required for debugging and incident response.

---

# 46. Contract Ownership

| Contract | Primary Owner | Main Consumers |
|---|---|---|
| Intent | AI/ML | Agent, Core |
| AgentConstitution | Core/Backend | Policy, AI |
| Policy | Core/Backend | Policy Engine |
| TrajectoryEvent | Core/Backend | AI, Audit |
| Evidence | AI/Security | AI, Audit |
| ActionProposal | AI/ML | Core, Security, Execution |
| IntentVerificationResult | AI/ML | Core |
| ThreatAssessment | AI/ML | Core |
| ReputationAssessment | AI/ML | Core |
| RiskAssessment | AI/ML | Core |
| AnomalyAssessment | AI/ML | Core |
| SecurityAssessment | AI/ML | Core |
| TransactionIntent | Core | Blockchain |
| TransactionRequest | Blockchain | Simulation, Core |
| TransactionAnalysis | Blockchain | Core |
| PolicyEvaluation | Core | Decision Engine |
| PolicyViolation | Core | Audit/UI |
| SimulationResult | Blockchain | Core |
| ApprovalRequest | Core | UI/Approval |
| ApprovalResult | Core | Execution |
| Decision | Core | Execution/Audit |
| ExecutionRequest | Core | Blockchain |
| ExecutionResult | Blockchain | Core/Audit |
| ReceiptVerification | Blockchain | Core/Audit |
| AuditEvent | Core | Audit/Attestation |
| AttestationRecord | Blockchain/Core | Registry/Audit |
| ThreatSignal | Security | EIS/Core |
| EIS Assessment | AI/Security | Core |
| ModelMetadata | AI/ML | Audit/Evaluation |
| Error | All services | All services |

---

# 47. Team Boundary Rules

## AI/ML Team

May produce:

```text
Intent
ActionProposal
Evidence
IntentVerificationResult
ThreatAssessment
ReputationAssessment
RiskAssessment
AnomalyAssessment
SecurityAssessment
```

May not produce:

```text
ALLOW
signed transaction
private key
execution receipt
final authorization
```

---

## Backend/Core Team

Owns:

```text
Policy
PolicyEvaluation
PolicyViolation
Decision
ApprovalRequest
ApprovalResult
AuditEvent
```

Backend consumes AI assessments.

Backend must not blindly trust an AI result.

---

## Blockchain/Execution Team

Owns:

```text
TransactionRequest
TransactionAnalysis
SimulationResult
ExecutionRequest
ExecutionResult
ReceiptVerification
AttestationRecord
```

Blockchain execution must never occur without a valid Core decision/authorization context.

---

# 48. SDK Exposure Rules

Not every internal contract should be exposed directly to SDK consumers.

## Public/Stable SDK Objects

V1 candidate:

```text
Intent
AgentConfig
PolicyConfig
ActionProposal
SecuritySummary
ApprovalRequest
Decision
ExecutionResult
AuditRecord
```

## Internal Objects

Keep internal unless needed:

```text
raw ModelMetadata
raw EvidenceGraph
raw TrajectoryEvent
internal classifiers
internal simulator traces
internal provider payloads
```

The SDK should expose stable abstractions, not provider-specific implementation structures.

---

# 49. Versioning

All contracts must include:

```text
schema_version
```

Example:

```text
intent.v1
security_assessment.v1
execution_result.v1
```

A non-breaking addition should preserve the same major schema version when possible.

A breaking field/type/semantic change requires:

```text
v2
```

Never silently change the meaning of an existing field.

---

# 50. Forward Compatibility

Consumers should ignore unknown fields they do not understand.

Producers must not remove required V1 fields without versioning.

Example:

```json
{
  "schema_version": "risk_assessment.v1",
  "score": 0.4,
  "level": "MEDIUM",
  "new_future_field": {}
}
```

A V1 consumer should continue working.

---

# 51. Validation Requirements

Every contract must have:

```text
JSON Schema / equivalent typed schema
runtime validation
unit tests
fixtures
invalid examples
```

The canonical schemas should live in the shared repository package rather than being duplicated inside individual services.

Recommended location:

```text
packages/
└── schemas/
    ├── intent/
    ├── policy/
    ├── trajectory/
    ├── security/
    ├── transaction/
    ├── execution/
    ├── audit/
    └── errors/
```

---

# 52. Contract Tests

Every service consuming another service must have contract tests.

Example:

```text
AI service
   ↓
ActionProposal
   ↓
Core contract test
```

and:

```text
Core
   ↓
ExecutionRequest
   ↓
Blockchain contract test
```

The goal is to prevent one developer from changing a payload and silently breaking another team.

---

# 53. Example: Full V1 Contract Chain

```text
USER TASK
   │
   ▼
Intent
   │
   ▼
Agent Brain
   │
   ▼
ActionProposal
   │
   ├──────────────► TrajectoryEvent
   │
   └──────────────► Evidence
                     │
                     ▼
              Security Intelligence
                     │
                     ▼
              SecurityAssessment
                     │
                     ▼
               Sentinel Core
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
       Policy    Transaction  Approval
      Evaluation  Analysis    Request
          │          │          │
          └──────────┼──────────┘
                     ▼
                  Decision
                     │
                  ALLOW
                     │
                     ▼
             TransactionRequest
                     │
                     ▼
               SimulationResult
                     │
                     ▼
              ExecutionRequest
                     │
                     ▼
              ExecutionResult
                     │
                     ▼
            ReceiptVerification
                     │
                     ▼
                 AuditEvent
                     │
                     ▼
             AttestationRecord
```

---

# 54. What Kiro Must Not Do

When implementing code from these contracts, Kiro must not:

1. invent a second version of an existing shared object;
2. pass free-form model text where a structured contract already exists;
3. treat an AI recommendation as authorization;
4. allow external evidence to mutate policy authority;
5. allow an approved transaction to be modified without revalidation;
6. make transaction simulation an LLM-only operation;
7. use floating-point values for financial equality or authorization decisions;
8. hide uncertainty by defaulting unknown values to safe/low-risk values;
9. expose secrets through contracts or audit records;
10. bypass the Core decision boundary for convenience.

---

# 55. Contract Change Procedure

When a developer needs to modify a shared contract:

```text
1. Identify affected producer(s)
2. Identify affected consumer(s)
3. Update schema
4. Update fixtures
5. Update contract tests
6. Update SDK mappings if public
7. Update documentation
8. Verify backward compatibility
9. Only then merge
```

No unilateral contract changes.

---

# 56. First V1 Shared Contract Priority

The team should implement these first, in this order:

```text
1. Intent
2. ActionProposal
3. Evidence
4. TrajectoryEvent
5. SecurityAssessment
6. Policy
7. PolicyEvaluation
8. Decision
9. TransactionRequest
10. SimulationResult
11. ApprovalRequest / ApprovalResult
12. ExecutionRequest
13. ExecutionResult
14. ReceiptVerification
15. AuditEvent
16. AttestationRecord
```

This order allows the four team members to begin development in parallel while maintaining a stable integration boundary.

---

# 57. Minimal First Vertical Slice

Before implementing the complete platform, the following contract chain must work:

```text
Intent
   ↓
ActionProposal
   ↓
SecurityAssessment
   ↓
PolicyEvaluation
   ↓
Decision
   ↓
TransactionRequest
   ↓
SimulationResult
   ↓
ExecutionRequest
   ↓
ExecutionResult
   ↓
ReceiptVerification
```

Everything else can initially be stubbed around these contracts.

---

# 58. Final Contract Principle

SentinelPay is intentionally designed so that different components can be replaced without rewriting the system.

The following may change independently:

```text
Qwen
Gemini
another model

LangGraph
ADK
custom agent

Alchemy
another RPC provider

one reputation provider
another reputation provider

x402
another payment rail

Base
another EVM chain
```

But the internal SentinelPay contracts remain stable.

That is what makes the architecture suitable for an SDK.

---

# 59. Final Statement

The SentinelPay architecture depends on one critical separation:

```text
AI understands and recommends
        ↓
Shared contracts communicate
        ↓
Deterministic systems validate and authorize
        ↓
Execution systems move money
        ↓
Verification systems prove what actually happened
```

The contract layer is the boundary that makes those responsibilities independently replaceable, testable, and secure.

> **SentinelPay does not trust a model, a service, or a team boundary merely because it produced an answer. It trusts explicit, validated contracts and independently enforced authorization.**
