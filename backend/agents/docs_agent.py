from __future__ import annotations

import re
from pathlib import Path

from agents.types import AgentEvent, AgentOutput
from core.llm import generate_assistant_reply
from tools.gdrive import search_drive_files
from tools.gforms import search_google_forms
from tools.local_files import (
    create_local_folder_from_prompt,
    find_best_local_file,
    open_local_application_from_prompt,
    open_local_file,
    search_local_files,
)


class DocsAgent:
    name = "DocsAgent"

    @staticmethod
    def _is_create_folder_request(message: str) -> bool:
        normalized = re.sub(r"\s+", " ", message.lower()).strip()
        intent_words = ["create", "make", "bna", "banado", "bnado", "folder", "directory"]
        location_words = ["drive", "disk", "pc", "laptop", "local"]
        return ("folder" in normalized or "directory" in normalized) and (
            any(word in normalized for word in intent_words)
            and any(word in normalized for word in location_words)
        )

    @staticmethod
    def _is_local_open_request(message: str) -> bool:
        normalized = re.sub(r"\s+", " ", message.lower()).strip()
        action_words = ["open", "oepn", "opne", "play", "launch", "start"]
        local_words = ["pc", "laptop", "local", "computer", "movie", "video", "from my", "drive", "disk", "vlc"]
        has_action_and_local = any(word in normalized for word in action_words) and any(
            word in normalized for word in local_words
        )

        has_media_hint = bool(
            re.search(r"\b(mp4|mkv|avi|mov|webm|wmv|flv|m4v)\b", normalized)
        ) and any(phrase in normalized for phrase in ["file name", "filename", "this is", "named"])

        return has_action_and_local or has_media_hint

    @staticmethod
    def _is_local_app_open_request(message: str) -> bool:
        normalized = re.sub(r"\s+", " ", message.lower()).strip()
        action_words = ["open", "launch", "start"]
        app_words = [
            "app",
            "software",
            "whatsapp",
            "chrome",
            "notepad",
            "calculator",
            "calc",
            "vlc",
            "discord",
            "spotify",
            "telegram",
        ]
        return any(word in normalized for word in action_words) and any(word in normalized for word in app_words)

    async def run(self, user_message: str, *, preferred_model: str | None = None) -> AgentOutput:
        if self._is_create_folder_request(user_message):
            events: list[AgentEvent] = [
                {
                    "agent": self.name,
                    "message": "Creating local folder",
                    "status": "running",
                }
            ]

            created, status_message, folder_path = await create_local_folder_from_prompt(user_message)
            events.append(
                {
                    "agent": self.name,
                    "message": "Folder operation completed" if created else "Folder operation failed",
                    "status": "completed" if created else "failed",
                }
            )

            return {
                "answer": status_message,
                "events": events,
                "tool_results": {"folder_path": folder_path},
            }

        if self._is_local_app_open_request(user_message):
            events: list[AgentEvent] = [
                {
                    "agent": self.name,
                    "message": "Launching local application",
                    "status": "running",
                }
            ]

            opened, status_message, app_name = await open_local_application_from_prompt(user_message)
            events.append(
                {
                    "agent": self.name,
                    "message": "Application launch completed" if opened else "Application launch failed",
                    "status": "completed" if opened else "failed",
                }
            )

            return {
                "answer": status_message,
                "events": events,
                "tool_results": {"app_name": app_name, "status": status_message},
            }

        if self._is_local_open_request(user_message):
            normalized = re.sub(r"\s+", " ", user_message.lower()).strip()
            use_vlc = "vlc" in normalized

            events: list[AgentEvent] = [
                {
                    "agent": self.name,
                    "message": "Finding matching local file",
                    "status": "running",
                }
            ]

            best_file = await find_best_local_file(user_message, prefer_media=True)
            if not best_file:
                events.append(
                    {
                        "agent": self.name,
                        "message": "No matching local media file found",
                        "status": "failed",
                    }
                )
                return {
                    "answer": (
                        "I could not find a matching movie/video file on your PC. "
                        "Try using the exact filename, for example: open Dhoom2.mp4 from my PC."
                    ),
                    "events": events,
                    "tool_results": {"opened_file": None},
                }

            opened, status_message = await open_local_file(best_file, use_vlc=use_vlc)
            events.append(
                {
                    "agent": self.name,
                    "message": "Opened local file" if opened else "Failed to open local file",
                    "status": "completed" if opened else "failed",
                }
            )

            if opened:
                file_name = Path(best_file).name
                if use_vlc:
                    answer = f"Done. I opened {file_name} in VLC from your PC."
                else:
                    answer = f"Done. I opened {file_name} from your PC."
            else:
                answer = status_message

            return {
                "answer": answer,
                "events": events,
                "tool_results": {"opened_file": best_file, "status": status_message},
            }

        events: list[AgentEvent] = [
            {
                "agent": self.name,
                "message": "Searching Google Drive and local docs",
                "status": "running",
            }
        ]

        drive_hits = await search_drive_files(user_message)
        form_hits = await search_google_forms(user_message)
        local_hits = await search_local_files(user_message)

        events.append(
            {
                "agent": self.name,
                "message": "Prepared document summary",
                "status": "completed",
            }
        )

        llm_answer = await generate_assistant_reply(
            user_message,
            system_prompt=(
                "You are Omni handling document and knowledge requests. "
                "Use only provided tool results and do not invent file names. "
                "Give a concise conversational summary and one useful next action."
            ),
            context={
                "drive_count": len(drive_hits),
                "forms_count": len(form_hits),
                "local_count": len(local_hits),
                "drive_items": drive_hits[:5],
                "forms": form_hits[:5],
                "local_items": local_hits[:5],
            },
            max_tokens=260,
            preferred_model=preferred_model,
        )

        if llm_answer:
            answer = llm_answer
        else:
            drive_names = [item.get("name", "Untitled") for item in drive_hits[:2]]
            form_names = [item.get("title", "Untitled Form") for item in form_hits[:2]]
            local_names = [item.get("path", "local file") for item in local_hits[:2]]

            if not drive_hits and not form_hits and not local_hits:
                answer = (
                    f"I searched for \"{user_message.strip()}\" but found no strong document matches yet. "
                    "You can connect Drive or upload a file, and I will summarize it."
                )
            else:
                answer = (
                    f"I checked your request \"{user_message.strip()}\" and found "
                    f"{len(drive_hits)} Drive item(s), {len(form_hits)} Google Form(s), and {len(local_hits)} local file(s). "
                    f"Top matches: Drive={drive_names}, Forms={form_names}, Local={local_names}. "
                    "If you want, I can draft a concise brief from these."
                )

        return {
            "answer": answer,
            "events": events,
            "tool_results": {
                "drive": drive_hits,
                "forms": form_hits,
                "local_files": local_hits,
            },
        }

