from __future__ import annotations

import asyncio
import os
import re
import shutil
import time
import traceback
from pathlib import Path
from typing import Any

try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import sync_playwright
except Exception:  # pragma: no cover
    PlaywrightTimeoutError = Exception  # type: ignore[assignment]
    sync_playwright = None  # type: ignore[assignment]


WHATSAPP_WEB_URL = "https://web.whatsapp.com"


def _is_truthy_env(key: str, default: str = "false") -> bool:
    raw = os.getenv(key, default).strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _normalize_contact_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip().lower()


def _contact_tokens(value: str) -> list[str]:
    return [token for token in re.split(r"[^a-z0-9]+", _normalize_contact_text(value)) if len(token) >= 2]


def _matches_contact(active_title: str, expected_contact: str) -> bool:
    active = _normalize_contact_text(active_title)
    expected = _normalize_contact_text(expected_contact)
    if not active or not expected:
        return False

    if expected in active or active in expected:
        return True

    expected_tokens = [token for token in _contact_tokens(expected_contact) if len(token) >= 3]
    if not expected_tokens:
        return False

    matched = sum(1 for token in expected_tokens if token in active)
    return matched >= max(1, min(2, len(expected_tokens)))


def _find_visible_locator(page: Any, selectors: list[str], timeout_ms: int = 6000) -> Any | None:
    deadline = time.monotonic() + (timeout_ms / 1000)
    while time.monotonic() < deadline:
        for selector in selectors:
            locator = page.locator(selector).first
            try:
                if locator.count() > 0 and locator.is_visible():
                    return locator
            except Exception:
                continue
        page.wait_for_timeout(220)
    return None


def _find_search_box(page: Any) -> Any | None:
    search_box = _find_visible_locator(
        page,
        selectors=[
            "div[role='textbox'][title='Search input textbox']",
            "div[contenteditable='true'][data-tab='3']",
            "div[contenteditable='true'][aria-label='Search input textbox']",
            "div[role='textbox'][aria-label*='Search']",
            "div[contenteditable='true'][aria-label*='Search']",
        ],
        timeout_ms=7000,
    )
    if search_box is not None:
        return search_box

    open_search = _find_visible_locator(
        page,
        selectors=[
            "button[aria-label='Search or start new chat']",
            "span[data-icon='search']",
            "button[title='Search input textbox']",
        ],
        timeout_ms=2500,
    )
    if open_search is not None:
        try:
            open_search.click(timeout=2500)
        except Exception:
            return None

    return _find_visible_locator(
        page,
        selectors=[
            "div[role='textbox'][title='Search input textbox']",
            "div[contenteditable='true'][data-tab='3']",
            "div[contenteditable='true'][aria-label='Search input textbox']",
            "div[role='textbox'][aria-label*='Search']",
            "div[contenteditable='true'][aria-label*='Search']",
        ],
        timeout_ms=6500,
    )


def _find_contact_locator(page: Any, contact_name: str) -> Any | None:
    normalized = _normalize_contact_text(contact_name)
    if not normalized:
        return None

    exact = page.locator(f"span[title='{contact_name}']").first
    try:
        if exact.count() > 0:
            return exact
    except Exception:
        pass

    lowered = normalized.replace("'", "")
    fuzzy = page.locator(
        "xpath=//span[@title and contains(translate(normalize-space(@title),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),"
        f" '{lowered}') ]"
    ).first
    try:
        if fuzzy.count() > 0:
            return fuzzy
    except Exception:
        pass

    tokens = _contact_tokens(contact_name)
    if tokens:
        token_expr = " and ".join(
            [
                "contains(translate(normalize-space(@title),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),"
                f" '{token}')"
                for token in tokens[:3]
            ]
        )
        token_match = page.locator(f"xpath=//span[@title and {token_expr}]").first
        try:
            if token_match.count() > 0:
                return token_match
        except Exception:
            pass

    return _find_visible_locator(
        page,
        selectors=[
            "div[aria-label='Search results.'] span[title]",
            "div[aria-label='Chat list'] span[title]",
            "div[role='grid'] span[title]",
        ],
        timeout_ms=1800,
    )


def _get_active_chat_title(page: Any) -> str:
    title_loc = _find_visible_locator(
        page,
        selectors=[
            "header span[title]",
            "header h1 span[dir='auto']",
            "header div[role='button'] span[dir='auto']",
        ],
        timeout_ms=5000,
    )
    if title_loc is None:
        return ""

    try:
        text = str(title_loc.text_content() or "").strip()
    except Exception:
        return ""
    return text


