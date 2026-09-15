"""Manual live smoke test for real providers (NOT part of the automated suite).

Run: .\.venv\Scripts\python.exe scripts\smoke_providers.py
Reads .env.local. Makes ONE real call per configured provider to confirm the key,
endpoint, and model id are valid. Prints provider + latency; never prints keys.
"""

from __future__ import annotations

import asyncio

from config.settings import get_config
from models.provider.base import GenerationRequest
from models.provider.factory import build_router


async def main() -> None:
    from config.settings import AppConfig

    # Force hosted for the live smoke test (reads .env.local for keys).
    config = AppConfig(ai_environment="hosted")
    print(f"environment={config.ai_environment.value} chain={config.provider_chain}")
    router = build_router(config)

    request = GenerationRequest(
        system_prompt='Reply ONLY with a JSON object: {"ok": true, "provider_hint": "<your model family>"}.',
        messages=[{"role": "user", "content": "healthcheck"}],
        temperature=0.0,
    )

    # Test each provider individually to see which are actually reachable.
    for provider in router.providers:
        try:
            healthy = await provider.health()
            print(f"[{provider.name}] health={healthy}")
            resp = await provider.generate_structured(request, dict)
            print(f"[{provider.name}] structured={resp.structured} latency_ms={resp.latency_ms:.0f} model_version={resp.metadata.model_version}")
        except Exception as exc:  # noqa: BLE001
            print(f"[{provider.name}] ERROR: {type(exc).__name__}: {exc}")

    # Test the router end-to-end (uses fallback automatically).
    print("--- router (with fallback) ---")
    try:
        resp = await router.generate_structured(request, dict)
        print(f"router chose provider={resp.metadata.provider} structured={resp.structured}")
    except Exception as exc:  # noqa: BLE001
        print(f"router ERROR: {type(exc).__name__}: {exc}")


if __name__ == "__main__":
    asyncio.run(main())
