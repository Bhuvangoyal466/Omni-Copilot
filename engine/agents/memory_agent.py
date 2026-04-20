from __future__ import annotations

from agents.types import AgentEvent, AgentOutput
from db.vector import memory_store


class MemoryAgent:
    name = "MemoryAgent"

    async def run(self, user_message: str) -> AgentOutput:
        events: list[AgentEvent] = [
            {"agent": self.name, "message": "Searching long-term memory", "status": "running"}
        ]

        matches = await memory_store.search_memory(user_message)

        events.append(
            {
                "agent": self.name,
                "message": "Memory retrieval complete",
                "status": "completed",
            }
        )

        if matches:
            answer = f"I found {len(matches)} memory matches and can apply them to your request."
        else:
            answer = "No memory matches yet. Ask me to remember this preference for future tasks."

        return {
            "answer": answer,
            "events": events,
            "tool_results": {"memory": matches},
        }

