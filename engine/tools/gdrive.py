from __future__ import annotations

from typing import Any


async def search_drive_files(query: str) -> list[dict[str, Any]]:
    if not query.strip():
        return []

    return [
        {
            "id": "drive-file-1",
            "name": "Quarterly-plan.docx",
            "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }
    ]
