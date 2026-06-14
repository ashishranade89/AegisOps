"""
Analytics aggregations over the ``run_analytics`` table (pandas + numpy).

Pure read/aggregate layer: load the snapshot table into a DataFrame and derive
incident trends and cost reports. All functions return plain, JSON-serializable
dicts and degrade gracefully on an empty database (zeros/empty lists, never a 500).
"""
from __future__ import annotations

import json
import logging
import sqlite3

import numpy as np
import pandas as pd

from backend.utils.config import get_config

logger = logging.getLogger(__name__)

_UNKNOWN_VENDOR = "unknown"


def _load_df() -> pd.DataFrame:
    """Load the full run_analytics table into a DataFrame.

    Returns an empty (but correctly-columned) frame if the table is missing
    or has no rows."""
    columns = [
        "run_id", "scenario_type", "suspected_vendor", "severity", "status",
        "started_at", "completed_at", "duration_seconds", "total_cost_usd",
        "agent_costs_json",
    ]
    conn = sqlite3.connect(str(get_config().runs_db_path), check_same_thread=False)
    try:
        df = pd.read_sql("SELECT * FROM run_analytics", conn)
    except Exception as e:  # table may not exist yet
        logger.warning("run_analytics not readable (%s); returning empty frame.", e)
        return pd.DataFrame(columns=columns)
    finally:
        conn.close()

    if df.empty:
        return pd.DataFrame(columns=columns)

    df["suspected_vendor"] = df["suspected_vendor"].fillna(_UNKNOWN_VENDOR).replace("", _UNKNOWN_VENDOR)
    df["completed_at"] = pd.to_datetime(df["completed_at"], errors="coerce", utc=True)
    df["started_at"] = pd.to_datetime(df["started_at"], errors="coerce", utc=True)
    df["duration_seconds"] = pd.to_numeric(df["duration_seconds"], errors="coerce")
    df["total_cost_usd"] = pd.to_numeric(df["total_cost_usd"], errors="coerce").fillna(0.0)
    return df


# ─── Incident Trends ────────────────────────────────────────────────────────


def compute_trends() -> dict:
    """Vendor failure frequency, MTTR per vendor, time-of-day histogram, failure rate."""
    df = _load_df()
    if df.empty:
        return {
            "total_runs": 0,
            "vendor_frequency": [],
            "mttr_by_vendor": [],
            "time_of_day": [0] * 24,
            "overall_mttr_seconds": {"mean": 0.0, "median": 0.0, "std": 0.0},
        }

    # Vendor frequency + failure rate (ranked desc).
    grp = df.groupby("suspected_vendor")
    is_failed = df["status"].eq("failed")
    vendor_frequency = []
    for vendor, idx in grp.groups.items():
        sub = df.loc[idx]
        failures = int(is_failed.loc[idx].sum())
        count = int(len(sub))
        vendor_frequency.append({
            "vendor": vendor,
            "count": count,
            "failures": failures,
            "failure_rate": round(failures / count, 4) if count else 0.0,
        })
    vendor_frequency.sort(key=lambda r: r["count"], reverse=True)

    # MTTR per vendor (mean/median/count) over rows with a known duration.
    dur = df.dropna(subset=["duration_seconds"])
    mttr_by_vendor = []
    if not dur.empty:
        agg = dur.groupby("suspected_vendor")["duration_seconds"].agg(["mean", "median", "count"])
        for vendor, row in agg.iterrows():
            mttr_by_vendor.append({
                "vendor": vendor,
                "mean_seconds": round(float(row["mean"]), 2),
                "median_seconds": round(float(row["median"]), 2),
                "count": int(row["count"]),
            })
        mttr_by_vendor.sort(key=lambda r: r["mean_seconds"], reverse=True)

    # Time-of-day histogram over 24 buckets (numpy bincount on completed hour).
    hours = df["completed_at"].dropna().dt.hour.to_numpy()
    time_of_day = np.bincount(hours, minlength=24)[:24].astype(int).tolist() if hours.size else [0] * 24

    # Overall MTTR stats via numpy.
    durations = dur["duration_seconds"].to_numpy()
    overall = (
        {
            "mean": round(float(np.mean(durations)), 2),
            "median": round(float(np.median(durations)), 2),
            "std": round(float(np.std(durations)), 2),
        }
        if durations.size
        else {"mean": 0.0, "median": 0.0, "std": 0.0}
    )

    return {
        "total_runs": int(len(df)),
        "vendor_frequency": vendor_frequency,
        "mttr_by_vendor": mttr_by_vendor,
        "time_of_day": time_of_day,
        "overall_mttr_seconds": overall,
    }


# ─── Cost Reporting ─────────────────────────────────────────────────────────


def _explode_agent_costs(df: pd.DataFrame) -> pd.DataFrame:
    """Long-form frame: one row per (run, agent) from agent_costs_json."""
    records: list[dict] = []
    for _, row in df.iterrows():
        try:
            agents = json.loads(row["agent_costs_json"] or "{}")
        except (json.JSONDecodeError, TypeError):
            agents = {}
        for agent, vals in agents.items():
            records.append({
                "run_id": row["run_id"],
                "completed_at": row["completed_at"],
                "agent": agent,
                "cost_usd": float(vals.get("cost_usd", 0.0) or 0.0),
                "input_tokens": int(vals.get("input_tokens", 0) or 0),
                "output_tokens": int(vals.get("output_tokens", 0) or 0),
            })
    return pd.DataFrame(records)


def compute_cost_report(window_days: int = 30) -> dict:
    """Per-agent cost totals, daily cost trend, and headline numbers over a window."""
    df = _load_df()
    empty = {
        "window_days": window_days,
        "total_cost_usd": 0.0,
        "run_count": 0,
        "avg_cost_per_run": 0.0,
        "most_expensive_agent": None,
        "by_agent": [],
        "cost_over_time": [],
    }
    if df.empty:
        return empty

    if window_days and window_days > 0:
        cutoff = pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=window_days)
        df = df[df["completed_at"].isna() | (df["completed_at"] >= cutoff)]
    if df.empty:
        return empty

    run_count = int(len(df))
    total_cost = float(df["total_cost_usd"].sum())
    avg_cost = round(total_cost / run_count, 6) if run_count else 0.0

    agents_df = _explode_agent_costs(df)
    by_agent = []
    most_expensive_agent = None
    if not agents_df.empty:
        agg = agents_df.groupby("agent")[["cost_usd", "input_tokens", "output_tokens"]].sum()
        agg = agg.sort_values("cost_usd", ascending=False)
        for agent, row in agg.iterrows():
            by_agent.append({
                "agent": agent,
                "cost_usd": round(float(row["cost_usd"]), 6),
                "input_tokens": int(row["input_tokens"]),
                "output_tokens": int(row["output_tokens"]),
            })
        if by_agent:
            most_expensive_agent = by_agent[0]["agent"]

    # Daily cost trend (resample on completed_at).
    cost_over_time = []
    timed = df.dropna(subset=["completed_at"])
    if not timed.empty:
        daily = (
            timed.set_index("completed_at")["total_cost_usd"]
            .resample("D")
            .sum()
        )
        cost_over_time = [
            {"date": ts.strftime("%Y-%m-%d"), "cost_usd": round(float(val), 6)}
            for ts, val in daily.items()
        ]

    return {
        "window_days": window_days,
        "total_cost_usd": round(total_cost, 6),
        "run_count": run_count,
        "avg_cost_per_run": avg_cost,
        "most_expensive_agent": most_expensive_agent,
        "by_agent": by_agent,
        "cost_over_time": cost_over_time,
    }
