from __future__ import annotations

from agents.types import AgentEvent, AgentOutput
from tools.github import search_pull_requests


class CodeAgent:
    name = "CodeAgent"

    async def run(self, user_message: str) -> AgentOutput:
        events: list[AgentEvent] = [
            {"agent": self.name, "message": "Searching GitHub repos and PRs", "status": "running"}
        ]

        prs = await search_pull_requests(user_message)

        events.append(
            {
                "agent": self.name,
                "message": "Code context assembled",
                "status": "completed",
            }
        )

        answer = (
            f"I found {len(prs)} pull requests related to your request. "
            "I can generate review notes or draft a response."
        )

        return {
            "answer": answer,
            "events": events,
            "tool_results": {"pull_requests": prs},
        }

