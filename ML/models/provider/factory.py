"""Provider factory — builds the active ProviderRouter from AppConfig.

Mode mapping:
- MOCK: single MockProvider (deterministic, offline).
- LOCAL: OpenAI-compatible provider pointed at a local endpoint.
- HOSTED / PRODUCTION: real chain per config.provider_chain
  (Groq -> NVIDIA -> Gemini by default). A provider whose credential is missing
  is skipped, so a missing fallback key simply shortens the chain rather than
  breaking startup. The primary credential is already enforced by
  AppConfig.validate_required_for_mode().

Business code never imports concrete providers — only this factory and the router.
"""

from __future__ import annotations

from config.settings import AIEnvironment, AppConfig
from models.fallback.mock_provider import MockProvider
from models.gemini.provider import GeminiProvider
from models.groq.provider import GroqProvider
from models.nvidia.provider import NvidiaProvider
from models.provider.base import ModelProvider
from models.provider.openai_compatible import OpenAICompatibleProvider
from models.provider.router import ProviderRouter
from shared.logging import get_logger

logger = get_logger("models.factory")

_PROVIDER_CLASSES = {
    "groq": GroqProvider,
    "nvidia": NvidiaProvider,
    "gemini": GeminiProvider,
}


def _build_hosted_provider(name: str, config: AppConfig) -> ModelProvider | None:
    api_key, base_url, model = config.provider_settings(name)
    cls = _PROVIDER_CLASSES.get(name)
    if cls is None or not api_key or not base_url or not model:
        logger.info("skipping provider (missing config)", extra={"provider": name})
        return None
    return cls(api_key=api_key, base_url=base_url, model=model, timeout_s=config.model_timeout_s)


def build_router(config: AppConfig) -> ProviderRouter:
    """Construct the ProviderRouter appropriate for the active environment."""
    if config.ai_environment == AIEnvironment.MOCK:
        return ProviderRouter([MockProvider()], config)

    if config.ai_environment == AIEnvironment.LOCAL:
        if not config.local_base_url:
            # Fail closed rather than silently pretending LOCAL works.
            raise ValueError("LOCAL mode requires AI_LOCAL_BASE_URL.")
        local = OpenAICompatibleProvider(
            name="local",
            api_key="local",  # local endpoints typically ignore auth
            base_url=config.local_base_url,
            model=config.local_model or "local-model",
            timeout_s=config.model_timeout_s,
        )
        return ProviderRouter([local], config)

    # HOSTED / PRODUCTION: build the real chain, skipping providers without keys.
    providers: list[ModelProvider] = []
    for name in config.provider_chain:
        provider = _build_hosted_provider(name, config)
        if provider is not None:
            providers.append(provider)

    if not providers:
        raise ValueError(
            "No model providers could be built for the active chain "
            f"{config.provider_chain}. Check credentials."
        )

    logger.info(
        "provider chain built",
        extra={"chain": [p.name for p in providers]},
    )
    return ProviderRouter(providers, config)
