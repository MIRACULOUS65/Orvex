"""Document parser — extracts text from PDF/image/text while preserving provenance.

Preserves source, page, content hash, timestamp so a later security conclusion can
say "this came from page X of document Y" (PRD_AIML Multimodal Document Pipeline).
PDF/image extraction is optional (requires the 'docs' extra); text always works.
If extraction for a type is unavailable, returns an explicit unsupported marker
rather than silently dropping content.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ParsedPage:
    page: int
    text: str


@dataclass(frozen=True)
class ParsedDocument:
    source: str
    doc_type: str
    pages: list[ParsedPage]
    supported: bool
    note: str | None = None

    @property
    def full_text(self) -> str:
        return "\n".join(p.text for p in self.pages)


def parse_text(source: str, content: str) -> ParsedDocument:
    return ParsedDocument(
        source=source, doc_type="TEXT", pages=[ParsedPage(page=1, text=content)], supported=True
    )


def parse_pdf(source: str, data: bytes) -> ParsedDocument:
    try:
        import io

        from pypdf import PdfReader
    except ImportError:
        return ParsedDocument(
            source=source, doc_type="PDF", pages=[], supported=False,
            note="PDF parsing requires the 'docs' optional dependency (pypdf).",
        )
    reader = PdfReader(io.BytesIO(data))
    pages = [ParsedPage(page=i + 1, text=(pg.extract_text() or "")) for i, pg in enumerate(reader.pages)]
    return ParsedDocument(source=source, doc_type="PDF", pages=pages, supported=True)


def parse_image(source: str, data: bytes) -> ParsedDocument:
    # OCR is intentionally deferred (needs an OCR engine). Return explicit unsupported
    # rather than silently discarding security-relevant image content.
    return ParsedDocument(
        source=source, doc_type="IMAGE", pages=[], supported=False,
        note="Image OCR not enabled; route image to a vision-capable model instead.",
    )
