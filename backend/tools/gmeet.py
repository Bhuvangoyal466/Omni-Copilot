from __future__ import annotations

from typing import Any


async def list_meet_sessions(query: str | None = None) -> list[dict[str, Any]]:
    _ = query
    return [
        {
            "id": "meet-1",
            "title": "Weekly Team Meet",
            "start": "2026-04-10T09:30:00Z",
            "url": "https://meet.google.com/example",
        }
    ]
