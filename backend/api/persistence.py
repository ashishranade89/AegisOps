import asyncio
import json
import logging
import sqlite3
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from backend.utils.config import get_config

logger = logging.getLogger(__name__)


@dataclass
class RunState:
    run_id: str
    scenario_type: str
    status: str = "pending"
    report: str = ""
    current_phase: str = "triage"
    queue: asyncio.Queue = field(default_factory=asyncio.Queue)


def _connect() -> sqlite3.Connection:
    path = get_config().runs_db_path
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_runs_db() -> None:
    conn = _connect()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS runs (
                run_id TEXT PRIMARY KEY,
                scenario_type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                report TEXT NOT NULL DEFAULT '',
                current_phase TEXT NOT NULL DEFAULT 'triage',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def create_run(scenario_type: str) -> RunState:
    run_id = f"RUN-{uuid.uuid4().hex[:8].upper()}"
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO runs (run_id, scenario_type, status) VALUES (?, ?, 'pending')",
            (run_id, scenario_type),
        )
        conn.commit()
    finally:
        conn.close()

    state = RunState(run_id=run_id, scenario_type=scenario_type)
    _active[run_id] = state
    logger.info("Created run: run_id=%s, scenario_type=%s", run_id, scenario_type)
    return state


_active: dict[str, RunState] = {}


def _hydrate(row: sqlite3.Row) -> RunState:
    state = RunState(
        run_id=row["run_id"],
        scenario_type=row["scenario_type"],
        status=row["status"],
        report=row["report"] or "",
        current_phase=row["current_phase"] or "triage",
    )
    _active[row["run_id"]] = state
    return state


def get_run(run_id: str) -> RunState | None:
    if run_id in _active:
        return _active[run_id]

    conn = _connect()
    try:
        row = conn.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
        if row is None:
            return None
        return _hydrate(row)
    finally:
        conn.close()


def persist_run(state: RunState) -> None:
    conn = _connect()
    try:
        conn.execute(
            """
            UPDATE runs
            SET status = ?, report = ?, current_phase = ?, updated_at = datetime('now')
            WHERE run_id = ?
            """,
            (state.status, state.report, state.current_phase, state.run_id),
        )
        conn.commit()
    finally:
        conn.close()
