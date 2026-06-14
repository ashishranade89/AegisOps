"""Unit tests for monitor severity classification — no I/O, no network."""
import pytest
from backend.monitors.base import classify, WARNING_BATCH_THRESHOLD


@pytest.mark.parametrize("keyword", ["CRITICAL", "FATAL", "ERROR", "EMERG", "ALERT", "CRIT"])
def test_critical_keywords_detected(keyword):
    crit, warn = classify([f"2026-01-01T00:00:00Z [{keyword}] something failed"])
    assert len(crit) == 1
    assert warn == []


@pytest.mark.parametrize("keyword", ["WARN", "WARNING"])
def test_warning_keywords_detected(keyword):
    crit, warn = classify([f"2026-01-01T00:00:00Z [{keyword}] disk usage high"])
    assert crit == []
    assert len(warn) == 1


def test_info_and_debug_lines_ignored():
    crit, warn = classify([
        "2026-01-01T00:00:00Z [INFO] service started",
        "2026-01-01T00:00:00Z [DEBUG] connection pool ready",
    ])
    assert crit == []
    assert warn == []


def test_critical_takes_precedence_over_warning_in_same_line():
    """ERROR appearing before WARNING on one line → classified as critical, not warning."""
    crit, warn = classify(["ERROR WARNING mixed line"])
    assert len(crit) == 1
    assert warn == []


def test_empty_input_returns_empty():
    crit, warn = classify([])
    assert crit == []
    assert warn == []


def test_exactly_at_warning_threshold():
    lines = [f"[WARN] issue {i}" for i in range(WARNING_BATCH_THRESHOLD)]
    _, warn = classify(lines)
    assert len(warn) == WARNING_BATCH_THRESHOLD


def test_below_warning_threshold():
    lines = [f"[WARN] issue {i}" for i in range(WARNING_BATCH_THRESHOLD - 1)]
    _, warn = classify(lines)
    assert len(warn) == WARNING_BATCH_THRESHOLD - 1


def test_mixed_batch_separates_correctly():
    lines = [
        "2026-01-01T00:00:00Z [ERROR] db connection failed",
        "2026-01-01T00:00:00Z [WARN] retry 1",
        "2026-01-01T00:00:00Z [INFO] heartbeat ok",
    ]
    crit, warn = classify(lines)
    assert len(crit) == 1
    assert len(warn) == 1


def test_case_insensitive_matching():
    crit, warn = classify(["error lowercase", "warning lowercase"])
    assert len(crit) == 1
    assert len(warn) == 1
