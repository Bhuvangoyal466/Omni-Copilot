from __future__ import annotations

import html
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import quote_plus

import httpx

from tools.gmail import (
    _decrypt_token_blob,
    _load_google_provider_connection,
    _persist_google_token,
    _refresh_google_access_token,
)


GOOGLE_NEWS_URL = "https://news.google.com/rss/search"
BRAND_HINTS = (
    "Acer",
    "Apple",
    "Asus",
    "Dell",
    "HP",
    "Huawei",
    "Lenovo",
    "LG",
    "MSI",
    "Microsoft",
    "Razer",
    "Samsung",
    "Xiaomi",
)


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _extract_research_topic(user_prompt: str) -> str:
    prompt = _normalize(user_prompt)
    if not prompt:
        return "2026 laptop launches"

    year_match = re.search(r"\b(20\d{2})\b", prompt)
    topic = prompt
    topic = re.sub(
        r"\b(create|make|build|prepare|generate|bna|banado|bnado|sheet|sheets|spreadsheet|google)\b",
        " ",
        topic,
        flags=re.IGNORECASE,
    )
    topic = _normalize(topic)
    if year_match and year_match.group(1) not in topic:
        topic = f"{topic} {year_match.group(1)}".strip()

    if len(topic) < 6:
        return "2026 laptop launches"
    return topic


def _build_news_queries(topic: str) -> list[str]:
    normalized = topic.lower()
    queries = [topic]

    if "laptop" in normalized:
        queries.extend(
            [
                f"{topic} CES 2026",
                f"{topic} release date",
                f"{topic} announced",
                "2026 gaming laptop launch",
                "2026 business laptop launch",
            ]
        )
    else:
        queries.extend([f"{topic} launch", f"{topic} release date"])

    deduped: list[str] = []
    for item in queries:
        cleaned = _normalize(item)
        if cleaned and cleaned.lower() not in {x.lower() for x in deduped}:
            deduped.append(cleaned)
    return deduped[:6]


def _extract_brand(text: str) -> str:
    lowered = text.lower()
    for brand in BRAND_HINTS:
        if brand.lower() in lowered:
            return brand
    return "Unknown"


