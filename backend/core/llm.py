from __future__ import annotations

import json
from typing import Any

from core.config import settings

try:
    from openai import AsyncOpenAI  # type: ignore[import-not-found]
except Exception:  # pragma: no cover - handled gracefully at runtime
    AsyncOpenAI = None  # type: ignore[assignment]

_openai_client: Any | None = None
_groq_client: Any | None = None


def _model_provider(model: str) -> str:
    normalized = model.strip().lower()
    if normalized.startswith(("gpt-", "o1", "o3", "o4")):
        return "openai"
    return "groq"


def _get_client(provider: str) -> Any | None:
    global _openai_client, _groq_client

    if provider == "openai":
        if _openai_client is not None:
            return _openai_client
        if not settings.openai_api_key or AsyncOpenAI is None:
            return None
        _openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
        return _openai_client

    if provider == "groq":
        if _groq_client is not None:
            return _groq_client
        if not settings.groq_api_key or AsyncOpenAI is None:
            return None
        _groq_client = AsyncOpenAI(
            api_key=settings.groq_api_key,
            base_url="https://api.groq.com/openai/v1",
        )
        return _groq_client

    return None


def _candidate_models(preferred_model: str | None) -> list[str]:
    ordered: list[str] = []
    for value in (preferred_model, settings.default_model, settings.fallback_model):
        model = (value or "").strip()
        if model and model not in ordered:
            ordered.append(model)
    return ordered


async def generate_assistant_reply(
    user_message: str,
    *,
    system_prompt: str,
    context: dict[str, Any] | None = None,
    max_tokens: int = 300,
    preferred_model: str | None = None,
) -> str | None:
    models = _candidate_models(preferred_model)
    if not models:
        return None

    context_text = ""
    if context:
        context_text = "\n\nContext JSON:\n" + json.dumps(context, ensure_ascii=True)

    user_payload = f"User message:\n{user_message}{context_text}"

    for model in models:
        provider = _model_provider(model)
        client = _get_client(provider)
        if client is None:
            continue

        try:
            completion = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_payload},
                ],
                temperature=0.3,
                max_tokens=max_tokens,
            )
            answer = completion.choices[0].message.content
            if isinstance(answer, str) and answer.strip():
                return answer.strip()
        except Exception:
            continue

    return None
