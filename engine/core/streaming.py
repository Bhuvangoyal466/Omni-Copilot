from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any


def format_sse(event: str, data: Any) -> str:
    payload = json.dumps(data, ensure_ascii=True)
    return f"event: {event}\ndata: {payload}\n\n"


async def stream_text_tokens(text: str, delay: float = 0.02) -> AsyncIterator[str]:
    words = text.split(" ")
    for index, word in enumerate(words):
        suffix = " " if index < len(words) - 1 else ""
        yield format_sse("token", f"{word}{suffix}")
        await asyncio.sleep(delay)
