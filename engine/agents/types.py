from __future__ import annotations

from typing import Any, Literal, NotRequired, TypedDict

AgentStatusKind = Literal["running", "completed", "failed"]
AgentRoute = Literal["chat", "docs", "comms", "calendar", "code", "browser", "memory"]


class AgentEvent(TypedDict):
    agent: str
    message: str
    status: AgentStatusKind


class AgentOutput(TypedDict):
    answer: str
    events: list[AgentEvent]
    tool_results: dict[str, Any]


class GraphState(TypedDict):
    chat_id: str
    message: str
    route: AgentRoute
    answer: str
    events: list[AgentEvent]
    tool_results: dict[str, Any]
    user_id: NotRequired[str]
    preferred_model: NotRequired[str]
