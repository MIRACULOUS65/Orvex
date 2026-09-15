"""Debug: print the raw structured output of the compare_v1 prompt from real models."""

from __future__ import annotations

import asyncio
import json

from config.settings import AppConfig
from models.provider.base import GenerationRequest
from models.provider.factory import build_router
from shared.prompts import render_prompt


async def main() -> None:
    config = AppConfig(ai_environment="hosted")
    router = build_router(config)

    intent = {
        "intent_id": "intent_1",
        "purpose": "market_data_access",
        "user_goal": "find a market data API under 10 USDC",
        "budget": {"maximum": "10.00", "currency": "USDC", "period": "daily"},
        "autonomy_level": "AUTOMATIC",
    }
    observations = [
        {
            "title": "ExampleData API",
            "url": "https://exampledata.io/pricing",
            "snippet": "Market data API. 4.20 USDC/day. Pay via x402 to service ExampleData.",
        }
    ]
    prompt = render_prompt(
        "agent", "compare_v1", intent=json.dumps(intent), observations=json.dumps(observations)
    )
    req = GenerationRequest(
        system_prompt=prompt,
        messages=[{"role": "user", "content": "Select the best candidate action or say none."}],
        prompt_version="compare_v1",
    )
    resp = await router.generate_structured(req, dict)
    print("provider:", resp.metadata.provider)
    print("RAW structured:")
    print(json.dumps(resp.structured, indent=2))
    print("RAW text:", resp.text)


if __name__ == "__main__":
    asyncio.run(main())
