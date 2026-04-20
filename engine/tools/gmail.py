from __future__ import annotations

import base64
import hashlib
import json
from email.message import EmailMessage
from typing import Any

import httpx

from core.config import settings
from db.models import ToolConnection, get_tool_connection, upsert_tool_connection

try:
    from cryptography.fernet import Fernet
except Exception:  # pragma: no cover
    Fernet = None  # type: ignore[assignment]


async def search_gmail_threads(query: str) -> list[dict[str, Any]]:
    if not query.strip():
        return []

    return [
        {
            "id": "gmail-thread-1",
            "subject": "Project sync follow-up",
            "snippet": "Can you share an update before tomorrow?",
            "from": "team@example.com",
        }
    ]


def _normalize_user_id(value: str) -> str:
    raw = value.strip().lower()
    if len(raw) <= 64:
        return raw
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return digest[:64]


def _build_cipher() -> Any | None:
    if Fernet is None:
        return None

    digest = hashlib.sha256(settings.jwt_secret.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    try:
        return Fernet(key)
    except Exception:
        return None


def _encrypt_token_blob(token_payload: dict[str, Any]) -> str:
    token_json = json.dumps(token_payload, ensure_ascii=True)
    cipher = _build_cipher()
    if cipher is None:
        return base64.urlsafe_b64encode(token_json.encode("utf-8")).decode("utf-8")
    return cipher.encrypt(token_json.encode("utf-8")).decode("utf-8")


def _decrypt_token_blob(value: str | None) -> dict[str, Any]:
    if not value:
        return {}

    cipher = _build_cipher()
    if cipher is not None:
        try:
            decoded = cipher.decrypt(value.encode("utf-8")).decode("utf-8")
            payload = json.loads(decoded)
            if isinstance(payload, dict):
                return payload
        except Exception:
            pass

    try:
        decoded = base64.urlsafe_b64decode(value.encode("utf-8")).decode("utf-8")
        payload = json.loads(decoded)
        if isinstance(payload, dict):
            return payload
    except Exception:
        return {}

    return {}


def _load_google_provider_connection(user_id: str) -> ToolConnection | None:
    user_key = _normalize_user_id(user_id)
    if not user_key:
        return None

    try:
        row = get_tool_connection(user_key, "provider:google")
        if row is None or not row.connected:
            return None
        return row
    except Exception:
        return None


def _persist_google_token(user_id: str, token_payload: dict[str, Any]) -> None:
    user_key = _normalize_user_id(user_id)
    if not user_key:
        return

    try:
        existing = get_tool_connection(user_key, "provider:google")
        if existing is None:
            return

        upsert_tool_connection(
            user_id=user_key,
            tool_name="provider:google",
            connected=existing.connected,
            encrypted_token=_encrypt_token_blob(token_payload),
        )
    except Exception:
        return


async def _refresh_google_access_token(refresh_token: str) -> dict[str, Any] | None:
    if not settings.google_client_id or not settings.google_client_secret:
        return None

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )

    if response.status_code >= 400:
        return None

    try:
        payload = response.json()
    except Exception:
        return None

    return payload if isinstance(payload, dict) else None


async def _gmail_send_raw(access_token: str, raw_message: str) -> httpx.Response:
    async with httpx.AsyncClient(timeout=30) as client:
        return await client.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json={"raw": raw_message},
        )


async def send_gmail_message(
    *,
    user_id: str,
    from_email: str,
    to_email: str,
    subject: str,
    body: str,
) -> dict[str, Any]:
    if not user_id.strip():
        return {"ok": False, "error": "No authenticated user available for Gmail send."}

    provider_row = _load_google_provider_connection(user_id)
    if provider_row is None:
        return {
            "ok": False,
            "error": "Gmail is not connected for this user. Connect Gmail in Integrations first.",
        }

    token_payload = _decrypt_token_blob(provider_row.encrypted_token)
    access_token = str(token_payload.get("access_token") or "").strip()
    refresh_token = str(token_payload.get("refresh_token") or "").strip()

    if not access_token and not refresh_token:
        return {
            "ok": False,
            "error": "Missing Google access token. Reconnect Gmail and try again.",
        }

    message = EmailMessage()
    message["To"] = to_email
    message["From"] = from_email
    message["Subject"] = subject
    message.set_content(body)
    raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")

    if not access_token and refresh_token:
        refreshed = await _refresh_google_access_token(refresh_token)
        if refreshed:
            access_token = str(refreshed.get("access_token") or "").strip()
            if access_token:
                token_payload.update(refreshed)
                if not token_payload.get("refresh_token") and refresh_token:
                    token_payload["refresh_token"] = refresh_token
                _persist_google_token(user_id, token_payload)

    if not access_token:
        return {
            "ok": False,
            "error": "Google access token expired and refresh failed. Reconnect Gmail.",
        }

    response = await _gmail_send_raw(access_token, raw_message)

    if response.status_code == 401 and refresh_token:
        refreshed = await _refresh_google_access_token(refresh_token)
        if refreshed and refreshed.get("access_token"):
            access_token = str(refreshed.get("access_token")).strip()
            token_payload.update(refreshed)
            if not token_payload.get("refresh_token"):
                token_payload["refresh_token"] = refresh_token
            _persist_google_token(user_id, token_payload)
            response = await _gmail_send_raw(access_token, raw_message)

    if response.status_code >= 400:
        preview = response.text[:400]
        return {
            "ok": False,
            "error": f"Gmail send failed ({response.status_code}): {preview}",
        }

    payload: dict[str, Any]
    try:
        parsed = response.json()
        payload = parsed if isinstance(parsed, dict) else {}
    except Exception:
        payload = {}

    return {
        "ok": True,
        "provider": "gmail",
        "from": from_email,
        "to": to_email,
        "subject": subject,
        "body": body,
        "message_id": payload.get("id"),
        "thread_id": payload.get("threadId"),
    }
