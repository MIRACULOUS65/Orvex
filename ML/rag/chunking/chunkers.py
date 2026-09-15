"""Chunkers — split documents into overlapping windows for embedding."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Chunk:
    text: str
    index: int
    metadata: dict


def chunk_text(
    text: str, *, chunk_size: int = 800, overlap: int = 120, base_metadata: dict | None = None
) -> list[Chunk]:
    """Sliding-window chunker over whitespace-normalized text."""
    base_metadata = base_metadata or {}
    words = text.split()
    if not words:
        return []
    chunks: list[Chunk] = []
    step = max(chunk_size - overlap, 1)
    approx_chars = 0
    # Chunk by character windows for simplicity/determinism.
    i = 0
    idx = 0
    while i < len(text):
        window = text[i : i + chunk_size]
        chunks.append(Chunk(text=window, index=idx, metadata=dict(base_metadata)))
        idx += 1
        i += step
    return chunks
