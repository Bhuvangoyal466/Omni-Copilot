from __future__ import annotations

import base64
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.config import settings
from db.models import ToolConnection, User, get_db_session

try:
    from cryptography.fernet import Fernet
except Exception:  # pragma: no cover
    Fernet = None  # type: ignore[assignment]


router = APIRouter(prefix="/api/integrations", tags=["integrations"])


@dataclass(frozen=True)
class IntegrationTool:
    id: str
    label: str
    provider: str
    persona: str


@dataclass(frozen=True)
class OAuthProviderConfig:
    provider: str
    authorize_url: str
    token_url: str
    client_id: str
    client_secret: str
    scopes: list[str]


INTEGRATION_TOOLS: list[IntegrationTool] = [
    IntegrationTool(id="gmail", label="Gmail", provider="google", persona="Inbox copilot"),
    IntegrationTool(id="gcal", label="Google Calendar", provider="google", persona="Calendar planner"),
    IntegrationTool(id="gmeet", label="Google Meet", provider="google", persona="Meeting organizer"),
    IntegrationTool(id="gforms", label="Google Forms", provider="google", persona="Forms analyst"),
    IntegrationTool(id="drive", label="Google Drive", provider="google", persona="Knowledge librarian"),
    IntegrationTool(id="github", label="GitHub", provider="github", persona="Code reviewer"),
    IntegrationTool(id="notion", label="Notion", provider="notion", persona="Notes synthesizer"),
    IntegrationTool(id="slack", label="Slack", provider="slack", persona="Channel digest assistant"),
    IntegrationTool(id="discord", label="Discord", provider="discord", persona="Community operations"),
]
TOOL_INDEX = {tool.id: tool for tool in INTEGRATION_TOOLS}

PENDING_OAUTH: dict[str, dict[str, Any]] = {}
STATE_TTL_MINUTES = 15


class IntegrationState(BaseModel):
    id: str
    label: str
    connected: bool
    status: str = "disconnected"
    provider: str
    persona: str
    lastUsed: str | None = None
    authUrl: str | None = None
    error: str | None = None


class ConnectIntegrationRequest(BaseModel):
    userId: str = Field(min_length=1)
    frontendCallbackUrl: str | None = None


class DisconnectIntegrationRequest(BaseModel):
    userId: str = Field(min_length=1)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_user_id(value: str) -> str:
    raw = value.strip().lower()
    if len(raw) <= 64:
        return raw
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return digest[:64]


def _provider_configs() -> dict[str, OAuthProviderConfig]:
    return {
        "google": OAuthProviderConfig(
            provider="google",
            authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
            token_url="https://oauth2.googleapis.com/token",
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
            scopes=[
                "openid",
                "email",
                "profile",
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/gmail.send",
                "https://www.googleapis.com/auth/calendar",
                "https://www.googleapis.com/auth/drive.readonly",
                "https://www.googleapis.com/auth/forms.responses.readonly",
                "https://www.googleapis.com/auth/forms.body",
                "https://www.googleapis.com/auth/meetings.space.created",
            ],
        ),
        "github": OAuthProviderConfig(
            provider="github",
            authorize_url="https://github.com/login/oauth/authorize",
            token_url="https://github.com/login/oauth/access_token",
            client_id=settings.github_client_id,
            client_secret=settings.github_client_secret,
            scopes=["read:user", "repo", "read:org"],
        ),
        "notion": OAuthProviderConfig(
            provider="notion",
            authorize_url="https://api.notion.com/v1/oauth/authorize",
            token_url="https://api.notion.com/v1/oauth/token",
            client_id=settings.notion_client_id,
            client_secret=settings.notion_client_secret,
            scopes=[],
        ),
        "slack": OAuthProviderConfig(
            provider="slack",
            authorize_url="https://slack.com/oauth/v2/authorize",
            token_url="https://slack.com/api/oauth.v2.access",
            client_id=settings.slack_client_id,
            client_secret=settings.slack_client_secret,
            scopes=["channels:read", "channels:history", "chat:write", "users:read", "users:read.email"],
        ),
        "discord": OAuthProviderConfig(
            provider="discord",
            authorize_url="https://discord.com/api/oauth2/authorize",
            token_url="https://discord.com/api/oauth2/token",
            client_id=settings.discord_client_id,
            client_secret=settings.discord_client_secret,
            scopes=["identify", "email", "guilds", "connections"],
        ),
    }


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


def _ensure_user(session: Session, user_id: str) -> User:
    user = session.get(User, user_id)
    if user is not None:
        return user

    email_value = user_id if "@" in user_id else f"{user_id}@omni.local"
    user = User(id=user_id, email=email_value, name=email_value.split("@")[0])
    session.add(user)
    session.flush()
    return user


def _provider_key(provider: str) -> str:
    return f"provider:{provider}"


