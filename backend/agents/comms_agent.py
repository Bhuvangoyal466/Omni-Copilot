from __future__ import annotations

import re

from agents.types import AgentEvent, AgentOutput
from tools.discord import search_discord_messages
from tools.gforms import create_sample_google_form
from tools.gmail import search_gmail_threads, send_gmail_message
from tools.gsheets import create_google_sheet_from_web_research
from tools.slack import search_slack_messages
from tools.whatsapp import send_whatsapp_message


EMAIL_REGEX = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def _is_send_email_request(message: str) -> bool:
    normalized = _normalize(message)
    has_send_word = any(word in normalized for word in ["send", "bhejo", "mail karo", "email bhejo"])
    has_mail_word = any(word in normalized for word in ["mail", "email", "gmail"])
    return has_send_word and has_mail_word


def _extract_sender_and_recipient(message: str, user_id: str | None) -> tuple[str | None, str | None]:
    emails = EMAIL_REGEX.findall(message)

    from_match = re.search(
        r"(?:from|ki\s+trf\s+se|ki\s+taraf\s+se)\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})",
        message,
        flags=re.IGNORECASE,
    )
    to_match = re.search(
        r"(?:to|ko)\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})",
        message,
        flags=re.IGNORECASE,
    )

    sender = from_match.group(1) if from_match else None
    recipient = to_match.group(1) if to_match else None

    if sender is None and len(emails) >= 2:
        sender = emails[0]
    if recipient is None and len(emails) >= 2:
        recipient = emails[1]
    if recipient is None and len(emails) == 1:
        recipient = emails[0]
    if sender is None:
        sender = user_id

    return sender, recipient


def _build_email_content(message: str, sender: str) -> tuple[str, str]:
    normalized = _normalize(message)
    if "joke" in normalized or "funny" in normalized:
        subject = "A Funny Joke for You"
        body = (
            "Hi,\n\n"
            "Aaj ka joke: Why did the scarecrow win an award? "
            "Because he was outstanding in his field.\n\n"
            "Hope this made you smile.\n\n"
            f"Best,\n{sender}"
        )
        return subject, body

    topic_match = re.search(r"(?:about|related\s+to|regarding)\s+(.+)$", message, flags=re.IGNORECASE)
    topic = topic_match.group(1).strip() if topic_match else "your requested topic"
    subject = f"Quick note about {topic}"
    body = f"Hi,\n\nSharing a quick update about {topic}.\n\nBest,\n{sender}"
    return subject, body


def _is_whatsapp_send_request(message: str) -> bool:
    normalized = _normalize(message)
    has_whatsapp = "whatsapp" in normalized or "whats app" in normalized
    has_message_intent = any(
        token in normalized
        for token in ["message", "msg", "bhej", "likho", "send", "text"]
    )
    return has_whatsapp and has_message_intent


