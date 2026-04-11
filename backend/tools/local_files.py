from __future__ import annotations

import asyncio
import os
import re
import shutil
import subprocess
import sys
import webbrowser
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus


MEDIA_EXTENSIONS = {
    ".mp4",
    ".mkv",
    ".avi",
    ".mov",
    ".webm",
    ".m4v",
    ".wmv",
    ".flv",
}
DOC_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".txt",
    ".md",
    ".ppt",
    ".pptx",
    ".xls",
    ".xlsx",
    ".csv",
}
SEARCHABLE_EXTENSIONS = MEDIA_EXTENSIONS | DOC_EXTENSIONS
MAX_SCAN_FILES = 20000
MAX_RESULTS = 20
MEDIA_FORMAT_WORDS = {"mp4", "mkv", "avi", "mov", "webm", "wmv", "flv", "m4v"}
LOW_SIGNAL_MEDIA_TOKENS = {
    "1080p",
    "720p",
    "2160p",
    "4k",
    "x264",
    "x265",
    "h264",
    "h265",
    "hdtc",
    "hdrip",
    "webrip",
    "bluray",
    "aac",
    "dd2",
    "dd5",
    "org",
    "hindi",
    "english",
    "esubs",
    "subs",
    "v1",
    "v2",
    "v3",
    "hq",
    "hd",
}
QUERY_STOPWORDS = {
    "open",
    "play",
    "launch",
    "start",
    "from",
    "fromm",
    "my",
    "pc",
    "laptop",
    "local",
    "computer",
    "movie",
    "video",
    "file",
    "files",
    "please",
    "pls",
    "the",
    "a",
    "an",
}
VLC_WINDOWS_PATHS = (
    Path("C:/Program Files/VideoLAN/VLC/vlc.exe"),
    Path("C:/Program Files (x86)/VideoLAN/VLC/vlc.exe"),
)
APP_KEYWORDS: dict[str, tuple[str, ...]] = {
    "whatsapp": ("whatsapp", "whats app"),
    "chrome": ("chrome", "google chrome"),
    "edge": ("edge", "microsoft edge", "ms edge", "msedge"),
    "firefox": ("firefox", "mozilla firefox", "mozilla"),
    "brave": ("brave", "brave browser"),
    "opera": ("opera", "opera browser"),
    "notepad": ("notepad",),
    "calculator": ("calculator", "calc"),
    "vlc": ("vlc",),
    "discord": ("discord",),
    "spotify": ("spotify",),
    "telegram": ("telegram",),
    "vscode": ("vscode", "visual studio code", "code"),
    "word": ("word", "microsoft word"),
    "excel": ("excel", "microsoft excel"),
    "powerpoint": ("powerpoint", "microsoft powerpoint", "ppt"),
    "teams": ("teams", "microsoft teams"),
    "zoom": ("zoom",),
    "explorer": ("file explorer", "explorer"),
    "cmd": ("command prompt", "cmd"),
    "powershell": ("powershell", "power shell"),
}
APP_EXECUTABLES: dict[str, tuple[str, ...]] = {
    "whatsapp": ("WhatsApp.exe", "whatsapp.exe"),
    "chrome": ("chrome.exe",),
    "edge": ("msedge.exe",),
    "firefox": ("firefox.exe",),
    "brave": ("brave.exe", "brave-browser.exe"),
    "opera": ("opera.exe",),
    "notepad": ("notepad.exe",),
    "calculator": ("calc.exe",),
    "vlc": ("vlc.exe",),
    "discord": ("Discord.exe", "discord.exe"),
    "spotify": ("Spotify.exe", "spotify.exe"),
    "telegram": ("Telegram.exe", "telegram.exe"),
    "vscode": ("Code.exe", "code.exe"),
    "word": ("WINWORD.EXE",),
    "excel": ("EXCEL.EXE",),
    "powerpoint": ("POWERPNT.EXE",),
    "teams": ("ms-teams.exe", "Teams.exe"),
    "zoom": ("Zoom.exe",),
    "explorer": ("explorer.exe",),
    "cmd": ("cmd.exe",),
    "powershell": ("powershell.exe", "pwsh.exe"),
}
BROWSER_APPS = {"chrome", "edge", "firefox", "brave", "opera"}
BROWSER_WINDOWS_PATHS: dict[str, tuple[Path, ...]] = {
    "edge": (
        Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
        Path("C:/Program Files/Microsoft/Edge/Application/msedge.exe"),
    ),
    "chrome": (
        Path("C:/Program Files/Google/Chrome/Application/chrome.exe"),
        Path("C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"),
    ),
    "firefox": (Path("C:/Program Files/Mozilla Firefox/firefox.exe"),),
    "brave": (
        Path("C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"),
        Path("C:/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe"),
    ),
    "opera": (Path("C:/Users") / "HP" / "AppData/Local/Programs/Opera/launcher.exe",),
}
WEB_APP_URLS: dict[str, str] = {
    "instagram": "https://www.instagram.com",
    "youtube": "https://www.youtube.com",
    "linkedin": "https://www.linkedin.com",
    "facebook": "https://www.facebook.com",
    "x": "https://x.com",
    "twitter": "https://x.com",
    "reddit": "https://www.reddit.com",
    "github": "https://github.com",
    "notion": "https://www.notion.so",
    "slack": "https://slack.com/signin",
    "discord": "https://discord.com/channels/@me",
    "whatsapp": "https://web.whatsapp.com",
}


