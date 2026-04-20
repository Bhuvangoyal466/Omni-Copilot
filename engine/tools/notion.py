from __future__ import annotations

from typing import Any


async def search_notion_pages(query: str) -> list[dict[str, Any]]:
    if not query.strip():
        return []

    return [
        {
            "id": "notion-page-1",
            "title": "Weekly Engineering Notes",
            "summary": "Action items and roadmap context",
        }
    ]
