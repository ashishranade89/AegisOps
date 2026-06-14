"""SQLite CRUD for monitor configs (stored alongside runs in runs.db)."""
import sqlite3
import uuid
from datetime import datetime, timezone

from backend.utils.config import get_config

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS monitors (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,
    host            TEXT,
    port            INTEGER,
    log_path        TEXT,
    scan_interval   INTEGER NOT NULL DEFAULT 60,
    credentials_enc TEXT,
    byte_offset     INTEGER NOT NULL DEFAULT 0,
    enabled         INTEGER NOT NULL DEFAULT 1,
    auto_remediate  INTEGER NOT NULL DEFAULT 0,
    last_scanned_at TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
)
"""

_VALID_TYPES = {"ssh", "syslog_udp", "syslog_tcp", "local"}
_ALLOWED_UPDATES = {"name", "host", "port", "log_path", "scan_interval", "credentials_enc", "enabled", "auto_remediate"}


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(str(get_config().runs_db_path), check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def init_monitors_db() -> None:
    with _conn() as c:
        c.execute(_CREATE_TABLE)
        # Non-destructive migration for existing tables
        try:
            c.execute("ALTER TABLE monitors ADD COLUMN auto_remediate INTEGER NOT NULL DEFAULT 0")
        except sqlite3.OperationalError:
            pass  # column already exists
        c.commit()


def create_monitor(data: dict) -> dict:
    if data.get("type") not in _VALID_TYPES:
        raise ValueError(f"type must be one of {sorted(_VALID_TYPES)}")
    mid = f"MON-{uuid.uuid4().hex[:8].upper()}"
    with _conn() as c:
        c.execute(
            """INSERT INTO monitors
               (id, name, type, host, port, log_path, scan_interval, credentials_enc, enabled, auto_remediate)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                mid,
                data["name"],
                data["type"],
                data.get("host"),
                data.get("port"),
                data.get("log_path"),
                int(data.get("scan_interval", 60)),
                data.get("credentials_enc"),
                1 if data.get("enabled", True) else 0,
                1 if data.get("auto_remediate", False) else 0,
            ),
        )
        c.commit()
    return get_monitor(mid)


def list_monitors() -> list[dict]:
    with _conn() as c:
        return [dict(r) for r in c.execute("SELECT * FROM monitors ORDER BY created_at DESC")]


def get_monitor(mid: str) -> dict | None:
    with _conn() as c:
        r = c.execute("SELECT * FROM monitors WHERE id = ?", (mid,)).fetchone()
        return dict(r) if r else None


def update_monitor(mid: str, data: dict) -> dict | None:
    fields = {k: v for k, v in data.items() if k in _ALLOWED_UPDATES}
    if not fields:
        return get_monitor(mid)
    clause = ", ".join(f"{k} = ?" for k in fields)
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as c:
        c.execute(
            f"UPDATE monitors SET {clause}, updated_at = ? WHERE id = ?",
            [*fields.values(), now, mid],
        )
        c.commit()
    return get_monitor(mid)


def delete_monitor(mid: str) -> bool:
    with _conn() as c:
        cur = c.execute("DELETE FROM monitors WHERE id = ?", (mid,))
        c.commit()
        return cur.rowcount > 0


def update_offset(mid: str, offset: int) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as c:
        c.execute(
            "UPDATE monitors SET byte_offset = ?, last_scanned_at = ?, updated_at = ? WHERE id = ?",
            (offset, now, now, mid),
        )
        c.commit()


def set_enabled(mid: str, enabled: bool) -> None:
    with _conn() as c:
        c.execute(
            "UPDATE monitors SET enabled = ?, updated_at = ? WHERE id = ?",
            (1 if enabled else 0, datetime.now(timezone.utc).isoformat(), mid),
        )
        c.commit()
