from __future__ import annotations

import json
import re
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
DATABASE_PATH = DATA_DIR / "omni_copilot.sqlite3"


@dataclass(frozen=True)
class User:
    id: str
    email: str
    name: str | None
    created_at: str


@dataclass(frozen=True)
class ToolConnection:
    id: str
    user_id: str
    tool_name: str
    connected: bool
    encrypted_token: str | None
    updated_at: str


@dataclass(frozen=True)
class AuditLog:
    id: str
    user_id: str | None
    action: str
    metadata_json: str | None
    created_at: str


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    with _connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                name TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tool_connections (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                connected INTEGER NOT NULL DEFAULT 0,
                encrypted_token TEXT,
                updated_at TEXT NOT NULL,
                UNIQUE(user_id, tool_name)
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                action TEXT NOT NULL,
                metadata_json TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS memory_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                text TEXT NOT NULL,
                metadata_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_tool_connections_user_id ON tool_connections(user_id);
            CREATE INDEX IF NOT EXISTS idx_tool_connections_tool_name ON tool_connections(tool_name);
            CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
            CREATE INDEX IF NOT EXISTS idx_memory_entries_user_id ON memory_entries(user_id);
            CREATE INDEX IF NOT EXISTS idx_memory_entries_created_at ON memory_entries(created_at);
            """
        )


@contextmanager
def get_db_connection() -> Iterator[sqlite3.Connection]:
    connection = _connect()
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def _row_to_tool_connection(row: sqlite3.Row | None) -> ToolConnection | None:
    if row is None:
        return None
    return ToolConnection(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        tool_name=str(row["tool_name"]),
        connected=bool(row["connected"]),
        encrypted_token=row["encrypted_token"],
        updated_at=str(row["updated_at"]),
    )


def _normalize_user_id(user_id: str) -> str:
    raw = user_id.strip().lower()
    if len(raw) <= 64:
        return raw
    return raw[:64]


def ensure_user(user_id: str) -> User:
    user_key = _normalize_user_id(user_id)
    email_value = user_key if "@" in user_key else f"{user_key}@omni.local"
    name_value = email_value.split("@")[0]
    created_at = _utc_now()

    with get_db_connection() as connection:
        row = connection.execute("SELECT * FROM users WHERE id = ?", (user_key,)).fetchone()
        if row is None:
            connection.execute(
                """
                INSERT INTO users (id, email, name, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (user_key, email_value, name_value, created_at),
            )
            return User(id=user_key, email=email_value, name=name_value, created_at=created_at)

        return User(
            id=str(row["id"]),
            email=str(row["email"]),
            name=row["name"],
            created_at=str(row["created_at"]),
        )


def get_tool_connection(user_id: str, tool_name: str) -> ToolConnection | None:
    user_key = _normalize_user_id(user_id)
    with get_db_connection() as connection:
        row = connection.execute(
            "SELECT * FROM tool_connections WHERE user_id = ? AND tool_name = ?",
            (user_key, tool_name),
        ).fetchone()
    return _row_to_tool_connection(row)


def upsert_tool_connection(
    *,
    user_id: str,
    tool_name: str,
    connected: bool,
    encrypted_token: str | None = None,
) -> ToolConnection:
    user_key = _normalize_user_id(user_id)
    connection_id = f"{user_key}:{tool_name}"
    updated_at = _utc_now()

    with get_db_connection() as connection:
        connection.execute(
            """
            INSERT INTO tool_connections (id, user_id, tool_name, connected, encrypted_token, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, tool_name) DO UPDATE SET
                connected = excluded.connected,
                encrypted_token = excluded.encrypted_token,
                updated_at = excluded.updated_at
            """,
            (connection_id, user_key, tool_name, int(connected), encrypted_token, updated_at),
        )

        row = connection.execute(
            "SELECT * FROM tool_connections WHERE user_id = ? AND tool_name = ?",
            (user_key, tool_name),
        ).fetchone()

    result = _row_to_tool_connection(row)
    if result is None:
        raise RuntimeError("Failed to persist tool connection")
    return result


def list_tool_connections(user_id: str) -> list[ToolConnection]:
    user_key = _normalize_user_id(user_id)
    with get_db_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM tool_connections WHERE user_id = ? ORDER BY tool_name ASC",
            (user_key,),
        ).fetchall()
    return [connection for row in rows if (connection := _row_to_tool_connection(row)) is not None]


def store_audit_log(action: str, *, user_id: str | None = None, metadata: dict[str, Any] | None = None) -> None:
    with get_db_connection() as connection:
        connection.execute(
            """
            INSERT INTO audit_logs (id, user_id, action, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                datetime.now(timezone.utc).timestamp().__str__(),
                user_id.strip().lower() if user_id else None,
                action,
                json.dumps(metadata or {}, ensure_ascii=True),
                _utc_now(),
            ),
        )


def store_memory_entry(user_id: str, text: str, metadata: dict[str, Any] | None = None) -> None:
    user_key = _normalize_user_id(user_id)
    now = _utc_now()
    with get_db_connection() as connection:
        connection.execute(
            """
            INSERT INTO memory_entries (user_id, text, metadata_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_key, text.strip(), json.dumps(metadata or {}, ensure_ascii=True), now, now),
        )


def _tokenize(value: str) -> list[str]:
    return [token for token in re.findall(r"[a-z0-9]+", value.lower()) if len(token) > 1]


def search_memory_entries(query: str, *, user_id: str | None = None, limit: int = 5) -> list[dict[str, Any]]:
    normalized_query = query.strip().lower()
    query_tokens = _tokenize(normalized_query)

    with get_db_connection() as connection:
        if user_id:
            rows = connection.execute(
                """
                SELECT id, user_id, text, metadata_json, created_at, updated_at
                FROM memory_entries
                WHERE user_id = ?
                ORDER BY id DESC
                LIMIT 200
                """,
                (_normalize_user_id(user_id),),
            ).fetchall()
        else:
            rows = connection.execute(
                """
                SELECT id, user_id, text, metadata_json, created_at, updated_at
                FROM memory_entries
                ORDER BY id DESC
                LIMIT 200
                """
            ).fetchall()

    scored_rows: list[tuple[int, dict[str, Any]]] = []
    for row in rows:
        text = str(row["text"] or "")
        metadata_json = row["metadata_json"]
        combined = f"{text} {metadata_json or ''}".lower()
        score = 0

        if not normalized_query:
            score = 1
        elif normalized_query in combined:
            score += 20

        for token in query_tokens:
            if token in combined:
                score += 3

        if score <= 0:
            continue

        metadata: dict[str, Any] = {}
        if isinstance(metadata_json, str) and metadata_json:
            try:
                parsed = json.loads(metadata_json)
                if isinstance(parsed, dict):
                    metadata = parsed
            except Exception:
                metadata = {}

        scored_rows.append(
            (
                score,
                {
                    "id": row["id"],
                    "user_id": row["user_id"],
                    "text": text,
                    "metadata": metadata,
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                    "score": score,
                },
            )
        )

    scored_rows.sort(key=lambda item: (item[0], str(item[1]["created_at"])), reverse=True)
    return [item[1] for item in scored_rows[:limit]]

