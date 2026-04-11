from __future__ import annotations

import asyncio
import os
import re
import time
from pathlib import Path
from typing import Any

import httpx

from tools.gmail import (
    _decrypt_token_blob,
    _load_google_provider_connection,
    _persist_google_token,
    _refresh_google_access_token,
)

try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import sync_playwright
except Exception:  # pragma: no cover
    PlaywrightTimeoutError = Exception  # type: ignore[assignment]
    sync_playwright = None  # type: ignore[assignment]


FORMS_NEW_URL = "https://forms.new"


def _is_browser_fallback_enabled() -> bool:
    raw = os.getenv("OMNI_GFORMS_ENABLE_BROWSER_FALLBACK", "true").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def _first_visible_locator(page: Any, selectors: list[str], timeout_ms: int = 4000) -> Any | None:
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            locator.wait_for(state="visible", timeout=timeout_ms)
            return locator
        except PlaywrightTimeoutError:
            continue
        except Exception:
            continue
    return None


def _set_question_title(page: Any, *, question_index: int, title: str) -> bool:
    selectors = [
        "div[role='textbox'][aria-label='Question title']",
        "div[role='textbox'][aria-label='Question']",
        "div[role='textbox'][aria-label='Untitled question']",
        "textarea[aria-label='Question']",
    ]

    for selector in selectors:
        try:
            locators = page.locator(selector)
            count = locators.count()
            if count <= 0:
                continue

            target_index = question_index if question_index < count else count - 1
            target = locators.nth(target_index)
            target.click(timeout=5000)
            page.keyboard.press("Control+A")
            page.keyboard.type(title, delay=26)
            return True
        except Exception:
            continue

    # Fallback for UI variants where "Untitled question" is plain text element.
    try:
        text_target = page.get_by_text("Untitled question").nth(question_index)
        text_target.click(timeout=5000)
        page.keyboard.press("Control+A")
        page.keyboard.type(title, delay=26)
        return True
    except Exception:
        return False


def _set_question_required(page: Any, *, question_index: int) -> bool:
    selectors = [
        "div[role='switch'][aria-label='Required']",
        "button[aria-label='Required']",
    ]

    for selector in selectors:
        try:
            switches = page.locator(selector)
            count = switches.count()
            if count <= 0:
                continue

            target_index = question_index if question_index < count else count - 1
            target = switches.nth(target_index)
            checked = str(target.get_attribute("aria-checked") or "").strip().lower()
            pressed = str(target.get_attribute("aria-pressed") or "").strip().lower()

            if checked != "true" and pressed != "true":
                target.click(timeout=4000)
            return True
        except Exception:
            continue

    return False


