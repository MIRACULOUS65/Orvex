"""Configuration management for the SentinelPay AI/ML subsystem.

Rules enforced here (per Orvex/Docs/API.md Kiro rules and SECURITY_MODEL.md):
- Every secret field uses ``repr=False`` so it never appears in logs/tracebacks.
- ``validate_required_for_mode()`` fails startup if HOSTED/PRODUCTION is selected
  without the credentials that mode requires. It NEVER silently downgrades to MOCK.
- No secret is ever hard-coded; all provider keys/endpoints come from the environment.
- The rest of the service reads the active mode from an injected ``AppConfig``,
  never from ad hoc ``os.environ`` calls scattered across the codebase.
"""

from __future__ import annotations

from enum import Enum

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AIEnvironment(str, Enum):
    """Runtime mode. Controls provider/store selection only — no business logic
    elsewhere branches on this value directly."""

    MOCK = "mock"
    LOCAL = "local"
    HOSTED = "hosted"
    PRODUCTION = "production"


class ConfigurationError(RuntimeError):
    """Raised at startup when required configuration for the selected mode is absent."""


class AppConfig(BaseSettings):
    """Central, typed configuration. Injected as a FastAPI dependency."""

    # Loads .env.local (gitignored secrets) if present; real env vars still win.
    model_config = SettingsConfigDict(
        env_prefix="AI_",
        env_file=".env.local",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---- Runtime mode ----------------------------------------------------
    # With env_prefix="AI_", the field name `ai_environment` would otherwise map to
    # AI_AI_ENVIRONMENT. Alias it so the intuitive AI_ENVIRONMENT works.
    ai_environment: AIEnvironment = Field(
        default=AIEnvironment.MOCK,
        validation_alias=AliasChoices("AI_ENVIRONMENT", "ai_environment", "environment"),
    )
    service_version: str = "0.1.0"

    # ---- Model routing (values only; keys are secrets) -------------------
    # V1 chain per product direction: Groq (primary) -> NVIDIA -> Gemini (last).
    # Qwen is deliberately not in the active chain right now (kept configurable).
    # All three are OpenAI-compatible, so one shared provider implementation
    # serves all of them (see models/provider/openai_compatible.py).
    primary_provider: str = "groq"
    fallback_providers: list[str] = Field(default_factory=lambda: ["nvidia", "gemini"])

    # Groq (primary). Free tier, ultra-fast LPU. OpenAI-compatible.
    # gpt-oss-* is org-gated on some keys; qwen3.6-27b is broadly accessible + fast.
    groq_api_key: str | None = Field(default=None, repr=False)
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "qwen/qwen3.6-27b"

    # NVIDIA NIM (fallback 1). OpenAI-compatible, large free hosted catalog.
    nvidia_api_key: str | None = Field(default=None, repr=False)
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_model: str = "nvidia/nemotron-3-super-120b-a12b"

    # Google Gemini (fallback 2 — last resort). OpenAI-compatible endpoint.
    # NOTE: "Gemini Flash 3.8 Lite" does not exist; current low-latency model is
    # gemini-3.5-flash-lite (2.5-flash-lite is closed to new users).
    gemini_api_key: str | None = Field(default=None, repr=False)
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    gemini_model: str = "gemini-3.5-flash-lite"

    # Qwen (kept for future; not in default chain)
    qwen_api_key: str | None = Field(default=None, repr=False)
    qwen_base_url: str | None = None
    qwen_model: str | None = None

    # Local OpenAI-compatible endpoint (LOCAL mode)
    local_base_url: str | None = None
    local_model: str | None = None

    # ---- Embeddings ------------------------------------------------------
    # "auto"/"sentence_transformer" -> local semantic embeddings (all-MiniLM-L6-v2),
    # offline, no key, no rate limits. "gemini"/"hosted" -> Gemini embedding API.
    # "local" -> deterministic hashing (weak; CI/minimal only).
    embedding_provider: str = "auto"
    embedding_model: str = "gemini-embedding-001"
    embedding_dimension: int = 3072

    # ---- Vector store ----------------------------------------------------
    vector_store_provider: str = "chroma"
    chroma_path: str = "./.chroma"
    pinecone_api_key: str | None = Field(default=None, repr=False)
    pinecone_index: str | None = None

    # ---- Service auth ----------------------------------------------------
    internal_service_token: str | None = Field(default=None, repr=False)

    # ---- Timeouts / retries ----------------------------------------------
    model_timeout_s: float = 20.0
    model_max_retries: int = 2
    tool_timeout_s: float = 15.0
    # Agent runs make several sequential real LLM calls; allow generous headroom.
    request_timeout_s: float = 150.0

    # ---- Observability ---------------------------------------------------
    otel_enabled: bool = False
    otel_exporter_endpoint: str | None = None
    otel_service_name: str = "sentinelpay-ai"

    # ---- Prompt / config versioning (recorded in ModelMetadata) ----------
    configuration_version: str = "config-v1"

    # ------------------------------------------------------------------ #
    # Validation
    # ------------------------------------------------------------------ #
    def validate_required_for_mode(self) -> None:
        """Fail closed at startup if the selected mode lacks required config.

        Never downgrades the mode. Raises ConfigurationError instead.
        """
        missing: list[str] = []

        if self.ai_environment in (AIEnvironment.HOSTED, AIEnvironment.PRODUCTION):
            # The PRIMARY provider's credential must be present (fallbacks are
            # optional — a missing fallback key just removes it from the chain).
            key_by_provider = {
                "groq": ("AI_GROQ_API_KEY", self.groq_api_key),
                "nvidia": ("AI_NVIDIA_API_KEY", self.nvidia_api_key),
                "gemini": ("AI_GEMINI_API_KEY", self.gemini_api_key),
                "qwen": ("AI_QWEN_API_KEY", self.qwen_api_key),
            }
            env_name, value = key_by_provider.get(self.primary_provider, (None, None))
            if env_name and not value:
                missing.append(env_name)

        if self.ai_environment == AIEnvironment.LOCAL and not self.local_base_url:
            missing.append("AI_LOCAL_BASE_URL")

        if self.ai_environment == AIEnvironment.PRODUCTION:
            # Production requires telemetry and service auth.
            if not self.otel_enabled:
                missing.append("AI_OTEL_ENABLED=true")
            if not self.internal_service_token:
                missing.append("AI_INTERNAL_SERVICE_TOKEN")
            if self.vector_store_provider == "pinecone" and not self.pinecone_api_key:
                missing.append("AI_PINECONE_API_KEY")

        if missing:
            raise ConfigurationError(
                f"Mode '{self.ai_environment.value}' requires configuration that is "
                f"missing: {', '.join(missing)}. Refusing to start (fail closed). "
                "The service will NOT silently downgrade to MOCK."
            )

    @property
    def is_mock(self) -> bool:
        return self.ai_environment == AIEnvironment.MOCK

    @property
    def provider_chain(self) -> list[str]:
        """Ordered provider preference: primary first, then configured fallbacks
        (deduplicated, primary never repeated)."""
        chain = [self.primary_provider]
        for p in self.fallback_providers:
            if p not in chain:
                chain.append(p)
        return chain

    def provider_settings(self, name: str) -> tuple[str | None, str | None, str | None]:
        """Return (api_key, base_url, model) for a provider name."""
        table = {
            "groq": (self.groq_api_key, self.groq_base_url, self.groq_model),
            "nvidia": (self.nvidia_api_key, self.nvidia_base_url, self.nvidia_model),
            "gemini": (self.gemini_api_key, self.gemini_base_url, self.gemini_model),
            "qwen": (self.qwen_api_key, self.qwen_base_url, self.qwen_model),
        }
        return table.get(name, (None, None, None))


_config: AppConfig | None = None


def get_config() -> AppConfig:
    """Process-wide singleton accessor. Used by the FastAPI dependency and startup."""
    global _config
    if _config is None:
        _config = AppConfig()
    return _config


def reset_config_for_tests(config: AppConfig | None = None) -> None:
    """Test helper to override/reset the singleton."""
    global _config
    _config = config