def _normalize_text(text: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", " ", text.lower())
    return re.sub(r"\s+", " ", cleaned).strip()


def _tokenize(text: str) -> list[str]:
    return [
        token
        for token in _normalize_text(text).split(" ")
        if token and (len(token) > 2 or token in MEDIA_FORMAT_WORDS) and token not in QUERY_STOPWORDS
    ]


def _important_query_tokens(tokens: list[str]) -> list[str]:
    important: list[str] = []
    for token in tokens:
        if token in MEDIA_FORMAT_WORDS or token in LOW_SIGNAL_MEDIA_TOKENS:
            continue
        if token.isdigit():
            continue
        if len(token) < 4:
            continue
        important.append(token)
    return important


def _extract_requested_drives(query: str) -> list[str]:
    requested = set(re.findall(r"(?:drive|disk)\s*([a-z])\b", query.lower()))
    return [f"{letter.upper()}:/" for letter in sorted(requested)]


def _extract_target_size_gb(query: str) -> float | None:
    match = re.search(r"(\d+(?:\.\d+)?)\s*gb\b", query.lower())
    if not match:
        return None

    try:
        return float(match.group(1))
    except ValueError:
        return None


def _search_roots(query: str) -> list[Path]:
    roots: list[Path] = []
    home = Path.home()

    for folder_name in ("Videos", "Downloads", "Desktop", "Documents"):
        folder_path = home / folder_name
        if folder_path.exists():
            roots.append(folder_path)

    cwd = Path.cwd()
    workspace_guess = cwd.parent if cwd.name.lower() == "backend" else cwd
    if workspace_guess.exists():
        roots.append(workspace_guess)

    extra_roots = os.getenv("OMNI_LOCAL_SEARCH_DIRS", "")
    if extra_roots:
        for raw_path in extra_roots.split(os.pathsep):
            normalized = raw_path.strip()
            if not normalized:
                continue
            candidate = Path(normalized)
            if candidate.exists():
                roots.append(candidate)

    if os.name == "nt":
        drive_candidates = ["C:/", "D:/", "E:/"]
        for requested_drive in _extract_requested_drives(query):
            if requested_drive not in drive_candidates:
                drive_candidates.insert(0, requested_drive)

        for drive in drive_candidates:
            for folder_name in ("Movies", "Videos"):
                folder_path = Path(drive) / folder_name
                if folder_path.exists():
                    roots.append(folder_path)

            drive_root = Path(drive)
            if drive_root.exists() and drive in _extract_requested_drives(query):
                roots.insert(0, drive_root)

    deduped: dict[str, Path] = {}
    for path in roots:
        deduped[str(path.resolve())] = path

    return list(deduped.values())


def _score_candidate(file_path: Path, query_text: str, query_tokens: list[str]) -> tuple[int, int]:
    normalized_name = _normalize_text(file_path.name)
    normalized_path = _normalize_text(str(file_path))
    focused_query = " ".join(query_tokens)
    score = 0
    token_hits = 0

    if focused_query and focused_query in normalized_name:
        score += 120
    elif query_text and query_text in normalized_name:
        score += 40

    if focused_query and focused_query in normalized_path:
        score += 50
    elif query_text and query_text in normalized_path:
        score += 20

    for token in query_tokens:
        if token in normalized_name:
            score += 20
            token_hits += 1
        elif token in normalized_path:
            score += 8
            token_hits += 1

    if file_path.suffix.lower() in MEDIA_EXTENSIONS:
        score += 10

    return score, token_hits


def _size_bonus_score(file_path: Path, target_size_gb: float | None) -> int:
    if target_size_gb is None:
        return 0

    try:
        size_bytes = file_path.stat().st_size
    except OSError:
        return 0

    size_gb = size_bytes / (1024**3)
    if size_gb <= 0:
        return -20

    relative_diff = abs(size_gb - target_size_gb) / max(target_size_gb, 1.0)

    if relative_diff <= 0.08:
        return 60
    if relative_diff <= 0.2:
        return 35
    if relative_diff <= 0.35:
        return 15
    if relative_diff <= 0.5:
        return -8
    return -25


def _search_local_files_sync(query: str) -> list[dict[str, Any]]:
    query_text = _normalize_text(query)
    query_tokens = _tokenize(query)
    important_tokens = _important_query_tokens(query_tokens)
    target_size_gb = _extract_target_size_gb(query)

    if not query_text:
        return []

    scanned = 0
    scored_hits: list[tuple[int, Path]] = []

    for root in _search_roots(query):
        if scanned >= MAX_SCAN_FILES:
            break

        for dirpath, _, filenames in os.walk(root):
            if scanned >= MAX_SCAN_FILES:
                break

            for filename in filenames:
                if scanned >= MAX_SCAN_FILES:
                    break

                scanned += 1
                file_path = Path(dirpath) / filename
                extension = file_path.suffix.lower()
                if extension not in SEARCHABLE_EXTENSIONS:
                    continue

                score, token_hits = _score_candidate(file_path, query_text, query_tokens)
                if query_tokens and token_hits == 0:
                    continue

                if important_tokens:
                    normalized_target = _normalize_text(str(file_path))
                    if not any(token in normalized_target for token in important_tokens):
                        continue

                score += _size_bonus_score(file_path, target_size_gb)
                if score <= 0:
                    continue

                scored_hits.append((score, file_path))

    scored_hits.sort(key=lambda item: item[0], reverse=True)
    top_hits = scored_hits[:MAX_RESULTS]

    results: list[dict[str, Any]] = []
    for score, file_path in top_hits:
        size_bytes = None
        try:
            size_bytes = file_path.stat().st_size
        except OSError:
            size_bytes = None

        results.append(
            {
                "path": str(file_path),
                "name": file_path.name,
                "score": score,
                "size_bytes": size_bytes,
                "snippet": f"Matched by filename/path similarity ({score}).",
            }
        )

    return results


async def find_best_local_file(query: str, *, prefer_media: bool = False) -> str | None:
    query_tokens = _tokenize(query)
    hits = await search_local_files(query)
    if not hits:
        return None

    top_score = int(hits[0].get("score", 0))
    if query_tokens and top_score < 25:
        return None

    if prefer_media:
        for hit in hits:
            path_value = str(hit.get("path", ""))
            if Path(path_value).suffix.lower() in MEDIA_EXTENSIONS:
                return path_value

    return str(hits[0].get("path", "")) or None


def _resolve_vlc_executable() -> str | None:
    cli_path = shutil.which("vlc")
    if cli_path:
        return cli_path

    if os.name == "nt":
        for path in VLC_WINDOWS_PATHS:
            if path.exists():
                return str(path)

    return None


def _open_local_file_sync(file_path: str, use_vlc: bool = False) -> tuple[bool, str]:
    path = Path(file_path)
    if not path.exists():
        return False, f"File not found: {file_path}"
    if not path.is_file():
        return False, f"Not a file: {file_path}"

    try:
        if use_vlc:
            vlc_executable = _resolve_vlc_executable()
            if not vlc_executable:
                return False, "VLC not found on this PC. Install VLC or remove the VLC-only request."

            subprocess.Popen([vlc_executable, str(path)])
        elif os.name == "nt":
            os.startfile(str(path))  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(path)])
        else:
            subprocess.Popen(["xdg-open", str(path)])
    except Exception as exc:
        return False, f"Failed to open file: {exc}"

    if use_vlc:
        return True, f"Opened {path.name} in VLC"
    return True, f"Opened {path.name}"