def _cleanup_expired_pending_states() -> None:
    now = _utc_now()
    expired = [
        state_id
        for state_id, value in PENDING_OAUTH.items()
        if now - value.get("created_at", now) > timedelta(minutes=STATE_TTL_MINUTES)
    ]
    for state_id in expired:
        PENDING_OAUTH.pop(state_id, None)


def _get_provider_connection(session: Session, user_id: str, provider: str) -> ToolConnection | None:
    return (
        session.query(ToolConnection)
        .filter(ToolConnection.user_id == user_id, ToolConnection.tool_name == _provider_key(provider))
        .one_or_none()
    )


def _upsert_tool_status(
    session: Session,
    *,
    user_id: str,
    tool_name: str,
    connected: bool,
    encrypted_token: str | None = None,
) -> ToolConnection:
    existing = (
        session.query(ToolConnection)
        .filter(ToolConnection.user_id == user_id, ToolConnection.tool_name == tool_name)
        .one_or_none()
    )
    if existing is None:
        existing = ToolConnection(
            id=str(uuid4()),
            user_id=user_id,
            tool_name=tool_name,
            connected=connected,
            encrypted_token=encrypted_token,
        )
        session.add(existing)
    else:
        existing.connected = connected
        existing.encrypted_token = encrypted_token
    return existing


def _build_integration_state(
    tool: IntegrationTool,
    *,
    provider_connection: ToolConnection | None,
    auth_url: str | None = None,
    error: str | None = None,
) -> IntegrationState:
    connected = bool(provider_connection and provider_connection.connected)
    status = "connected" if connected else "disconnected"
    if auth_url:
        status = "pending"
    if error:
        status = "error"

    last_used = provider_connection.updated_at.isoformat() if provider_connection else None
    return IntegrationState(
        id=tool.id,
        label=tool.label,
        connected=connected,
        status=status,
        provider=tool.provider,
        persona=tool.persona,
        lastUsed=last_used,
        authUrl=auth_url,
        error=error,
    )


def _build_auth_url(
    *,
    provider_cfg: OAuthProviderConfig,
    redirect_uri: str,
    state: str,
) -> str:
    scope_text = " ".join(provider_cfg.scopes)

    if provider_cfg.provider == "notion":
        params = {
            "owner": "user",
            "client_id": provider_cfg.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "state": state,
        }
        return f"{provider_cfg.authorize_url}?{urlencode(params)}"

    if provider_cfg.provider == "slack":
        params = {
            "client_id": provider_cfg.client_id,
            "redirect_uri": redirect_uri,
            "state": state,
            "scope": scope_text,
        }
        return f"{provider_cfg.authorize_url}?{urlencode(params)}"

    params = {
        "client_id": provider_cfg.client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "state": state,
        "scope": scope_text,
    }
    if provider_cfg.provider == "google":
        params["access_type"] = "offline"
        params["prompt"] = "consent"
        params["include_granted_scopes"] = "true"
    return f"{provider_cfg.authorize_url}?{urlencode(params)}"


def _build_redirect_uri(tool_id: str, request: Request) -> str:
    configured = settings.oauth_redirect_base_url.strip()
    if configured:
        return f"{configured.rstrip('/')}/api/integrations/{tool_id}/callback"
    return str(request.url_for("oauth_callback", tool_id=tool_id))


async def _exchange_code_for_token(
    *,
    provider_cfg: OAuthProviderConfig,
    code: str,
    redirect_uri: str,
) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as client:
        if provider_cfg.provider == "notion":
            auth = base64.b64encode(
                f"{provider_cfg.client_id}:{provider_cfg.client_secret}".encode("utf-8")
            ).decode("utf-8")
            response = await client.post(
                provider_cfg.token_url,
                headers={
                    "Authorization": f"Basic {auth}",
                    "Content-Type": "application/json",
                },
                json={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
                },
            )
        else:
            response = await client.post(
                provider_cfg.token_url,
                headers={"Accept": "application/json"},
                data={
                    "client_id": provider_cfg.client_id,
                    "client_secret": provider_cfg.client_secret,
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
            )

    if response.status_code >= 400:
        raise HTTPException(status_code=400, detail=f"OAuth token exchange failed: {response.text[:300]}")

    payload: dict[str, Any]
    try:
        payload = response.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="OAuth token response was not JSON") from exc

    if payload.get("error"):
        raise HTTPException(status_code=400, detail=f"OAuth error: {payload.get('error')}")
    return payload


@router.get("")
async def list_integrations(
    user_id: str = Query(default="demo-user", min_length=1),
    session: Session = Depends(get_db_session),
) -> list[IntegrationState]:
    user_key = _normalize_user_id(user_id)
    _ensure_user(session, user_key)
    states: list[IntegrationState] = []
    for tool in INTEGRATION_TOOLS:
        provider_row = _get_provider_connection(session, user_key, tool.provider)
        states.append(_build_integration_state(tool, provider_connection=provider_row))
    return states


