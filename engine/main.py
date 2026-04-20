from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.chat import router as chat_router
from api.integrations import router as integrations_router
from api.memory import router as memory_router
from api.voice import router as voice_router
from core.config import settings
from db.models import initialize_database

app = FastAPI(title="Horizon Desk API", version="0.1.0")


@app.on_event("startup")
async def on_startup() -> None:
    initialize_database()


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(chat_router)
app.include_router(integrations_router)
app.include_router(memory_router)
app.include_router(voice_router)