def _extract_whatsapp_payload(message: str) -> tuple[str | None, str | None]:
    quoted = re.search(r'"([^"]+)"', message)
    if quoted is None:
        quoted = re.search(r"'([^']+)'", message)
    message_text = quoted.group(1).strip() if quoted else None

    if not message_text:
        message_patterns = [
            r"\bsaying\s*(?::|-)?\s*(.+)$",
            r"\bko\s+(?:message|msg|text)\s*(?:bhej(?:o|do)?|send|likho|write|type)?\s*(?::|-)?\s*(.+)$",
            r"\b(?:message|msg|text)\s*(?:likho|write|type|send|bhej(?:o|do)?)\s*(?::|-)?\s*(.+)$",
            r"\b(?:send|bhej(?:o|do)?)\s+(.+?)\s+\b(?:to|ko)\b",
        ]
        for pattern in message_patterns:
            found = re.search(pattern, message, flags=re.IGNORECASE)
            if not found:
                continue

            candidate = re.sub(r"\s+", " ", found.group(1)).strip(" .")
            candidate = re.sub(r"\s+on\s+whatsapp$", "", candidate, flags=re.IGNORECASE).strip()
            if candidate:
                message_text = candidate
                break

    contact_patterns = [
        r"(?:whatsapp\s+open\s+krke\s+)(.+?)(?:\s+naam\s+ka\s+contact|\s+contact)",
        r"(?:contact\s+(?:named\s+|name\s+)?)(.+?)(?:\s+ko|\s+use|\s+message|$)",
        r"(?:whatsapp\s+(?:par|pe)\s+)(.+?)(?:\s+ko|\s+message|\s+msg|\s+text|$)",
        r"(?:to\s+)(.+?)(?:\s+on\s+whatsapp|\s+ko\s+message|\s+saying|\s+ko|\s+message|\s+msg|\s+text|$)",
        r"(.+?)\s+ko\s+(?:message|msg|text|bhej|send|likho)",
    ]

    contact_name = None
    for pattern in contact_patterns:
        found = re.search(pattern, message, flags=re.IGNORECASE)
        if found:
            contact_name = found.group(1).strip()
            break

    if contact_name:
        contact_name = re.sub(r"\s+", " ", contact_name).strip()
        contact_name = re.sub(r"^whatsapp\s+(?:par|pe)\s+", "", contact_name, flags=re.IGNORECASE)
        contact_name = re.sub(
            r"\b(on\s+whatsapp|whatsapp|message|msg|text|ko|to|par|pe|send|bhej|likho|saying)\b.*$",
            "",
            contact_name,
            flags=re.IGNORECASE,
        ).strip(" ,.-")

    if message_text:
        message_text = re.sub(r"^(?:to\s+\w+\s+)?", "", message_text, flags=re.IGNORECASE).strip()
        message_text = re.sub(r"^(?:message\s+|msg\s+|text\s+)", "", message_text, flags=re.IGNORECASE).strip()
        message_text = re.sub(r"^(?:bhej(?:o|do)?\s+|send\s+|likho\s+)", "", message_text, flags=re.IGNORECASE).strip()

    return contact_name, message_text


def _is_google_form_create_request(message: str) -> bool:
    normalized = _normalize(message)
    form_words = ["google form", "google forms", "form", "forms"]
    create_words = ["create", "make", "build", "bna", "banado", "generate"]
    return any(word in normalized for word in form_words) and any(word in normalized for word in create_words)


def _is_google_sheet_create_request(message: str) -> bool:
    normalized = _normalize(message)
    sheet_words = ["google sheet", "google sheets", "spreadsheet", "spread sheet", "sheet", "sheets"]
    create_words = ["create", "make", "build", "prepare", "generate", "bna", "banado", "bnado"]
    share_words = ["share", "shared", "link", "online"]
    data_words = ["data", "research", "web", "internet", "net"]

    has_sheet = any(word in normalized for word in sheet_words)
    has_create = any(word in normalized for word in create_words)
    has_share = any(word in normalized for word in share_words)
    has_data = any(word in normalized for word in data_words)

    return has_sheet and (has_create or (has_share and has_data))


def _extract_form_fields(message: str) -> list[str]:
    normalized = _normalize(message)
    fields: list[str] = []

    match = re.search(r"fields?\s+(.+)$", normalized)
    if match:
        raw = match.group(1)
        chunks = re.split(r",| and | aur |\|", raw)
        for chunk in chunks:
            token = chunk.strip(" .")
            if token:
                fields.append(token.title())

    if not fields:
        if "name" in normalized:
            fields.append("Name")
        if "email" in normalized:
            fields.append("Email")
        if "phone" in normalized or "mobile" in normalized or "number" in normalized:
            fields.append("Phone Number")

    deduped: list[str] = []
    for field in fields:
        if field not in deduped:
            deduped.append(field)

    return deduped or ["Name", "Email", "Phone Number"]