async def open_local_file(file_path: str, *, use_vlc: bool = False) -> tuple[bool, str]:
    return await asyncio.to_thread(_open_local_file_sync, file_path, use_vlc)


def _detect_requested_app(prompt: str) -> str | None:
    normalized = _normalize_text(prompt)
    command_match = re.search(
        r"(?:^|[.!?]\s+)(?:please\s+|can\s+you\s+|could\s+you\s+|kindly\s+|omni\s+)?"
        r"(?:open|launch|start|run|khol|kholo)\s+([a-z0-9][a-z0-9 ._-]{1,64})",
        normalized,
    )
    if not command_match:
        return None

    raw_candidate = command_match.group(1)
    candidate = re.split(
        r"\b(?:app|software|please|pls|and|then|search|for|in|on|website|web|browser|with)\b",
        raw_candidate,
        maxsplit=1,
    )[0]
    candidate = re.sub(r"\s+", " ", candidate).strip(" .")
    if not candidate:
        return None

    for app_name, keywords in APP_KEYWORDS.items():
        if any(keyword in candidate for keyword in keywords):
            return app_name

    if candidate in {
        "my",
        "pc",
        "laptop",
        "computer",
        "local",
        "a",
        "an",
        "the",
        "file",
        "folder",
        "website",
        "web",
    }:
        return None

    return candidate