def _create_google_form_via_browser_sync(*, title: str, fields: list[str]) -> dict[str, Any]:
    actions: list[str] = []
    profile_dir = Path(
        os.getenv("OMNI_GFORMS_PROFILE_DIR", str(Path.home() / ".omni-gforms-profile"))
    )
    profile_dir.mkdir(parents=True, exist_ok=True)

    playwright = None
    context = None

    try:
        if sync_playwright is None:
            return {
                "ok": False,
                "error": (
                    "Playwright is not installed. Run: pip install playwright and playwright install chromium."
                ),
                "actions": actions,
            }

        playwright = sync_playwright().start()
        context = playwright.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=False,
            viewport={"width": 1440, "height": 900},
            args=["--start-maximized"],
        )

        page = context.pages[0] if context.pages else context.new_page()
        actions.append("Opened Chromium automation window")

        page.goto(FORMS_NEW_URL, wait_until="domcontentloaded")
        actions.append("Opened forms.new")

        editor_ready = False
        login_required = False
        deadline = time.monotonic() + 130

        while time.monotonic() < deadline:
            current_url = page.url.lower()
            if "accounts.google.com" in current_url:
                login_required = True

            if "docs.google.com/forms" in current_url and "viewform" not in current_url:
                editor_ready = True
                break

            page.wait_for_timeout(900)

        if not editor_ready:
            if login_required:
                return {
                    "ok": False,
                    "error": "Google login is required in the opened browser window. Sign in and retry.",
                    "actions": actions,
                }
            return {
                "ok": False,
                "error": "Google Forms editor did not open in time.",
                "actions": actions,
            }

        title_box = _first_visible_locator(
            page,
            selectors=[
                "input[aria-label='Untitled form']",
                "textarea[aria-label='Untitled form']",
                "div[role='textbox'][aria-label='Untitled form']",
            ],
            timeout_ms=7000,
        )
        if title_box is not None:
            try:
                title_box.click(timeout=5000)
                page.keyboard.press("Control+A")
                page.keyboard.type(title, delay=24)
                actions.append(f"Set form title: {title}")
            except Exception:
                pass

        add_question_button_selectors = [
            "div[aria-label='Add question']",
            "button[aria-label='Add question']",
            "[data-tooltip='Add question']",
        ]

        for index, field in enumerate(fields):
            if index > 0:
                add_btn = _first_visible_locator(page, add_question_button_selectors, timeout_ms=5000)
                if add_btn is None:
                    return {
                        "ok": False,
                        "error": f"Could not find the Add question button while adding: {field}",
                        "actions": actions,
                    }
                add_btn.click(timeout=4000)
                page.wait_for_timeout(420)

            title_ok = _set_question_title(page, question_index=index, title=field)
            if not title_ok:
                return {
                    "ok": False,
                    "error": f"Could not set question title for field: {field}",
                    "actions": actions,
                }

            _set_question_required(page, question_index=index)
            actions.append(f"Added required field: {field}")

        confirmation_ms = int(os.getenv("OMNI_GFORMS_CONFIRMATION_MS", "3500"))
        page.wait_for_timeout(max(700, confirmation_ms))

        edit_url = page.url.split("?")[0]
        view_url = edit_url.replace("/edit", "/viewform") if "/edit" in edit_url else edit_url
        form_match = re.search(r"/forms/d/(?:e/)?([^/]+)/", edit_url)
        form_id = form_match.group(1) if form_match else ""

        return {
            "ok": True,
            "form_id": form_id,
            "title": title,
            "fields": fields,
            "view_url": view_url,
            "edit_url": edit_url,
            "channel": "google-forms-browser",
            "actions": actions,
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": f"Google Form browser fallback failed: {exc}",
            "actions": actions,
        }
    finally:
        if context is not None:
            try:
                context.close()
            except Exception:
                pass
        if playwright is not None:
            try:
                playwright.stop()
            except Exception:
                pass


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

    async def _run_browser_fallback(reason: str) -> dict[str, Any]:
        if not _is_browser_fallback_enabled():
            return {"ok": False, "error": reason}

        fallback_result = await asyncio.to_thread(
            _create_google_form_via_browser_sync,
            title=title,
            fields=cleaned_fields,
        )
        if fallback_result.get("ok"):
            fallback_result["warning"] = reason
            return fallback_result

        fallback_error = str(fallback_result.get("error") or "Unknown browser fallback error")
        return {
            "ok": False,
            "error": f"{reason} Browser fallback also failed: {fallback_error}",
            "fallback": fallback_result,
        }

    if not normalized_user:
        return await _run_browser_fallback("No authenticated Google user context found.")

    access_token, token_error, token_payload = await _ensure_google_access_token(normalized_user)
    if token_error:
        return await _run_browser_fallback(token_error)

    if not access_token:
        return await _run_browser_fallback("Google access token unavailable.")

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
            return await _run_browser_fallback(
                f"Google Form create failed ({create_response.status_code}): {error_preview}."
            )

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
                return await _run_browser_fallback(
                    f"Google Form fields update failed ({update_response.status_code}): {error_preview}."
                )

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
