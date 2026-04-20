from __future__ import annotations

from typing import Any


async def search_slack_messages(query: str) -> list[dict[str, Any]]:
    if not query.strip():
        return []

    return [
        {
            "id": "slack-msg-1",
            "channel": "#engineering",
            "text": "Please post release notes before EOD.",
            "user": "ops-bot",
        }
    ]
