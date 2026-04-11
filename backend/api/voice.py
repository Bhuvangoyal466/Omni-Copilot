from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from core.voice import detect_language, synthesize_speech_with_groq


router = APIRouter(prefix="/api/voice", tags=["voice"])


class TtsRequest(BaseModel):
    text: str = Field(min_length=1)
    language: str | None = None
    voiceGender: str | None = None


@router.post("/tts")
async def tts(payload: TtsRequest) -> dict:
    result = await synthesize_speech_with_groq(
        payload.text,
        language=payload.language or detect_language(payload.text),
        voice_gender=payload.voiceGender,
    )

    if not result.get("ok"):
        return {
            "ok": False,
            "error": result.get("error", "Unknown TTS error"),
            "fallback": "browser-speech-synthesis",
        }

    return {
        "ok": True,
        "provider": result.get("provider"),
        "model": result.get("model"),
        "voice": result.get("voice"),
        "language": result.get("language"),
        "mimeType": result.get("mime_type"),
        "audioBase64": result.get("audio_base64"),
    }
