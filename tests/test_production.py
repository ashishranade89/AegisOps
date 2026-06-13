import os
import pytest

from backend.models.incident_state import ApprovalDecision


def test_approval_decision_valid():
    decision = ApprovalDecision.model_validate(
        {"status": "approved", "judge_name": "QA", "comments": "Looks good."}
    )
    assert decision.status == "approved"


def test_approval_decision_allows_pending_literal():
    """Pending is a valid stored state; resume endpoint rejects it at API layer."""
    decision = ApprovalDecision.model_validate({"status": "pending"})
    assert decision.status == "pending"


def test_resolve_llm_credentials_from_env(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    monkeypatch.setenv("ALLOW_CLIENT_API_KEYS", "false")
    monkeypatch.setenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

    from backend.api.secrets import resolve_llm_credentials

    creds = resolve_llm_credentials({})
    assert creds["openrouter_api_key"] == "sk-test"


def test_resolve_llm_credentials_requires_key(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("ALLOW_CLIENT_API_KEYS", "false")
    monkeypatch.setenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

    from fastapi import HTTPException
    from backend.api.secrets import resolve_llm_credentials

    with pytest.raises(HTTPException) as exc:
        resolve_llm_credentials({})
    assert exc.value.status_code == 400