def looks_like_local_app_request(prompt: str) -> bool:
    return _detect_requested_app(prompt) is not None


def _extract_search_query(prompt: str) -> str | None:
    quoted = re.search(r"\bsearch(?:\s+for)?\s+['\"]([^'\"]+)['\"]", prompt, flags=re.IGNORECASE)
    if quoted:
        query = quoted.group(1).strip()
        return query or None

    plain = re.search(r"\bsearch(?:\s+for)?\s+(.+)$", prompt, flags=re.IGNORECASE)
    if not plain:
        return None

    query = plain.group(1).strip(" .")
    query = re.sub(
        r"\b(?:on|in)\s+(?:microsoft\s+edge|edge|google\s+chrome|chrome|firefox|brave|opera)\b$",
        "",
        query,
        flags=re.IGNORECASE,
    ).strip(" .")
    return query or None


def _extract_url(prompt: str) -> str | None:
    match = re.search(r"https?://\S+", prompt, flags=re.IGNORECASE)
    if not match:
        return None
    return match.group(0).rstrip(".,)")


def _extract_requested_browser(prompt: str) -> str | None:
    normalized = _normalize_text(prompt)
    for app_name in BROWSER_APPS:
        for keyword in APP_KEYWORDS.get(app_name, ()): 
            if keyword in normalized:
                return app_name
    return None


def _extract_web_target_url(prompt: str, fallback_target: str | None = None) -> str | None:
    explicit_url = _extract_url(prompt)
    if explicit_url:
        return explicit_url

    normalized = _normalize_text(prompt)
    web_intent = any(phrase in normalized for phrase in ["on web", "website", "web site", "on browser", "in browser"])

    target: str | None = None
    match = re.search(r"\bopen\s+([a-z0-9][a-z0-9._-]{1,80})\s+(?:on\s+web|website|web\s+site|in\s+browser)\b", normalized)
    if match:
        target = match.group(1).strip(" .")
    elif web_intent and fallback_target:
        target = fallback_target.strip(" .")

    if not target:
        return None

    target = target.lower()
    if target in WEB_APP_URLS:
        return WEB_APP_URLS[target]

    if "." in target:
        return f"https://{target}" if not target.startswith("http") else target

    return f"https://www.{target}.com"


