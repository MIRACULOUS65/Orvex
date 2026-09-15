"""Multimodal tests (Requirements 6.2, 6.3, 6.4)."""

from __future__ import annotations

from models.provider.base import InputPart, ModelProvider
from models.provider.modality_router import ModalityRouter
from rag.ingestion.document_parser import parse_image, parse_text


class _TextProvider(ModelProvider):
    name = "text-only"
    modality_support = frozenset({"text", "structured_json"})

    async def health(self):
        return True

    async def generate(self, request):
        raise NotImplementedError

    async def generate_structured(self, request, schema):
        raise NotImplementedError


class _VisionProvider(ModelProvider):
    name = "vision"
    modality_support = frozenset({"text", "structured_json", "image"})

    async def health(self):
        return True

    async def generate(self, request):
        raise NotImplementedError

    async def generate_structured(self, request, schema):
        raise NotImplementedError


def test_routes_image_to_vision_provider():
    router = ModalityRouter([_TextProvider(), _VisionProvider()])
    decision = router.route([InputPart(kind="image", content=b"...")])
    assert decision.supported is True
    assert decision.provider.name == "vision"


def test_unsupported_modality_reported_not_dropped():
    router = ModalityRouter([_TextProvider()])
    decision = router.route([InputPart(kind="image", content=b"...")])
    assert decision.supported is False
    assert "image" in decision.unsupported_kinds


def test_text_parser_preserves_source():
    doc = parse_text("https://ex.com", "hello world")
    assert doc.supported is True
    assert doc.source == "https://ex.com"
    assert doc.full_text == "hello world"


def test_image_parser_returns_explicit_unsupported():
    doc = parse_image("scan.png", b"\x89PNG")
    assert doc.supported is False
    assert doc.note  # explicit reason, content not silently dropped
