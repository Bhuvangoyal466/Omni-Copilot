from __future__ import annotations

from typing import Any

from db.models import initialize_database, search_memory_entries, store_memory_entry


class MemoryVectorStore:
    async def ensure_collection(self) -> None:
        initialize_database()

    async def upsert_memory(self, user_id: str, text: str, metadata: dict[str, Any] | None = None) -> None:
        initialize_database()
        store_memory_entry(user_id, text, metadata)

    async def search_memory(
        self,
        query: str,
        limit: int = 5,
        *,
        user_id: str | None = None,
    ) -> list[dict[str, Any]]:
        initialize_database()
        return search_memory_entries(query, user_id=user_id, limit=limit)


memory_store = MemoryVectorStore()

