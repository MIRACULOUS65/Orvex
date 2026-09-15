"""Local semantic embedding provider using sentence-transformers.

Real semantic embeddings, fully offline, no API key, no rate limits — the right
default for grounded, non-hallucinating RAG on localhost. Model loads lazily and is
cached on disk after first download. Vectors are L2-normalized so cosine similarity
is meaningful and consistent between ingest and retrieval.
"""

from __future__ import annotations

from models.embeddings.base import EmbeddingProvider
from shared.logging import get_logger

logger = get_logger("models.embeddings.st")

_DEFAULT_MODEL = "all-MiniLM-L6-v2"
_DEFAULT_DIM = 384


class SentenceTransformerEmbeddingProvider(EmbeddingProvider):
    def __init__(self, model_name: str = _DEFAULT_MODEL, dimension: int = _DEFAULT_DIM):
        self.model_name = model_name
        self.model_version = "sentence-transformers"
        self.dimension = dimension
        self._model = None

    def _ensure(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            logger.info("loading embedding model", extra={"model": self.model_name})
            self._model = SentenceTransformer(self.model_name)
            get_dim = getattr(self._model, "get_embedding_dimension", None) or getattr(
                self._model, "get_sentence_embedding_dimension"
            )
            self.dimension = get_dim()
        return self._model

    async def embed(self, texts: list[str]) -> list[list[float]]:
        model = self._ensure()
        # sentence-transformers is synchronous; encode is CPU-bound and fast for
        # small batches. Normalize so cosine distance in the store is meaningful.
        vectors = model.encode(texts, normalize_embeddings=True)
        return [v.tolist() for v in vectors]
