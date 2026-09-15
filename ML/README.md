# SentinelPay — AI/ML Subsystem

The intelligence layer of SentinelPay. It **understands, reasons, researches, plans, proposes, verifies, and explains**. It **never authorizes or executes money movement** — that authority belongs exclusively to SentinelPay Core and the Blockchain/Execution layer.

> **AI may recommend. Deterministic systems authorize.**

This service is the concrete implementation of the `services/ai/` layer described in `Orvex/Docs/PRD_AIML.md`, physically rooted at `Orvex/ML/`.

## What this service does

| Capability | Endpoint |
|---|---|
| Parse natural-language goal → structured `Intent` | `POST /intent/parse` |
| Run the autonomous Agent Brain → `ActionProposal` | `POST /agent/run` |
| Analyze a proposal → `SecurityAssessment` | `POST /proposal/analyze` |
| Full security intelligence pipeline | `POST /security/analyze` |
| Compile natural-language policy → structured candidate | `POST /policy/compile` |
| System | `GET /health` `GET /ready` `GET /version` `GET /metrics` |

## What this service must NEVER do

- Authorize a payment, sign a transaction, or hold a private key.
- Simulate a blockchain transaction (that is Blockchain/Execution's job).
- Emit any field a consumer could read as authorization (`authorized`, `execute`, `allow`).
- Convert model/provider/retrieval failure into a "safe" default. It fails closed.
- Let external content, tool output, or memory override policy or intent.

## Configuration modes

Set `AI_ENVIRONMENT` to one of:

| Mode | Model | Vector store | External creds |
|---|---|---|---|
| `mock` (default) | deterministic fixtures | in-memory | none |
| `local` | local OpenAI-compatible endpoint | ChromaDB | none |
| `hosted` | Groq (primary) → NVIDIA → Gemini (fallback) | ChromaDB/Pinecone | required |
| `production` | same as hosted, stricter | Pinecone | required |

### V1 provider chain (all OpenAI-compatible; verified working)

| Order | Provider | Default model | Endpoint |
|---|---|---|---|
| primary | Groq | `qwen/qwen3.6-27b` | `api.groq.com/openai/v1` |
| fallback 1 | NVIDIA NIM | `meta/llama-3.2-11b-vision-instruct` | `integrate.api.nvidia.com/v1` |
| fallback 2 | Gemini | `gemini-3.5-flash-lite` | `generativelanguage.googleapis.com/v1beta/openai` |

Model IDs are configuration (`AI_GROQ_MODEL`, etc.), not hard-coded. `MOCK` mode
needs none of these.

`MOCK` mode requires no API keys and no external services — the full test suite runs offline.

## Quick start

```bash
cd Orvex/ML
pip install -e ".[dev,chroma,embeddings]"
uvicorn gateway.app:app --reload --port 8000
# GET http://localhost:8000/health
```

Hosted mode (real providers + RAG) reads `.env.local`. RAG uses ChromaDB (local,
persisted at `./.chroma`) with `sentence-transformers` (all-MiniLM-L6-v2) for real
semantic embeddings — fully offline, no API key, no rate limits. Retrieval returns
`grounded=false` when nothing relevant is found (anti-hallucination signal).

## Endpoints (all verified end-to-end)

`GET /health /ready /version /metrics` ·
`POST /intent/parse` · `POST /agent/run` ·
`POST /policy/compile /policy/validate` ·
`POST /security/analyze` (+ `/security/{intent-verify,threat,reputation,anomaly,provenance}`) ·
`POST /proposal/analyze` ·
`POST /rag/ingest /rag/retrieve`

## Run tests

```bash
cd Orvex/ML
pytest
```

## Layout

See `Orvex/.kiro`-adjacent spec at `.kiro/specs/ai-ml-subsystem/design.md` §B1 for the full module tree. Top level:

```
gateway/     FastAPI app, routes, middleware, health
agents/      Intent engine, Agent Brain (LangGraph)
subagents/   Specialized LLM sub-reasoners
models/      ModelProvider abstraction + providers + embeddings
tools/       Read-only tool registry
memory/      Short-term state, retrieval memory, provenance graph
rag/         Ingestion, chunking, embedding, retrieval, vector store
security/    Intent verifier, threat, reputation, risk, anomaly, EIS, explanation
policy_ai/   NL policy compiler (candidate only — never activates policy)
schemas/     Pydantic adapters that mirror Orvex/Docs/CONTRACTS.md
config/       Settings + environment files
evaluation/  Datasets, attacks, benchmarks, regression, reports
tests/       unit, contract, security (incl. mandatory broken-AI test), integration
```
