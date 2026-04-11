from __future__ import annotations

from agents.types import AgentEvent, AgentOutput
from tools.browser import run_browser_task


class BrowserAgent:
    name = "BrowserAgent"

    async def run(self, user_message: str) -> AgentOutput:
        events: list[AgentEvent] = [
            {"agent": self.name, "message": "Preparing browser automation", "status": "running"}
        ]

        result = await run_browser_task(user_message)
        failed = result.lower().startswith("browser task failed") or "could not open" in result.lower()

        events.append(
            {
                "agent": self.name,
                "message": "Browser task completed" if not failed else "Browser task failed",
                "status": "failed" if failed else "completed",
            }
        )

        return {
            "answer": result,
            "events": events,
            "tool_results": {"browser": result},
        }

