import pytest
import os


def test_create_jira_incident_dry_run(monkeypatch):
    monkeypatch.setenv("JIRA_DRY_RUN", "true")
    monkeypatch.setenv("JIRA_BASE_URL", "https://test.atlassian.net")
    monkeypatch.setenv("JIRA_EMAIL", "test@test.com")
    monkeypatch.setenv("JIRA_API_TOKEN", "token123")
    monkeypatch.setenv("JIRA_PROJECT_KEY", "OPS")

    from backend.tools.jira_tool import create_jira_incident
    import json

    result = json.loads(create_jira_incident.invoke({
        "incident_id": "INC-001",
        "severity": "sev1",
        "suspected_vendor": "Stripe",
        "internal_findings": "Payment API returning 502",
        "run_url": "http://localhost:5173/run/INC-001"
    }))

    assert result["dry_run"] is True
    assert "ticket_id" in result
    assert "ticket_url" in result
    assert result["ticket_id"].startswith("OPS-")


def test_create_jira_incident_missing_config(monkeypatch):
    monkeypatch.delenv("JIRA_BASE_URL", raising=False)
    monkeypatch.delenv("JIRA_EMAIL", raising=False)
    monkeypatch.delenv("JIRA_API_TOKEN", raising=False)

    from backend.tools.jira_tool import create_jira_incident
    import json

    result = json.loads(create_jira_incident.invoke({
        "incident_id": "INC-001",
        "severity": "sev1",
        "suspected_vendor": "Stripe",
        "internal_findings": "Payment API returning 502",
        "run_url": "http://localhost:5173/run/INC-001"
    }))

    assert result["skipped"] is True


def test_severity_priority_mapping():
    from backend.tools.jira_tool import _severity_to_priority
    assert _severity_to_priority("sev1") == "Critical"
    assert _severity_to_priority("P1") == "Critical"
    assert _severity_to_priority("sev2") == "High"
    assert _severity_to_priority("P2") == "High"
    assert _severity_to_priority("sev3") == "Medium"
    assert _severity_to_priority("sev4") == "Low"
    assert _severity_to_priority("unknown") == "Medium"


def test_update_jira_status_dry_run(monkeypatch):
    monkeypatch.setenv("JIRA_DRY_RUN", "true")
    monkeypatch.setenv("JIRA_BASE_URL", "https://test.atlassian.net")
    monkeypatch.setenv("JIRA_EMAIL", "test@test.com")
    monkeypatch.setenv("JIRA_API_TOKEN", "token123")

    from backend.tools.jira_tool import update_jira_status
    import json

    result = json.loads(update_jira_status.invoke({
        "ticket_id": "OPS-42",
        "status": "In Progress"
    }))
    assert result["dry_run"] is True
    assert result["ticket_id"] == "OPS-42"


def test_add_jira_comment_dry_run(monkeypatch):
    monkeypatch.setenv("JIRA_DRY_RUN", "true")
    monkeypatch.setenv("JIRA_BASE_URL", "https://test.atlassian.net")
    monkeypatch.setenv("JIRA_EMAIL", "test@test.com")
    monkeypatch.setenv("JIRA_API_TOKEN", "token123")

    from backend.tools.jira_tool import add_jira_comment
    import json

    result = json.loads(add_jira_comment.invoke({
        "ticket_id": "OPS-42",
        "comment": "Incident resolved. Root cause: Stripe API outage."
    }))
    assert result["dry_run"] is True
