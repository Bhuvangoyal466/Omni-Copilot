from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from db.vector import memory_store

router = APIRouter(prefix="/api/memory", tags=["memory"])


class MemoryWriteRequest(BaseModel):
    userId: str = Field(default="demo-user")
    text: str = Field(min_length=1)


@router.post("")
async def add_memory(payload: MemoryWriteRequest):
    await memory_store.upsert_memory(payload.userId, payload.text)
    return {"ok": True}


@router.get("")
async def search_memory(
    query: str = Query(default="", min_length=0),
    userId: str = Query(default="demo-user", min_length=1),
):
    if not query:
        return []
    return await memory_store.search_memory(query, user_id=userId)

