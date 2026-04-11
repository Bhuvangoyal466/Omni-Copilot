from __future__ import annotations

from agents.types import AgentEvent, AgentOutput
from tools.gcal import list_upcoming_events
from tools.gmeet import list_meet_sessions


class CalendarAgent:
    name = "CalendarAgent"

    async def run(self, user_message: str) -> AgentOutput:
        events: list[AgentEvent] = [
            {"agent": self.name, "message": "Pulling calendar events", "status": "running"}
        ]

        meetings = await list_upcoming_events(query=user_message)
        meet_sessions = await list_meet_sessions(query=user_message)

        events.append(
            {
                "agent": self.name,
                "message": "Calendar summary ready",
                "status": "completed",
            }
        )

        if meetings:
            answer = (
                f"You have {len(meetings)} relevant calendar events and {len(meet_sessions)} Google Meet sessions. "
                "I can draft prep notes for each."
            )
        else:
            answer = "No matching meetings found. I can still create a schedule template for today."

        return {
            "answer": answer,
            "events": events,
            "tool_results": {"events": meetings, "meet": meet_sessions},
        }