def _open_browser_target(app_name: str, target_url: str) -> tuple[bool, str]:
    if os.name == "nt" and app_name == "edge":
        try:
            os.startfile(f"microsoft-edge:{target_url}")  # type: ignore[attr-defined]
            return True, f"Opened Edge with {target_url}"
        except Exception:
            pass

    executable = _resolve_executable(app_name)

    if executable:
        try:
            subprocess.Popen([executable, target_url])
            return True, f"Opened {app_name.title()} with {target_url}"
        except Exception:
            pass

    if os.name == "nt":
        try:
            fallback = subprocess.run(
                ["cmd", "/c", "start", "", target_url],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if fallback.returncode == 0:
                return True, f"Opened default browser with {target_url}"
        except Exception:
            pass

    opened = webbrowser.open(target_url, new=2)
    if opened:
        return True, f"Opened default browser with {target_url}"
    return False, f"Could not open browser target: {target_url}"


def _resolve_executable(app_name: str) -> str | None:
    for executable in APP_EXECUTABLES.get(app_name, ()): 
        found = shutil.which(executable)
        if found:
            return found

    dynamic_candidates: list[str] = [app_name]
    if not app_name.lower().endswith(".exe"):
        dynamic_candidates.append(f"{app_name}.exe")

    for candidate in dynamic_candidates:
        found = shutil.which(candidate)
        if found:
            return found

    for absolute_path in BROWSER_WINDOWS_PATHS.get(app_name, ()): 
        if absolute_path.exists():
            return str(absolute_path)

    return None


def _open_whatsapp_fallback() -> tuple[bool, str]:
    try:
        if os.name == "nt":
            os.startfile("whatsapp://")  # type: ignore[attr-defined]
            return True, "Opened WhatsApp"
    except Exception:
        pass

    opened = webbrowser.open("https://web.whatsapp.com", new=2)
    if opened:
        return True, "Opened WhatsApp Web in browser"
    return False, "Could not open WhatsApp app or WhatsApp Web."


def _open_local_application_sync(prompt: str) -> tuple[bool, str, str | None]:
    app_name = _detect_requested_app(prompt)
    if not app_name:
        return (
            False,
            "I could not detect which local app to open. Mention app name like WhatsApp, Chrome, VLC, or Notepad.",
            None,
        )

    web_target_url = _extract_web_target_url(prompt, fallback_target=app_name)
    if web_target_url:
        preferred_browser = _extract_requested_browser(prompt)
        if preferred_browser:
            ok, status = _open_browser_target(preferred_browser, web_target_url)
            if ok:
                return True, f"Opened {preferred_browser.title()} on {web_target_url}.", preferred_browser
            return False, status, preferred_browser

        opened = webbrowser.open(web_target_url, new=2)
        if opened:
            return True, f"Opened web target: {web_target_url}", app_name
        return False, f"Could not open web target: {web_target_url}", app_name

    if app_name == "whatsapp":
        ok, message = _open_whatsapp_fallback()
        return ok, message, app_name

    if app_name in BROWSER_APPS:
        query = _extract_search_query(prompt)
        if query:
            search_url = f"https://www.google.com/search?q={quote_plus(query)}"
            ok, status = _open_browser_target(app_name, search_url)
            if ok:
                return True, f"Opened {app_name.title()} and searched for " + f'"{query}".', app_name
            return False, status, app_name

        direct_url = _extract_url(prompt)
        if direct_url:
            ok, status = _open_browser_target(app_name, direct_url)
            if ok:
                return True, f"Opened {app_name.title()} and navigated to {direct_url}.", app_name
            return False, status, app_name

    executable = _resolve_executable(app_name)
    if not executable:
        if os.name == "nt":
            try:
                # Let Windows resolve registered app aliases for broader app support.
                fallback = subprocess.run(
                    ["cmd", "/c", "start", "", app_name],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                if fallback.returncode == 0:
                    return True, f"Opened {app_name.title()} using Windows app resolver.", app_name
            except Exception:
                pass

        return False, f"{app_name.title()} is not installed or not found in PATH.", app_name

    try:
        subprocess.Popen([executable])
    except Exception as exc:
        return False, f"Failed to open {app_name.title()}: {exc}", app_name

    return True, f"Opened {app_name.title()}.", app_name


async def open_local_application_from_prompt(prompt: str) -> tuple[bool, str, str | None]:
    return await asyncio.to_thread(_open_local_application_sync, prompt)


def _create_local_folder_sync(prompt: str) -> tuple[bool, str, str | None]:
    normalized = prompt.strip()
    if not normalized:
        return False, "Folder prompt was empty.", None

    drive_match = re.search(r"(?:drive|disk)\s*([a-z])\b", normalized, flags=re.IGNORECASE)
    target_drive = f"{drive_match.group(1).upper()}:/" if drive_match else None

    quoted_name = re.search(r"['\"]([a-zA-Z0-9 _-]{2,})['\"]", normalized)
    inferred_name = re.search(r"\b([a-zA-Z0-9_-]{2,})\s+name\b", normalized, flags=re.IGNORECASE)
    after_folder = re.search(r"folder\s+([a-zA-Z0-9_-]{2,})", normalized, flags=re.IGNORECASE)
    folder_name = (
        (quoted_name.group(1) if quoted_name else None)
        or (inferred_name.group(1) if inferred_name else None)
        or (after_folder.group(1) if after_folder else None)
    )

    if not folder_name:
        return False, "Could not detect folder name from request.", None

    base_path = Path(target_drive) if target_drive else Path.home() / "Desktop"
    if not base_path.exists():
        return False, f"Target location not found: {base_path}", None

    folder_path = base_path / folder_name
    if folder_path.exists():
        return True, f"Folder already exists: {folder_path}", str(folder_path)

    try:
        folder_path.mkdir(parents=True, exist_ok=False)
    except Exception as exc:
        return False, f"Failed to create folder: {exc}", None

    return True, f"Created folder at {folder_path}", str(folder_path)


async def create_local_folder_from_prompt(prompt: str) -> tuple[bool, str, str | None]:
    return await asyncio.to_thread(_create_local_folder_sync, prompt)


async def search_local_files(query: str) -> list[dict[str, Any]]:
    if not query.strip():
        return []

    return await asyncio.to_thread(_search_local_files_sync, query)