class CommsAgent:
    name = "CommsAgent"

    async def run(self, user_message: str, *, user_id: str | None = None) -> AgentOutput:
        if _is_google_sheet_create_request(user_message):
            events: list[AgentEvent] = [
                {"agent": self.name, "message": "Collecting web sources for Google Sheet", "status": "running"}
            ]

            if not (user_id or "").strip():
                events.append(
                    {
                        "agent": self.name,
                        "message": "Missing authenticated user for Google API access",
                        "status": "failed",
                    }
                )
                return {
                    "answer": "Google Sheets creation requires a signed-in user. Please log in and connect Google first.",
                    "events": events,
                    "tool_results": {},
                }

            result = await create_google_sheet_from_web_research(
                user_id=(user_id or "").strip(),
                user_prompt=user_message,
            )

            if not result.get("ok"):
                events.append(
                    {
                        "agent": self.name,
                        "message": "Google Sheet creation failed",
                        "status": "failed",
                    }
                )
                return {
                    "answer": f"Google Sheet create failed: {result.get('error', 'Unknown error')}",
                    "events": events,
                    "tool_results": {"google_sheet": result},
                }

            events.append(
                {
                    "agent": self.name,
                    "message": "Google Sheet created with launch data",
                    "status": "completed",
                }
            )

            answer = (
                "Google Sheet created successfully from live web sources.\n"
                f"Topic: {result.get('topic')}\n"
                f"Records: {result.get('records_written')}\n"
                f"Sources: {result.get('sources_collected')}\n"
                f"Sheet link: {result.get('sheet_url')}"
            )

            warnings = result.get("warnings")
            if isinstance(warnings, list) and warnings:
                answer += "\nNote: " + "; ".join(str(item) for item in warnings)

            return {
                "answer": answer,
                "events": events,
                "tool_results": {"google_sheet": result},
            }

        if _is_whatsapp_send_request(user_message):
            events: list[AgentEvent] = [
                {"agent": self.name, "message": "Starting WhatsApp live automation", "status": "running"}
            ]

            contact_name, message_text = _extract_whatsapp_payload(user_message)
            if not contact_name or not message_text:
                events.append(
                    {
                        "agent": self.name,
                        "message": "Could not parse contact/message for WhatsApp",
                        "status": "failed",
                    }
                )
                return {
                    "answer": (
                        "I could not parse WhatsApp contact name or quoted message text. "
                        "Try: whatsapp open karke Nikhil CSE AI naam ka contact use message likho \"hello nikhil beta\""
                    ),
                    "events": events,
                    "tool_results": {},
                }

            result = await send_whatsapp_message(contact_name=contact_name, message_text=message_text)
            if not result.get("ok"):
                events.append(
                    {
                        "agent": self.name,
                        "message": "WhatsApp automation failed",
                        "status": "failed",
                    }
                )
                action_log = result.get("actions") or []
                answer = (
                    f"WhatsApp action failed: {result.get('error', 'Unknown error')}\n"
                    f"Tried steps: {', '.join(action_log) if action_log else 'none'}"
                )
                return {
                    "answer": answer,
                    "events": events,
                    "tool_results": {"whatsapp": result},
                }

            events.append(
                {
                    "agent": self.name,
                    "message": "WhatsApp message sent",
                    "status": "completed",
                }
            )
            actions = result.get("actions") or []
            answer = (
                "WhatsApp live automation completed.\n"
                f"Contact: {result.get('contact')}\n"
                f"Message: {result.get('message')}\n"
                f"Executed steps: {', '.join(actions) if actions else 'steps captured'}"
            )
            return {
                "answer": answer,
                "events": events,
                "tool_results": {"whatsapp": result},
            }

        if _is_google_form_create_request(user_message):
            events: list[AgentEvent] = [
                {"agent": self.name, "message": "Preparing Google Form structure", "status": "running"}
            ]

            fields = _extract_form_fields(user_message)
            title = "Sample Contact Collection Form"
            result = await create_sample_google_form(
                user_id=(user_id or "").strip(),
                title=title,
                fields=fields,
            )

            if not result.get("ok"):
                events.append(
                    {
                        "agent": self.name,
                        "message": "Google Form creation failed",
                        "status": "failed",
                    }
                )

                error_text = str(result.get("error", "Unknown error"))
                docs_link_match = re.search(r"https?://\S+", error_text)
                docs_link = docs_link_match.group(0).rstrip(")") if docs_link_match else None
                if docs_link:
                    error_text += f"\nEnable it here: {docs_link}"

                return {
                    "answer": f"Google Form create failed: {error_text}",
                    "events": events,
                    "tool_results": {"google_form": result},
                }

            events.append(
                {
                    "agent": self.name,
                    "message": "Google Form created successfully",
                    "status": "completed",
                }
            )

            answer = (
                "Google Form created successfully.\n"
                f"Title: {result.get('title')}\n"
                f"Fields: {', '.join(result.get('fields', []))}\n"
                f"Edit URL: {result.get('edit_url')}\n"
                f"Public URL: {result.get('view_url')}"
            )

            warning = str(result.get("warning") or "").strip()
            if warning:
                answer += f"\nNote: {warning}"

            actions = result.get("actions")
            if isinstance(actions, list) and actions:
                answer += "\nExecuted steps: " + ", ".join(str(item) for item in actions)

            return {
                "answer": answer,
                "events": events,
                "tool_results": {"google_form": result},
            }

        if _is_send_email_request(user_message):
            events: list[AgentEvent] = [
                {"agent": self.name, "message": "Preparing Gmail send request", "status": "running"}
            ]

            sender, recipient = _extract_sender_and_recipient(user_message, user_id)
            if not sender or not recipient:
                events.append(
                    {
                        "agent": self.name,
                        "message": "Email extraction failed",
                        "status": "failed",
                    }
                )
                return {
                    "answer": "I could not detect sender/recipient emails. Please provide both addresses clearly.",
                    "events": events,
                    "tool_results": {},
                }

            subject, body = _build_email_content(user_message, sender)
            send_result = await send_gmail_message(
                user_id=user_id or sender,
                from_email=sender,
                to_email=recipient,
                subject=subject,
                body=body,
            )

            if not send_result.get("ok"):
                events.append(
                    {
                        "agent": self.name,
                        "message": "Gmail send failed",
                        "status": "failed",
                    }
                )
                return {
                    "answer": f"Email send failed: {send_result.get('error', 'Unknown error')}",
                    "events": events,
                    "tool_results": {"gmail_send": send_result},
                }

            events.append(
                {
                    "agent": self.name,
                    "message": "Gmail message sent",
                    "status": "completed",
                }
            )

            answer = (
                "Email sent successfully.\n"
                f"From: {send_result.get('from')}\n"
                f"To: {send_result.get('to')}\n"
                f"Subject: {send_result.get('subject')}\n"
                "Body:\n"
                f"{send_result.get('body')}"
            )

            if send_result.get("message_id"):
                answer += f"\nMessage ID: {send_result.get('message_id')}"

            return {
                "answer": answer,
                "events": events,
                "tool_results": {"gmail_send": send_result},
            }

        events: list[AgentEvent] = [
            {"agent": self.name, "message": "Checking Gmail and Slack", "status": "running"}
        ]

        gmail_hits = await search_gmail_threads(user_message)
        slack_hits = await search_slack_messages(user_message)
        discord_hits = await search_discord_messages(user_message)

        events.append(
            {
                "agent": self.name,
                "message": "Built communication digest",
                "status": "completed",
            }
        )

        answer = (
            f"I scanned communications and found {len(gmail_hits)} relevant Gmail threads "
            f"{len(slack_hits)} Slack messages, and {len(discord_hits)} Discord messages."
        )

        return {
            "answer": answer,
            "events": events,
            "tool_results": {"gmail": gmail_hits, "slack": slack_hits, "discord": discord_hits},
        }