def _open_whatsapp_desktop_app() -> tuple[bool, str]:
    if os.name != "nt":
        return False, "Desktop WhatsApp auto-launch is currently optimized for Windows only."

    try:
        os.startfile("whatsapp://")  # type: ignore[attr-defined]
        return True, "Opened installed WhatsApp Desktop app"
    except Exception:
        pass

    executable = shutil.which("WhatsApp.exe") or shutil.which("whatsapp.exe")
    if executable:
        try:
            os.startfile(executable)  # type: ignore[attr-defined]
            return True, "Opened installed WhatsApp Desktop app"
        except Exception as exc:
            return False, f"Could not launch WhatsApp desktop executable: {exc}"

    local_app_data = Path(os.getenv("LOCALAPPDATA", ""))
    candidates = [
        local_app_data / "WhatsApp" / "WhatsApp.exe",
        Path("C:/Program Files/WindowsApps/WhatsApp.exe"),
    ]
    for candidate in candidates:
        if not candidate.exists():
            continue
        try:
            os.startfile(str(candidate))  # type: ignore[attr-defined]
            return True, "Opened installed WhatsApp Desktop app"
        except Exception:
            continue

    return False, "Installed WhatsApp desktop app could not be auto-launched; switching to WhatsApp Web automation."


def _send_whatsapp_via_desktop_automation(contact_name: str, message_text: str) -> tuple[bool, str]:
    try:
        import pyautogui  # type: ignore[import-not-found]
    except Exception as exc:
        return (
            False,
            "Desktop automation package missing (install pyautogui and pygetwindow). "
            f"Reason: {exc.__class__.__name__}",
        )

    pyautogui.FAILSAFE = False
    pyautogui.PAUSE = 0.16

    try:
        try:
            import pygetwindow as gw  # type: ignore[import-not-found]

            windows = [window for window in gw.getAllWindows() if "whatsapp" in (window.title or "").lower()]
            if windows:
                windows[0].activate()
                time.sleep(0.8)
        except Exception:
            # Window activation best-effort only.
            pass

        # Ctrl+N opens a new-chat picker in WhatsApp Desktop.
        pyautogui.hotkey("ctrl", "n")
        time.sleep(0.75)
        pyautogui.typewrite(contact_name, interval=0.045)
        time.sleep(0.9)
        pyautogui.press("enter")
        time.sleep(0.9)
        pyautogui.typewrite(message_text, interval=0.034)
        pyautogui.press("enter")
        return True, "Sent message using WhatsApp Desktop keyboard automation"
    except Exception as exc:
        return False, f"WhatsApp Desktop keyboard automation failed: {exc}"


