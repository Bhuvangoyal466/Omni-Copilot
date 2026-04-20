from __future__ import annotations

from typing import Any

import httpx

from tools.gmail import (
    _decrypt_token_blob,
    _load_google_provider_connection,
    _persist_google_token,
    _refresh_google_access_token,
)


async def search_google_forms(query: str) -> list[dict[str, Any]]:
    if not query.strip():
        return []

    return [
        {
            "id": "form-1",
            "title": "Customer Feedback - Q2",
            "responses": 134,
        }
    ]


async def _ensure_google_access_token(user_id: str) -> tuple[str | None, str | None, dict[str, Any]]:
    provider_row = _load_google_provider_connection(user_id)
    if provider_row is None:
        return None, "Google account is not connected. Connect Google integration first.", {}

    token_payload = _decrypt_token_blob(provider_row.encrypted_token)
    access_token = str(token_payload.get("access_token") or "").strip()
    refresh_token = str(token_payload.get("refresh_token") or "").strip()

    if access_token:
        return access_token, None, token_payload

    if not refresh_token:
        return None, "Missing Google access token and refresh token. Reconnect integration.", token_payload

    refreshed = await _refresh_google_access_token(refresh_token)
    if not refreshed or not refreshed.get("access_token"):
        return None, "Google token refresh failed. Reconnect integration.", token_payload

    token_payload.update(refreshed)
    if not token_payload.get("refresh_token"):
        token_payload["refresh_token"] = refresh_token
    _persist_google_token(user_id, token_payload)

    access_token = str(token_payload.get("access_token") or "").strip()
    return access_token or None, None, token_payload


def _build_form_requests(fields: list[str]) -> list[dict[str, Any]]:
    requests: list[dict[str, Any]] = []
    for index, field in enumerate(fields):
        title = field.strip().title()
        if not title:
            continue

        requests.append(
            {
                "createItem": {
                    "location": {"index": index},
                    "item": {
                        "title": title,
                        "questionItem": {
                            "question": {
                                "required": True,
                                "textQuestion": {"paragraph": False},
                            }
                        },
                    },
                }
            }
        )

    return requests


async def create_sample_google_form(
    *,
    user_id: str,
    title: str,
    fields: list[str],
) -> dict[str, Any]:
    normalized_user = user_id.strip()

    cleaned_fields = [field.strip() for field in fields if field.strip()]
    if not cleaned_fields:
        cleaned_fields = ["Name", "Email", "Phone Number"]

    if not normalized_user:
        return {
            "ok": False,
            "error": "No authenticated Google user context found.",
        }

    access_token, token_error, token_payload = await _ensure_google_access_token(normalized_user)
    if token_error:
        return {"ok": False, "error": token_error}

    if not access_token:
        return {"ok": False, "error": "Google access token unavailable."}

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=40) as client:
        create_response = await client.post(
            "https://forms.googleapis.com/v1/forms",
            headers=headers,
            json={"info": {"title": title}},
        )

        if create_response.status_code == 401:
            refresh_token = str(token_payload.get("refresh_token") or "").strip()
            if refresh_token:
                refreshed = await _refresh_google_access_token(refresh_token)
                if refreshed and refreshed.get("access_token"):
                    token_payload.update(refreshed)
                    if not token_payload.get("refresh_token"):
                        token_payload["refresh_token"] = refresh_token
                    _persist_google_token(normalized_user, token_payload)
                    headers["Authorization"] = f"Bearer {token_payload.get('access_token')}"
                    create_response = await client.post(
                        "https://forms.googleapis.com/v1/forms",
                        headers=headers,
                        json={"info": {"title": title}},
                    )

        if create_response.status_code >= 400:
            error_preview = create_response.text[:350]
            return {
                "ok": False,
                "error": f"Google Form create failed ({create_response.status_code}): {error_preview}.",
            }

        try:
            form_payload = create_response.json()
        except Exception:
            return {"ok": False, "error": "Google Form create response was not JSON."}

        form_id = str(form_payload.get("formId") or "").strip()
        if not form_id:
            return {"ok": False, "error": "Google Form ID missing in response."}

        update_requests = _build_form_requests(cleaned_fields)
        if update_requests:
            update_response = await client.post(
                f"https://forms.googleapis.com/v1/forms/{form_id}:batchUpdate",
                headers=headers,
                json={"requests": update_requests},
            )
            if update_response.status_code >= 400:
                error_preview = update_response.text[:350]
                return {
                    "ok": False,
                    "error": (
                        f"Google Form fields update failed ({update_response.status_code}): {error_preview}."
                    ),
                }

    responder_uri = str(form_payload.get("responderUri") or "").strip()
    view_url = responder_uri or f"https://docs.google.com/forms/d/{form_id}/viewform"
    edit_url = f"https://docs.google.com/forms/d/{form_id}/edit"

    return {
        "ok": True,
        "form_id": form_id,
        "title": title,
        "fields": cleaned_fields,
        "view_url": view_url,
        "edit_url": edit_url,
    }
