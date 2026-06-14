"""Unit tests for analytics aggregations + snapshot recording — no LLM, no network.

Each test points RUNS_DB_PATH at an isolated temp DB so the aggregation layer
reads synthetic rows rather than real run history.
"""
import json
import sqlite3

import pytest


@pytest.fixture
def runs_db(tmp_path, monkeypatch):
    """Isolated runs.db with the schema initialized; returns its path."""
    db_path = tmp_path / "runs.db"
    monkeypatch.setenv("RUNS_DB_PATH", str(db_path))
    from backend.api.persistence import init_runs_db
    init_runs_db()
    return db_path


def _insert_analytics(db_path, **row):
    defaults = {
        "run_id": "RUN-1",
        "scenario_type": "payment",
        "suspected_vendor": "Stripe",
        "severity": "P1",
        "status": "completed",
        "started_at": "2026-06-10 09:00:00",
        "completed_at": "2026-06-10 09:05:00",
        "duration_seconds": 300.0,
        "total_cost_usd": 0.01,
        "agent_costs_json": json.dumps({"Triage": {"cost_usd": 0.01, "input_tokens": 100, "output_tokens": 50}}),
    }
    defaults.update(row)
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute(
            """INSERT OR REPLACE INTO run_analytics
            (run_id, scenario_type, suspected_vendor, severity, status, started_at,
             completed_at, duration_seconds, total_cost_usd, agent_costs_json)
            VALUES (:run_id, :scenario_type, :suspected_vendor, :severity, :status,
             :started_at, :completed_at, :duration_seconds, :total_cost_usd, :agent_costs_json)""",
            defaults,
        )
        conn.commit()
    finally:
        conn.close()


# ─── Empty DB ───────────────────────────────────────────────────────────────


def test_trends_empty_db(runs_db):
    from backend.analytics.aggregations import compute_trends
    out = compute_trends()
    assert out["total_runs"] == 0
    assert out["vendor_frequency"] == []
    assert out["time_of_day"] == [0] * 24


def test_cost_empty_db(runs_db):
    from backend.analytics.aggregations import compute_cost_report
    out = compute_cost_report()
    assert out["total_cost_usd"] == 0.0
    assert out["by_agent"] == []
    assert out["most_expensive_agent"] is None


# ─── Trends ─────────────────────────────────────────────────────────────────


def test_vendor_frequency_ranked(runs_db):
    _insert_analytics(runs_db, run_id="R1", suspected_vendor="Stripe")
    _insert_analytics(runs_db, run_id="R2", suspected_vendor="Stripe")
    _insert_analytics(runs_db, run_id="R3", suspected_vendor="Twilio")
    from backend.analytics.aggregations import compute_trends
    freq = compute_trends()["vendor_frequency"]
    assert freq[0]["vendor"] == "Stripe"
    assert freq[0]["count"] == 2
    assert freq[1]["vendor"] == "Twilio"


def test_failure_rate(runs_db):
    _insert_analytics(runs_db, run_id="R1", suspected_vendor="Stripe", status="completed")
    _insert_analytics(runs_db, run_id="R2", suspected_vendor="Stripe", status="failed")
    from backend.analytics.aggregations import compute_trends
    stripe = next(v for v in compute_trends()["vendor_frequency"] if v["vendor"] == "Stripe")
    assert stripe["failures"] == 1
    assert stripe["failure_rate"] == pytest.approx(0.5)


def test_mttr_by_vendor(runs_db):
    _insert_analytics(runs_db, run_id="R1", suspected_vendor="Stripe", duration_seconds=100.0)
    _insert_analytics(runs_db, run_id="R2", suspected_vendor="Stripe", duration_seconds=300.0)
    from backend.analytics.aggregations import compute_trends
    stripe = next(v for v in compute_trends()["mttr_by_vendor"] if v["vendor"] == "Stripe")
    assert stripe["mean_seconds"] == pytest.approx(200.0)
    assert stripe["count"] == 2


def test_null_vendor_bucketed_unknown(runs_db):
    _insert_analytics(runs_db, run_id="R1", suspected_vendor=None)
    from backend.analytics.aggregations import compute_trends
    vendors = [v["vendor"] for v in compute_trends()["vendor_frequency"]]
    assert "unknown" in vendors


def test_time_of_day_histogram(runs_db):
    _insert_analytics(runs_db, run_id="R1", completed_at="2026-06-10 09:30:00")
    _insert_analytics(runs_db, run_id="R2", completed_at="2026-06-10 09:45:00")
    from backend.analytics.aggregations import compute_trends
    tod = compute_trends()["time_of_day"]
    assert tod[9] == 2
    assert sum(tod) == 2


# ─── Cost ───────────────────────────────────────────────────────────────────


def test_cost_by_agent_ranked(runs_db):
    _insert_analytics(runs_db, run_id="R1", total_cost_usd=0.05,
                      agent_costs_json=json.dumps({
                          "Triage": {"cost_usd": 0.01, "input_tokens": 100, "output_tokens": 50},
                          "RCA": {"cost_usd": 0.04, "input_tokens": 400, "output_tokens": 200},
                      }))
    from backend.analytics.aggregations import compute_cost_report
    out = compute_cost_report()
    assert out["most_expensive_agent"] == "RCA"
    assert out["by_agent"][0]["agent"] == "RCA"
    assert out["total_cost_usd"] == pytest.approx(0.05)
    assert out["run_count"] == 1


def test_cost_aggregates_agent_across_runs(runs_db):
    _insert_analytics(runs_db, run_id="R1", agent_costs_json=json.dumps(
        {"Triage": {"cost_usd": 0.01, "input_tokens": 100, "output_tokens": 50}}))
    _insert_analytics(runs_db, run_id="R2", agent_costs_json=json.dumps(
        {"Triage": {"cost_usd": 0.02, "input_tokens": 200, "output_tokens": 80}}))
    from backend.analytics.aggregations import compute_cost_report
    triage = next(a for a in compute_cost_report()["by_agent"] if a["agent"] == "Triage")
    assert triage["cost_usd"] == pytest.approx(0.03)
    assert triage["input_tokens"] == 300


def test_cost_over_time_buckets_by_day(runs_db):
    _insert_analytics(runs_db, run_id="R1", completed_at="2026-06-10 09:00:00", total_cost_usd=0.01)
    _insert_analytics(runs_db, run_id="R2", completed_at="2026-06-10 18:00:00", total_cost_usd=0.02)
    from backend.analytics.aggregations import compute_cost_report
    series = compute_cost_report()["cost_over_time"]
    day = next(p for p in series if p["date"] == "2026-06-10")
    assert day["cost_usd"] == pytest.approx(0.03)


# ─── Snapshot recording ─────────────────────────────────────────────────────


def test_record_run_analytics_roundtrip(runs_db):
    import backend.utils.cost_tracker as cost_tracker
    from backend.api.persistence import create_run, record_run_analytics
    from backend.analytics.aggregations import compute_cost_report

    state = create_run("payment")

    class _Resp:
        usage_metadata = {"input_tokens": 1000, "output_tokens": 500}
        response_metadata = {}

    cost_tracker.record(state.run_id, "Triage", _Resp(), "openai/gpt-4o-mini")
    try:
        record_run_analytics(state.run_id, {"suspected_vendor": "Stripe", "severity": "P1"}, status="completed")
        out = compute_cost_report()
        assert out["run_count"] == 1
        assert out["most_expensive_agent"] == "Triage"
        assert out["total_cost_usd"] > 0
    finally:
        cost_tracker.clear(state.run_id)
