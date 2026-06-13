"""
LLM Cost Tracker — accumulates token usage and USD cost per agent per run.
OpenRouter public pricing as of 2025-06.
"""
from __future__ import annotations
import threading

# Per 1M tokens: (input_cost_usd, output_cost_usd)
_PRICING: dict[str, tuple[float, float]] = {
    "openai/gpt-4o":               (2.50,  10.00),
    "openai/gpt-4o-mini":          (0.15,   0.60),
    "anthropic/claude-3.5-sonnet": (3.00,  15.00),
    "anthropic/claude-3-haiku":    (0.25,   1.25),
    "google/gemini-2.5-flash":     (0.15,   0.60),
    "google/gemini-2.0-flash":     (0.10,   0.40),
    "deepseek/deepseek-chat":      (0.27,   1.10),
}
_DEFAULT_PRICING = (1.00, 3.00)

# {run_id: {agent_name: {input_tokens, output_tokens, cost_usd}}}
_store: dict[str, dict[str, dict]] = {}
_lock = threading.Lock()


def _get_price(model: str | None) -> tuple[float, float]:
    for key, price in _PRICING.items():
        if key in (model or ""):
            return price
    return _DEFAULT_PRICING


def record(run_id: str, agent_name: str, response, model: str | None) -> dict:
    """Extract token usage from a LangChain AIMessage and accumulate cost.
    Returns a cost_update SSE payload dict."""
    input_tokens = 0
    output_tokens = 0

    # LangChain >= 0.2: response.usage_metadata
    usage = getattr(response, "usage_metadata", None)
    if isinstance(usage, dict):
        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)
    else:
        meta = getattr(response, "response_metadata", {}) or {}
        tu = meta.get("token_usage") or meta.get("usage") or {}
        input_tokens = tu.get("prompt_tokens", 0) or tu.get("input_tokens", 0)
        output_tokens = tu.get("completion_tokens", 0) or tu.get("output_tokens", 0)

    in_price, out_price = _get_price(model)
    cost_usd = (input_tokens * in_price + output_tokens * out_price) / 1_000_000

    with _lock:
        if run_id not in _store:
            _store[run_id] = {}
        prev = _store[run_id].get(agent_name, {"input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0})
        _store[run_id][agent_name] = {
            "input_tokens":  prev["input_tokens"]  + input_tokens,
            "output_tokens": prev["output_tokens"] + output_tokens,
            "cost_usd":      prev["cost_usd"]      + cost_usd,
        }
        run_total = sum(v["cost_usd"] for v in _store[run_id].values())

    return {
        "agent_name":    agent_name,
        "input_tokens":  input_tokens,
        "output_tokens": output_tokens,
        "cost_usd":      round(cost_usd, 6),
        "run_total_usd": round(run_total, 6),
    }


def get_total(run_id: str) -> float:
    with _lock:
        return sum(v["cost_usd"] for v in _store.get(run_id, {}).values())


def get_summary(run_id: str) -> dict:
    with _lock:
        agents = _store.get(run_id, {})
        return {
            "agents":    {k: dict(v) for k, v in agents.items()},
            "total_usd": round(sum(v["cost_usd"] for v in agents.values()), 6),
        }


def clear(run_id: str) -> None:
    with _lock:
        _store.pop(run_id, None)