@router.post("/{tool_id}/connect")
async def connect_tool(
    tool_id: str,
    payload: ConnectIntegrationRequest,
    request: Request,
    session: Session = Depends(get_db_session),
) -> IntegrationState:
    tool = TOOL_INDEX.get(tool_id)
    if tool is None:
        raise HTTPException(status_code=404, detail=f"Unknown integration: {tool_id}")

    provider_cfg = _provider_configs()[tool.provider]
    if not provider_cfg.client_id or not provider_cfg.client_secret:
        raise HTTPException(
            status_code=400,
            detail=f"Missing OAuth credentials for {tool.provider}. Update backend .env.",
        )

    user_key = _normalize_user_id(payload.userId)
    _ensure_user(session, user_key)
    session.commit()

    _cleanup_expired_pending_states()
    state_id = uuid4().hex
    redirect_uri = _build_redirect_uri(tool_id=tool_id, request=request)
    frontend_callback = payload.frontendCallbackUrl or f"{settings.frontend_app_url}/integrations"
    PENDING_OAUTH[state_id] = {
        "tool_id": tool_id,
        "provider": tool.provider,
        "user_id": user_key,
        "redirect_uri": redirect_uri,
        "frontend_callback": frontend_callback,
        "created_at": _utc_now(),
    }

    auth_url = _build_auth_url(provider_cfg=provider_cfg, redirect_uri=redirect_uri, state=state_id)
    provider_row = _get_provider_connection(session, user_key, tool.provider)
    return _build_integration_state(tool, provider_connection=provider_row, auth_url=auth_url)


@router.post("/{tool_id}/disconnect")
async def disconnect_tool(
    tool_id: str,
    payload: DisconnectIntegrationRequest,
    session: Session = Depends(get_db_session),
) -> IntegrationState:
    tool = TOOL_INDEX.get(tool_id)
    if tool is None:
        raise HTTPException(status_code=404, detail=f"Unknown integration: {tool_id}")

    user_key = _normalize_user_id(payload.userId)
    _ensure_user(session, user_key)
    provider_key = _provider_key(tool.provider)

    provider_row = _upsert_tool_status(
        session,
        user_id=user_key,
        tool_name=provider_key,
        connected=False,
        encrypted_token=None,
    )
    for related_tool in INTEGRATION_TOOLS:
        if related_tool.provider == tool.provider:
            _upsert_tool_status(
                session,
                user_id=user_key,
                tool_name=related_tool.id,
                connected=False,
                encrypted_token=None,
            )

    session.commit()
    session.refresh(provider_row)
    return _build_integration_state(tool, provider_connection=provider_row)


@router.get("/{tool_id}/callback", name="oauth_callback")
async def oauth_callback(
    tool_id: str,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    session: Session = Depends(get_db_session),
) -> RedirectResponse:
    pending = PENDING_OAUTH.get(state or "") if state else None
    fallback_redirect = f"{settings.frontend_app_url}/integrations?status=error&reason=invalid_state"

    if pending is None or pending.get("tool_id") != tool_id:
        return RedirectResponse(url=fallback_redirect)

    frontend_callback = str(pending.get("frontend_callback") or f"{settings.frontend_app_url}/integrations")
    provider_name = str(pending.get("provider"))
    user_id = str(pending.get("user_id"))
    redirect_uri = str(pending.get("redirect_uri"))

    PENDING_OAUTH.pop(state or "", None)

    if error:
        redirect_url = f"{frontend_callback}?integration={tool_id}&status=error&reason={error}"
        return RedirectResponse(url=redirect_url)
    if not code:
        redirect_url = f"{frontend_callback}?integration={tool_id}&status=error&reason=missing_code"
        return RedirectResponse(url=redirect_url)

    provider_cfg = _provider_configs().get(provider_name)
    if provider_cfg is None:
        redirect_url = f"{frontend_callback}?integration={tool_id}&status=error&reason=unknown_provider"
        return RedirectResponse(url=redirect_url)

    try:
        token_payload = await _exchange_code_for_token(
            provider_cfg=provider_cfg,
            code=code,
            redirect_uri=redirect_uri,
        )
    except HTTPException as exc:
        reason = str(exc.detail).replace(" ", "_")
        redirect_url = f"{frontend_callback}?integration={tool_id}&status=error&reason={reason}"
        return RedirectResponse(url=redirect_url)

    _ensure_user(session, user_id)
    encrypted_token = _encrypt_token_blob(token_payload)
    provider_row = _upsert_tool_status(
        session,
        user_id=user_id,
        tool_name=_provider_key(provider_name),
        connected=True,
        encrypted_token=encrypted_token,
    )

    for related_tool in INTEGRATION_TOOLS:
        if related_tool.provider == provider_name:
            _upsert_tool_status(
                session,
                user_id=user_id,
                tool_name=related_tool.id,
                connected=True,
                encrypted_token=None,
            )

    session.commit()
    session.refresh(provider_row)
    redirect_url = f"{frontend_callback}?integration={tool_id}&status=connected"
    return RedirectResponse(url=redirect_url)
