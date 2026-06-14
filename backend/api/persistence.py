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
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS run_analytics (
                run_id TEXT PRIMARY KEY,
                scenario_type TEXT,
                suspected_vendor TEXT,
                severity TEXT,
                status TEXT,
                started_at TEXT,
                completed_at TEXT,
                duration_seconds REAL,
                total_cost_usd REAL,
                agent_costs_json TEXT
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def record_run_analytics(run_id: str, result: dict | None, status: str) -> None:
    """Persist a structured analytics snapshot for a finished run.

    Pulls vendor/severity from the final graph ``result`` and cost from the
    in-memory cost tracker (must be called before the tracker is cleared).
    ``started_at`` is read from the canonical runs.created_at so MTTR reflects
    the full incident lifetime across pause/resume. Idempotent via REPLACE.
    """
    from backend.utils import cost_tracker

    result = result or {}
    cost = cost_tracker.get_summary(run_id)
    agent_costs = cost.get("agents", {})
    total_cost_usd = cost.get("total_usd", 0.0)

    conn = _connect()
    try:
        row = conn.execute(
            "SELECT created_at, scenario_type FROM runs WHERE run_id = ?", (run_id,)
        ).fetchone()
        started_at = row["created_at"] if row else None
        scenario_type = row["scenario_type"] if row else None

        # duration_seconds = completed_at - started_at, computed in SQLite (UTC).
        duration_row = conn.execute(
            "SELECT (julianday('now') - julianday(?)) * 86400.0 AS secs", (started_at,)
        ).fetchone()
        duration_seconds = duration_row["secs"] if started_at else None

        conn.execute(
            """
            INSERT OR REPLACE INTO run_analytics (
                run_id, scenario_type, suspected_vendor, severity, status,
                started_at, completed_at, duration_seconds, total_cost_usd, agent_costs_json
            ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
            """,
            (
                run_id,
                scenario_type,
                result.get("suspected_vendor"),
                result.get("severity"),
                status,
                started_at,
                duration_seconds,
                total_cost_usd,
                json.dumps(agent_costs),
            ),
        )
        conn.commit()
        logger.info(
            "Recorded run_analytics: run_id=%s status=%s vendor=%s cost=%.6f",
            run_id, status, result.get("suspected_vendor"), total_cost_usd,
        )
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
