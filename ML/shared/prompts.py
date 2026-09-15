"""Versioned prompt template loader.

Prompts live under ``prompts/<area>/<version>.jinja`` and are rendered with Jinja2.
The version string is recorded in ModelMetadata so every AI result is reproducible.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

_PROMPT_ROOT = Path(__file__).resolve().parents[1] / "prompts"


@lru_cache(maxsize=1)
def _env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(_PROMPT_ROOT)),
        undefined=StrictUndefined,
        autoescape=False,
        trim_blocks=True,
        lstrip_blocks=True,
    )


def render_prompt(area: str, version: str, **kwargs) -> str:
    """Render ``prompts/<area>/<version>.jinja`` with the given context."""
    template = _env().get_template(f"{area}/{version}.jinja")
    return template.render(**kwargs)