def _extract_timeline_hint(text: str) -> str:
    match = re.search(
        r"\b(CES\s+20\d{2}|Q[1-4]\s*20\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d{2}|20\d{2})\b",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return "TBD"
    return _normalize(match.group(1).upper().replace("  ", " "))


def _extract_region_hint(text: str) -> str:
    lowered = text.lower()
    if "india" in lowered or "indian" in lowered:
        return "India"
    if "us" in lowered or "usa" in lowered or "united states" in lowered:
        return "US"
    if "europe" in lowered or "eu" in lowered:
        return "Europe"
    if "global" in lowered or "worldwide" in lowered:
        return "Global"
    return "Unknown"


def _clean_title(raw_title: str) -> str:
    title = html.unescape(raw_title)
    title = re.sub(r"\s+-\s+[^-]+$", "", title).strip()
    return title


def _parse_published_at(raw: str) -> str:
    value = raw.strip()
    if not value:
        return ""
    try:
        parsed = parsedate_to_datetime(value)
    except Exception:
        return value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _build_rows(items: list[dict[str, str]]) -> list[list[str]]:
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    rows: list[list[str]] = [
        [
            "Brand",
            "Model / Event",
            "Expected Launch",
            "Region",
            "Source",
            "Headline",
            "Published At (UTC)",
            "Source URL",
            "Captured At (UTC)",
        ]
    ]

    for item in items:
        headline = _normalize(item.get("title", ""))
        source = _normalize(item.get("source", "Unknown"))
        combined = f"{headline} {source}"
        rows.append(
            [
                _extract_brand(combined),
                headline or "Untitled launch update",
                _extract_timeline_hint(combined),
                _extract_region_hint(combined),
                source or "Unknown",
                headline,
                item.get("published_at", ""),
                item.get("url", ""),
                timestamp,
            ]
        )

    return rows


async def _fetch_news_items_for_query(
    query: str,
    *,
    client: httpx.AsyncClient,
    limit: int,
) -> list[dict[str, str]]:
    response = await client.get(
        GOOGLE_NEWS_URL,
        params={
            "q": query,
            "hl": "en-IN",
            "gl": "IN",
            "ceid": "IN:en",
        },
        headers={"User-Agent": "OmniCopilot/1.0"},
    )

    if response.status_code >= 400:
        return []

    try:
        root = ET.fromstring(response.text)
    except Exception:
        return []

    results: list[dict[str, str]] = []
    channel = root.find("channel")
    if channel is None:
        return results

    for item in channel.findall("item")[:limit]:
        title_text = _clean_title(item.findtext("title", default=""))
        url = _normalize(item.findtext("link", default=""))
        pub_raw = item.findtext("pubDate", default="")

        if not title_text or not url:
            continue

        source = "Unknown"
        source_node = item.find("source")
        if source_node is not None and source_node.text:
            source = _normalize(html.unescape(source_node.text))

        results.append(
            {
                "title": title_text,
                "url": url,
                "source": source,
                "published_at": _parse_published_at(pub_raw),
            }
        )

    return results


def _dedupe_items(items: list[dict[str, str]], *, limit: int) -> list[dict[str, str]]:
    seen: set[str] = set()
    deduped: list[dict[str, str]] = []

    for item in items:
        url = item.get("url", "")
        key = url.lower().strip()
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(item)
        if len(deduped) >= limit:
            break

    return deduped


async def _ensure_google_access_token(user_id: str) -> tuple[str | None, dict[str, Any], str | None]:
    provider_row = _load_google_provider_connection(user_id)
    if provider_row is None:
        return None, {}, "Google is not connected for this user. Connect Google in Integrations first."

    token_payload = _decrypt_token_blob(provider_row.encrypted_token)
    access_token = str(token_payload.get("access_token") or "").strip()
    refresh_token = str(token_payload.get("refresh_token") or "").strip()

    if not access_token and not refresh_token:
        return None, token_payload, "Missing Google access token. Reconnect Google integration and try again."

    if not access_token and refresh_token:
        refreshed = await _refresh_google_access_token(refresh_token)
        if refreshed:
            access_token = str(refreshed.get("access_token") or "").strip()
            if access_token:
                token_payload.update(refreshed)
                if not token_payload.get("refresh_token"):
                    token_payload["refresh_token"] = refresh_token
                _persist_google_token(user_id, token_payload)

    if not access_token:
        return None, token_payload, "Google access token expired and refresh failed. Reconnect Google."

    return access_token, token_payload, None


async def _google_api_request(
    *,
    client: httpx.AsyncClient,
    method: str,
    url: str,
    access_token: str,
    json_payload: dict[str, Any] | None = None,
) -> httpx.Response:
    return await client.request(
        method,
        url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        json=json_payload,
    )


def _looks_like_scope_error(response: httpx.Response) -> bool:
    if response.status_code not in {401, 403}:
        return False
    text = response.text.lower()
    return "insufficient" in text or "scope" in text or "permission" in text


async def _retry_with_refresh(
    *,
    user_id: str,
    token_payload: dict[str, Any],
    stale_response: httpx.Response,
) -> tuple[str | None, dict[str, Any], httpx.Response | None]:
    refresh_token = str(token_payload.get("refresh_token") or "").strip()
    if stale_response.status_code != 401 or not refresh_token:
        return None, token_payload, None

    refreshed = await _refresh_google_access_token(refresh_token)
    if not refreshed:
        return None, token_payload, None

    access_token = str(refreshed.get("access_token") or "").strip()
    if not access_token:
        return None, token_payload, None

    token_payload.update(refreshed)
    if not token_payload.get("refresh_token"):
        token_payload["refresh_token"] = refresh_token
    _persist_google_token(user_id, token_payload)
    return access_token, token_payload, stale_response


async def create_google_sheet_from_web_research(
    *,
    user_id: str,
    user_prompt: str,
) -> dict[str, Any]:
    if not user_id.strip():
        return {"ok": False, "error": "No authenticated user available for Google Sheets creation."}

    topic = _extract_research_topic(user_prompt)
    queries = _build_news_queries(topic)

    all_items: list[dict[str, str]] = []
    async with httpx.AsyncClient(timeout=30) as client:
        for query in queries:
            batch = await _fetch_news_items_for_query(query, client=client, limit=14)
            if batch:
                all_items.extend(batch)

    rows_source = _dedupe_items(all_items, limit=100)
    if not rows_source:
        return {
            "ok": False,
            "error": "Could not fetch launch data from web sources right now. Try again after a few minutes.",
        }

    rows = _build_rows(rows_source)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    title = f"Omni Research - {topic[:70]} ({timestamp})"

    access_token, token_payload, token_error = await _ensure_google_access_token(user_id)
    if token_error:
        return {"ok": False, "error": token_error}
    if not access_token:
        return {"ok": False, "error": "Could not access Google token."}

    warnings: list[str] = []
    spreadsheet_id = ""
    spreadsheet_url = ""

    async with httpx.AsyncClient(timeout=40) as client:
        create_response = await _google_api_request(
            client=client,
            method="POST",
            url="https://sheets.googleapis.com/v4/spreadsheets",
            access_token=access_token,
            json_payload={
                "properties": {"title": title},
                "sheets": [{"properties": {"title": "Launch Data"}}],
            },
        )

        if create_response.status_code == 401:
            refreshed_token, token_payload, _ = await _retry_with_refresh(
                user_id=user_id,
                token_payload=token_payload,
                stale_response=create_response,
            )
            if refreshed_token:
                access_token = refreshed_token
                create_response = await _google_api_request(
                    client=client,
                    method="POST",
                    url="https://sheets.googleapis.com/v4/spreadsheets",
                    access_token=access_token,
                    json_payload={
                        "properties": {"title": title},
                        "sheets": [{"properties": {"title": "Launch Data"}}],
                    },
                )

        if create_response.status_code >= 400:
            if _looks_like_scope_error(create_response):
                return {
                    "ok": False,
                    "error": (
                        "Google Sheets create failed due to missing scopes. Reconnect Google with scopes: "
                        "https://www.googleapis.com/auth/spreadsheets and https://www.googleapis.com/auth/drive.file"
                    ),
                }
            return {
                "ok": False,
                "error": f"Google Sheets create failed ({create_response.status_code}): {create_response.text[:300]}",
            }

        try:
            create_payload = create_response.json()
        except Exception:
            create_payload = {}

        spreadsheet_id = str(create_payload.get("spreadsheetId") or "").strip()
        spreadsheet_url = str(create_payload.get("spreadsheetUrl") or "").strip()
        if not spreadsheet_id:
            return {"ok": False, "error": "Google Sheets API did not return spreadsheetId."}

        append_response = await _google_api_request(
            client=client,
            method="POST",
            url=(
                f"https://sheets.googleapis.com/v4/spreadsheets/{quote_plus(spreadsheet_id)}"
                "/values/Launch%20Data!A1:append?valueInputOption=USER_ENTERED"
            ),
            access_token=access_token,
            json_payload={"majorDimension": "ROWS", "values": rows},
        )

        if append_response.status_code >= 400:
            return {
                "ok": False,
                "error": f"Sheet row write failed ({append_response.status_code}): {append_response.text[:300]}",
            }

        format_response = await _google_api_request(
            client=client,
            method="POST",
            url=f"https://sheets.googleapis.com/v4/spreadsheets/{quote_plus(spreadsheet_id)}:batchUpdate",
            access_token=access_token,
            json_payload={
                "requests": [
                    {
                        "repeatCell": {
                            "range": {
                                "sheetId": 0,
                                "startRowIndex": 0,
                                "endRowIndex": 1,
                            },
                            "cell": {
                                "userEnteredFormat": {
                                    "textFormat": {"bold": True},
                                    "backgroundColor": {
                                        "red": 0.84,
                                        "green": 0.93,
                                        "blue": 0.98,
                                    },
                                }
                            },
                            "fields": "userEnteredFormat(textFormat,backgroundColor)",
                        }
                    },
                    {
                        "autoResizeDimensions": {
                            "dimensions": {
                                "sheetId": 0,
                                "dimension": "COLUMNS",
                                "startIndex": 0,
                                "endIndex": 9,
                            }
                        }
                    },
                ]
            },
        )
        if format_response.status_code >= 400:
            warnings.append("Formatting step skipped due to API response.")

        permission_response = await _google_api_request(
            client=client,
            method="POST",
            url=f"https://www.googleapis.com/drive/v3/files/{quote_plus(spreadsheet_id)}/permissions",
            access_token=access_token,
            json_payload={"role": "reader", "type": "anyone"},
        )
        if permission_response.status_code >= 400:
            if _looks_like_scope_error(permission_response):
                warnings.append(
                    "Public sharing was not enabled due to missing Drive scope. Open Share in Sheets and enable link sharing."
                )
            else:
                warnings.append("Could not auto-enable public sharing. You can share manually from the Sheet.")

    if not spreadsheet_url:
        spreadsheet_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit"

    return {
        "ok": True,
        "topic": topic,
        "sheet_title": title,
        "sheet_id": spreadsheet_id,
        "sheet_url": spreadsheet_url,
        "queries": queries,
        "records_written": max(0, len(rows) - 1),
        "sources_collected": len(rows_source),
        "warnings": warnings,
    }