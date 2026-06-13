"""Unit tests for cost_tracker — no LLM calls, no I/O."""
import pytest
import backend.utils.cost_tracker as cost_tracker

_RUN = "run-test"
_RUN_A = "run-a"
_RUN_B = "run-b"


class _MockResponse:
    """AIMessage stand-in with usage_metadata (LangChain >= 0.2 path)."""
    def __init__(self, input_tokens: int, output_tokens: int):
        self.usage_metadata = {"input_tokens": input_tokens, "output_tokens": output_tokens}
        self.response_metadata = {}


class _MockResponseFallback:
    """AIMessage stand-in using response_metadata (LangChain < 0.2 path)."""
    def __init__(self, input_tokens: int, output_tokens: int):
        self.usage_metadata = None
        self.response_metadata = {
            "token_usage": {"prompt_tokens": input_tokens, "completion_tokens": output_tokens}
        }


class _NoUsage:
    usage_metadata = None
    response_metadata = {}


@pytest.fixture(autouse=True)
def _clear():
    yield
    for rid in (_RUN, _RUN_A, _RUN_B):
        cost_tracker.clear(rid)


def test_record_returns_correct_token_counts():
    info = cost_tracker.record(_RUN, "Triage", _MockResponse(100, 50), "google/gemini-2.5-flash")
    assert info["input_tokens"] == 100
    assert info["output_tokens"] == 50


def test_record_computes_nonzero_cost_for_known_model():
    info = cost_tracker.record(_RUN, "Triage", _MockResponse(1_000_000, 0), "openai/gpt-4o-mini")
    assert info["cost_usd"] == pytest.approx(0.15, rel=1e-3)


def test_record_fallback_response_metadata():
    cost_tracker.record(_RUN, "RCA", _MockResponseFallback(200, 80), "openai/gpt-4o-mini")
    summary = cost_tracker.get_summary(_RUN)
    assert summary["agents"]["RCA"]["input_tokens"] == 200
    assert summary["agents"]["RCA"]["output_tokens"] == 80


def test_record_no_usage_returns_zero_cost():
    cost_tracker.record(_RUN, "Agent", _NoUsage(), None)
    assert cost_tracker.get_total(_RUN) == 0.0


def test_same_agent_called_twice_accumulates():
    cost_tracker.record(_RUN, "Triage", _MockResponse(100, 50), None)
    cost_tracker.record(_RUN, "Triage", _MockResponse(100, 50), None)
    summary = cost_tracker.get_summary(_RUN)
    assert summary["agents"]["Triage"]["input_tokens"] == 200
    assert summary["agents"]["Triage"]["output_tokens"] == 100


def test_get_summary_includes_all_agents():
    cost_tracker.record(_RUN, "Triage", _MockResponse(100, 40), "google/gemini-2.5-flash")
    cost_tracker.record(_RUN, "RCA", _MockResponse(200, 80), "google/gemini-2.5-flash")
    cost_tracker.record(_RUN, "Reporter", _MockResponse(300, 120), "google/gemini-2.5-flash")
    summary = cost_tracker.get_summary(_RUN)
    assert set(summary["agents"].keys()) == {"Triage", "RCA", "Reporter"}


def test_get_summary_total_equals_sum_of_agents():
    cost_tracker.record(_RUN, "Triage", _MockResponse(100, 40), "google/gemini-2.5-flash")
    cost_tracker.record(_RUN, "RCA", _MockResponse(200, 80), "google/gemini-2.5-flash")
    summary = cost_tracker.get_summary(_RUN)
    expected = sum(a["cost_usd"] for a in summary["agents"].values())
    assert summary["total_usd"] == pytest.approx(expected)


def test_run_total_in_record_matches_get_total():
    cost_tracker.record(_RUN, "Triage", _MockResponse(100, 40), "google/gemini-2.5-flash")
    info = cost_tracker.record(_RUN, "RCA", _MockResponse(200, 80), "google/gemini-2.5-flash")
    assert info["run_total_usd"] == pytest.approx(cost_tracker.get_total(_RUN))


def test_runs_are_isolated():
    cost_tracker.record(_RUN_A, "Triage", _MockResponse(100, 40), None)
    cost_tracker.record(_RUN_B, "Triage", _MockResponse(999, 999), None)
    assert cost_tracker.get_summary(_RUN_A)["agents"].get("Triage", {}).get("input_tokens") == 100
    assert cost_tracker.get_summary(_RUN_B)["agents"].get("Triage", {}).get("input_tokens") == 999


def test_clear_removes_run():
    cost_tracker.record(_RUN, "Triage", _MockResponse(100, 40), None)
    cost_tracker.clear(_RUN)
    assert cost_tracker.get_total(_RUN) == 0.0
    assert cost_tracker.get_summary(_RUN)["agents"] == {}
