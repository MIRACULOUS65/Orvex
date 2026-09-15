"""RAG factory — builds embedder, vector store, retriever, ingestion from config.

Selects the embedding provider and vector store per AppConfig so RAG stays
provider-agnostic. Chroma is the default local store; Pinecone is used only when
configured.
"""

from __future__ import annotations

from config.settings import AppConfig
from models.embeddings.base import EmbeddingProvider
from models.embeddings.local import LocalHashingEmbeddingProvider
from rag.ingestion.pipeline import IngestionPipeline
from rag.retrieval.retriever import Retriever
from rag.vector_store.base import VectorStore
from shared.logging import get_logger

logger = get_logger("rag.factory")

# Cache expensive singletons: the embedding model (loads weights once) and each
# vector-store client. Rebuilding these per request caused model reloads under load.
_embedder_cache: EmbeddingProvider | None = None
_store_cache: dict[str, VectorStore] = {}


def build_embedder(config: AppConfig) -> EmbeddingProvider:
    """Select the embedding provider (cached singleton — loaded once per process).

    Priority:
    1. "sentence_transformer" / "auto" (default): real local semantic embeddings
       (all-MiniLM-L6-v2), no API key, no rate limits. Best for grounded RAG.
    2. "gemini" / "hosted": Gemini's embedding API (gemini-embedding-001, 3072-dim).
    3. "local": deterministic hashing (offline, weak semantics — CI/minimal only).
    """
    global _embedder_cache
    if _embedder_cache is not None:
        return _embedder_cache

    provider = config.embedding_provider
    embedder: EmbeddingProvider | None = None
    if provider in ("auto", "sentence_transformer"):
        try:
            from models.embeddings.sentence_transformer import SentenceTransformerEmbeddingProvider

            embedder = SentenceTransformerEmbeddingProvider()
        except ImportError:
            embedder = None

    if embedder is None and provider in ("gemini", "hosted") and config.gemini_api_key:
        from models.embeddings.hosted import HostedEmbeddingProvider

        embedder = HostedEmbeddingProvider(
            api_key=config.gemini_api_key,
            base_url=config.gemini_base_url,
            model=config.embedding_model,
            dimension=config.embedding_dimension,
        )
    if embedder is None:
        embedder = LocalHashingEmbeddingProvider()

    _embedder_cache = embedder
    return embedder


def build_vector_store(config: AppConfig, *, collection: str = "sentinelpay") -> VectorStore:
    cache_key = f"{config.vector_store_provider}:{collection}"
    if cache_key in _store_cache:
        return _store_cache[cache_key]

    if config.vector_store_provider == "pinecone" and config.pinecone_api_key and config.pinecone_index:
        from rag.vector_store.pinecone_store import PineconeStore

        store: VectorStore = PineconeStore(api_key=config.pinecone_api_key, index=config.pinecone_index)
    else:
        from rag.vector_store.chroma_store import ChromaStore

        store = ChromaStore(path=config.chroma_path, collection=collection)
    _store_cache[cache_key] = store
    return store


def build_retriever(config: AppConfig, *, collection: str = "sentinelpay") -> Retriever:
    return Retriever(embedder=build_embedder(config), store=build_vector_store(config, collection=collection))


def build_ingestion(config: AppConfig, *, collection: str = "sentinelpay") -> IngestionPipeline:
    return IngestionPipeline(
        embedder=build_embedder(config), store=build_vector_store(config, collection=collection)
    )
