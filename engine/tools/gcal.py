from __future__ import annotations

from typing import Any


async def list_upcoming_events(query: str | None = None) -> list[dict[str, Any]]:
    _ = query
    return [
        {
            "id": "event-1",
            "title": "Design review",
            "start": "2026-03-31T10:30:00Z",
            "end": "2026-03-31T11:00:00Z",
        }
    ]
