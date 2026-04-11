from __future__ import annotations

from typing import Any


async def search_discord_messages(query: str) -> list[dict[str, Any]]:
    if not query.strip():
        return []

    return [
        {
            "id": "discord-msg-1",
            "channel": "#general",
            "text": "Daily build is green. QA sanity checks complete.",
            "user": "release-bot",
        }
    ]
