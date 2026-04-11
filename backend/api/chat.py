from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agents.orchestrator import run_orchestration
from core.auth import get_current_user_optional
from core.streaming import format_sse, stream_text_tokens
from db.vector import memory_store

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    chatId: str = Field(min_length=1)
    message: str = Field(min_length=1)
    model: str | None = None
    voiceMode: bool = False


@router.post("/stream")
async def stream_chat(
    payload: ChatRequest,
    request: Request,
    user: dict | None = Depends(get_current_user_optional),
) -> StreamingResponse:
    async def event_generator():
        try:
            user_id = user.get("sub") if user else request.headers.get("x-omni-user-id", "anonymous")
            memory_hits = await memory_store.search_memory(payload.message, limit=3, user_id=user_id)

            if memory_hits:
                context_lines: list[str] = []
                for item in memory_hits:
                    text = str(item.get("text") or item.get("memory") or "").strip()
                    if text:
                        context_lines.append(f"- {text[:220]}")
                memory_context = "\n".join(context_lines)
                routed_message = (
                    payload.message
                    if not memory_context
                    else f"{payload.message}\n\nRelevant memory context:\n{memory_context}"
                )
            else:
                routed_message = payload.message

            state = await run_orchestration(
                chat_id=payload.chatId,
                message=routed_message,
                user_id=user_id,
                preferred_model=payload.model,
            )

            for status_event in state["events"]:
                yield format_sse("status", status_event)
                await asyncio.sleep(0.03)

            token_delay = 0.006 if payload.voiceMode else 0.018
            async for token_event in stream_text_tokens(state["answer"], delay=token_delay):
                yield token_event

            yield format_sse(
                "done",
                {
                    "chatId": payload.chatId,
                    "route": state["route"],
                    "tools": list(state["tool_results"].keys()),
                    "user": user_id,
                    "memoryUsed": len(memory_hits),
                },
            )

            memory_blob = (
                f"User: {payload.message}\n"
                f"Assistant: {state['answer']}\n"
                f"Route: {state['route']}\n"
                f"ChatId: {payload.chatId}"
            )
            try:
                await memory_store.upsert_memory(
                    user_id=user_id,
                    text=memory_blob,
                    metadata={"chat_id": payload.chatId, "route": state["route"]},
                )
            except Exception:
                # Memory write failures should not break successful chat responses.
                pass
        except Exception as exc:
            yield format_sse("error", f"Temporary backend error: {exc}")

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

