from __future__ import annotations

from typing import Any


async def search_pull_requests(query: str) -> list[dict[str, Any]]:
    if not query.strip():
        return []

    return [
        {
            "id": 1042,
            "repository": "horizon-desk",
            "title": "Add LangGraph docs routing",
            "status": "open",
        }
    ]
