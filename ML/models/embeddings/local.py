"""Local embedding provider — deterministic, dependency-free, offline.

Uses a hashing-based bag-of-tokens embedding. This is NOT semantically strong, but
it is deterministic and needs no model download or API key, so RAG works fully
offline in MOCK/LOCAL/tests. A stronger local model (e.g. sentence-transformers)
can be swapped in behind the same interface without touching call sites.

Determinism matters for RAG grounding: the same text always maps to the same
vector, so retrieval is reproducible and does not "drift".
"""

from __future__ import annotations

import hashlib
import math
import re

from models.embeddings.base import EmbeddingProvider

_TOKEN_RE = re.compile(r"[a-z0-9]+")


class LocalHashingEmbeddingProvider(EmbeddingProvider):
    model_name = "local-hashing-v1"
    model_version = "1"

    def __init__(self, dimension: int = 256):
        self.dimension = dimension

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(t) for t in texts]

    def _embed_one(self, text: str) -> list[float]:
        vec = [0.0] * self.dimension
        tokens = _TOKEN_RE.findall((text or "").lower())
        for tok in tokens:
            h = int(hashlib.sha256(tok.encode()).hexdigest(), 16)
            idx = h % self.dimension
            sign = 1.0 if (h >> 8) % 2 == 0 else -1.0
            vec[idx] += sign
        # L2 normalize so cosine similarity is meaningful.
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]
