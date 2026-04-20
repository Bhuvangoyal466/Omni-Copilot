from __future__ import annotations

import re

from agents.types import AgentEvent, AgentOutput
from core.llm import generate_assistant_reply


class ChatAgent:
    name = "ChatAgent"

    @staticmethod
    def _fallback_reply(user_message: str) -> str:
        normalized = re.sub(r"\s+", " ", user_message.lower()).strip()
        bare = re.sub(r"[^a-z\s]", "", normalized)

        if bare in {"hi", "hello", "hey", "hii", "yo", "namaste"}:
            return "Hi! I am Horizon. How can I help?"

        if bare in {
            "english",
            "english pls",
            "english please",
            "in english",
            "speak english",
            "reply in english",
        }:
            return "Sure, I will reply in English. What should I do next?"

        if bare in {
            "hindi",
            "hindi pls",
            "hindi please",
            "in hindi",
            "speak hindi",
            "reply in hindi",
        }:
            return "Bilkul, main Hindi mein reply karunga. Aap kya karwana chahte ho?"

        return (
            "I understood your request: "
            f'"{user_message.strip()}". '
            "Tell me the exact outcome you want, and I will execute it step by step."
        )

    async def run(
        self, user_message: str, *, preferred_model: str | None = None
    ) -> AgentOutput:
        events: list[AgentEvent] = [
            {"agent": self.name, "message": "Thinking", "status": "running"}
        ]

        system_prompt = (
            "You are Horizon, a modular AI workspace assistant. "
            "Reply naturally like a helpful chatbot. "
            "If the user asks to change language, follow it immediately. "
            "Be concise and clear, and ask one follow-up question only when useful."
        )

        answer = await generate_assistant_reply(
            user_message,
            system_prompt=system_prompt,
            context={
                "mode": "general_chat",
                "tools": ["docs", "comms", "calendar", "code", "browser", "memory"],
            },
            max_tokens=260,
            preferred_model=preferred_model,
        )

        if not answer:
            answer = self._fallback_reply(user_message)

        events.append(
            {
                "agent": self.name,
                "message": "Response prepared",
                "status": "completed",
            }
        )

        return {
            "answer": answer,
            "events": events,
            "tool_results": {},
        }
