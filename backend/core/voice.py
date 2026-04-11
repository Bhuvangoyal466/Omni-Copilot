from __future__ import annotations

import base64
import re
from typing import Any

import httpx

from core.config import settings


def detect_language(text: str) -> str:
    cleaned = text.strip()
    if re.search(r"[\u0900-\u097F]", cleaned):
        return "hi"

    lowered = cleaned.lower()
    tokens = re.findall(r"[a-zA-Z]+", lowered)
    hindi_markers = ["hai", "kya", "kar", "kr", "mera", "mujhe", "beta", "nahi", "haan"]
    if sum(1 for token in tokens if token in hindi_markers) >= 2:
        return "hi"
    return "en"


def _pick_voice(*, language: str, voice_gender: str | None) -> str:
    normalized_gender = (voice_gender or "").strip().lower()
    is_hindi = language.startswith("hi")

    if is_hindi:
        if normalized_gender == "male" and settings.groq_tts_voice_hi_male.strip():
            return settings.groq_tts_voice_hi_male.strip()
        if normalized_gender == "female" and settings.groq_tts_voice_hi_female.strip():
            return settings.groq_tts_voice_hi_female.strip()
        return settings.groq_tts_voice_hi

    if normalized_gender == "male" and settings.groq_tts_voice_en_male.strip():
        return settings.groq_tts_voice_en_male.strip()
    if normalized_gender == "female" and settings.groq_tts_voice_en_female.strip():
        return settings.groq_tts_voice_en_female.strip()
    return settings.groq_tts_voice_en


async def synthesize_speech_with_groq(
    text: str,
    *,
    language: str | None = None,
    voice_gender: str | None = None,
) -> dict[str, Any]:
    if not text.strip():
        return {"ok": False, "error": "Text is empty."}

    if not settings.groq_api_key:
        return {"ok": False, "error": "Missing GROQ_API_KEY in backend env."}

    lang = (language or detect_language(text)).strip().lower()
    selected_voice = _pick_voice(language=lang, voice_gender=voice_gender)
    default_voice = settings.groq_tts_voice_hi if lang.startswith("hi") else settings.groq_tts_voice_en

    payload = {
        "model": settings.groq_tts_model,
        "voice": selected_voice,
        "input": text,
        "response_format": "mp3",
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/audio/speech",
                headers={
                    "Authorization": f"Bearer {settings.groq_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except Exception as exc:
        return {"ok": False, "error": f"Groq TTS request failed: {exc}"}

    if response.status_code >= 400 and selected_voice != default_voice:
        retry_payload = {
            **payload,
            "voice": default_voice,
        }
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/audio/speech",
                headers={
                    "Authorization": f"Bearer {settings.groq_api_key}",
                    "Content-Type": "application/json",
                },
                json=retry_payload,
            )
        if response.status_code < 400:
            selected_voice = default_voice

    if response.status_code >= 400:
        return {
            "ok": False,
            "error": f"Groq TTS failed ({response.status_code}): {response.text[:300]}",
        }

    audio_bytes = response.content
    if not audio_bytes:
        return {"ok": False, "error": "Groq TTS returned empty audio."}

    return {
        "ok": True,
        "provider": "groq",
        "model": settings.groq_tts_model,
        "voice": selected_voice,
        "language": lang,
        "mime_type": "audio/mpeg",
        "audio_base64": base64.b64encode(audio_bytes).decode("ascii"),
    }
