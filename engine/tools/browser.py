from __future__ import annotations

import re
import webbrowser
from urllib.parse import quote_plus

from tools.local_files import open_local_application_from_prompt


def _extract_search_query(prompt: str) -> str | None:
    quoted = re.search(r"\bsearch(?:\s+for)?\s+['\"]([^'\"]+)['\"]", prompt, flags=re.IGNORECASE)
    if quoted:
        return quoted.group(1).strip() or None

    plain = re.search(r"\bsearch(?:\s+for)?\s+(.+)$", prompt, flags=re.IGNORECASE)
    if not plain:
        return None
    return plain.group(1).strip(" .") or None


async def run_browser_task(prompt: str) -> str:
    if not prompt.strip():
        return "No browser task requested."

    opened, status_message, app_name = await open_local_application_from_prompt(prompt)
    if opened:
        if app_name:
            return f"Done. {status_message}"
        return status_message

    search_query = _extract_search_query(prompt)
    if search_query:
        url = f"https://www.google.com/search?q={quote_plus(search_query)}"
        opened_default = webbrowser.open(url, new=2)
        if opened_default:
            return f"Opened default browser and searched for \"{search_query}\"."
        return f"Browser search failed for \"{search_query}\"."

    return f"Browser task failed: {status_message}"