def _send_whatsapp_message_sync(contact_name: str, message_text: str) -> dict[str, Any]:
    actions: list[str] = []
    profile_dir = Path(
        os.getenv("OMNI_WHATSAPP_PROFILE_DIR", str(Path.home() / ".omni-whatsapp-profile"))
    )
    profile_dir.mkdir(parents=True, exist_ok=True)

    playwright = None
    context = None

    try:
        desktop_ok, desktop_msg = _open_whatsapp_desktop_app()
        actions.append(desktop_msg)
        if desktop_ok:
            wait_ms = int(os.getenv("OMNI_WHATSAPP_DESKTOP_WARMUP_MS", "1200"))
            if wait_ms > 0:
                # Brief pause so users can visually confirm desktop app launch.
                import time

                time.sleep(wait_ms / 1000)

            if _is_truthy_env("OMNI_WHATSAPP_DESKTOP_AUTOMATION", "true"):
                desktop_sent, desktop_status = _send_whatsapp_via_desktop_automation(contact_name, message_text)
                actions.append(desktop_status)
                if desktop_sent:
                    confirmation_ms = int(os.getenv("OMNI_WHATSAPP_CONFIRMATION_MS", "6000"))
                    time.sleep(max(0.5, confirmation_ms / 1000))
                    return {
                        "ok": True,
                        "contact": contact_name,
                        "message": message_text,
                        "actions": actions,
                        "channel": "whatsapp-desktop",
                    }

        if sync_playwright is None:
            return {
                "ok": False,
                "error": "Playwright is not installed. Run: pip install playwright and playwright install chromium.",
                "actions": actions,
            }

        if os.name == "nt":
            try:
                policy = asyncio.get_event_loop_policy()
                if policy.__class__.__name__ == "WindowsSelectorEventLoopPolicy":
                    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
                    actions.append("Switched Windows event loop policy to Proactor for Playwright")
            except Exception:
                pass

        playwright = sync_playwright().start()
        context = playwright.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=False,
            viewport={"width": 1440, "height": 900},
            args=["--start-maximized"],
        )

        page = context.pages[0] if context.pages else context.new_page()
        actions.append("Opened Chromium automation window")

        page.goto(WHATSAPP_WEB_URL, wait_until="domcontentloaded")
        actions.append("Opened WhatsApp Web")

        search_box = _find_search_box(page)

        if search_box is None:
            return {
                "ok": False,
                "error": "WhatsApp search box not found. If this is first run, scan QR code and try again.",
                "actions": actions,
            }

        search_box.click()
        page.keyboard.press("Control+A")
        page.keyboard.press("Backspace")
        page.keyboard.type(contact_name, delay=46)
        actions.append(f"Searched contact: {contact_name}")

        page.wait_for_timeout(1400)

        target_contact = _find_contact_locator(page, contact_name)
        if target_contact is None:
            try:
                search_box.press("Enter")
                actions.append("Pressed Enter as fallback for first search result")
            except Exception:
                pass
            page.wait_for_timeout(1100)
        else:
            target_contact.click(timeout=5000)

        active_chat = _get_active_chat_title(page)
        if active_chat:
            actions.append(f"Active chat: {active_chat}")

        if not _matches_contact(active_chat, contact_name):
            return {
                "ok": False,
                "error": (
                    f"Contact not found or chat mismatch for '{contact_name}'. "
                    f"Current active chat: '{active_chat or 'none'}'."
                ),
                "actions": actions,
            }

        actions.append(f"Opened chat: {contact_name}")

        composer_selectors = [
            "footer div[role='textbox'][contenteditable='true']",
            "footer div[contenteditable='true'][data-tab='10']",
            "div[aria-label='Type a message'][contenteditable='true']",
        ]

        composer = None
        for selector in composer_selectors:
            locator = page.locator(selector).first
            try:
                locator.wait_for(state="visible", timeout=15000)
                composer = locator
                break
            except PlaywrightTimeoutError:
                continue

        if composer is None:
            return {
                "ok": False,
                "error": "Message composer not found in selected chat.",
                "actions": actions,
            }

        composer.click()
        page.keyboard.type(message_text, delay=32)
        page.keyboard.press("Enter")
        actions.append(f"Sent message: {message_text}")

        confirmation_ms = int(os.getenv("OMNI_WHATSAPP_CONFIRMATION_MS", "6000"))
        page.wait_for_timeout(max(500, confirmation_ms))
        actions.append("Displayed sent-message confirmation window")

        return {
            "ok": True,
            "contact": contact_name,
            "message": message_text,
            "actions": actions,
            "channel": "whatsapp-web",
        }
    except Exception as exc:
        if isinstance(exc, NotImplementedError):
            error_text = (
                "Playwright hit NotImplementedError (Windows event-loop/subprocess issue). "
                "Run backend without reload or keep Proactor policy active."
            )
        else:
            trace_tail = traceback.format_exc(limit=2).strip().splitlines()
            trace_hint = trace_tail[-1] if trace_tail else ""
            base_text = str(exc).strip() or exc.__class__.__name__
            error_text = f"{base_text} ({trace_hint})" if trace_hint and trace_hint not in base_text else base_text

        return {
            "ok": False,
            "error": f"WhatsApp automation failed: {error_text}",
            "actions": actions,
        }
    finally:
        keep_windows_open = os.getenv("OMNI_KEEP_AUTOMATION_WINDOWS_OPEN", "false").strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        if not keep_windows_open:
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


async def send_whatsapp_message(contact_name: str, message_text: str) -> dict[str, Any]:
    if not contact_name.strip() or not message_text.strip():
        return {
            "ok": False,
            "error": "Contact name and message text are required.",
            "actions": [],
        }

    # Run Playwright in a worker thread so Windows SelectorEventLoop (used in some
    # dev server setups) does not break subprocess creation.
    return await asyncio.to_thread(_send_whatsapp_message_sync, contact_name, message_text)
