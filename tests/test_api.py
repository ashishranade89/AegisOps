import hashlib
import hmac
import json
import time
import urllib.parse
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
async def client():
    from backend.api.app import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "llm_configured" in body


@pytest.mark.asyncio
async def test_start_incident_requires_scenario(client):
    response = await client.post("/api/incident", json={})
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_incident_routes_do_not_require_api_key_header(client, monkeypatch):
    monkeypatch.setenv("INCIDENT_API_KEY", "secret-test-key")

    response = await client.get("/api/incident/scenarios")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_stop_incident_sets_failed_status(client, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test")
    monkeypatch.setenv("ALLOW_CLIENT_API_KEYS", "true")
    response = await client.post(
        "/api/incident",
        json={"scenario_type": "stripe_outage", "openrouter_api_key": "sk-test"}
    )
    assert response.status_code == 200
    run_id = response.json()["run_id"]

    stop_resp = await client.post(f"/api/incident/{run_id}/stop")
    assert stop_resp.status_code == 200
    assert stop_resp.json()["status"] == "stopped"

    get_resp = await client.get(f"/api/incident/{run_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["status"] == "failed"


def _slack_signature(secret: str, body: str) -> tuple[str, str]:
    """Returns (timestamp, X-Slack-Signature) for a test request body."""
    ts = str(int(time.time()))
    sig_base = f"v0:{ts}:{body}"
    sig = "v0=" + hmac.new(secret.encode(), sig_base.encode(), hashlib.sha256).hexdigest()
    return ts, sig


@pytest.mark.asyncio
async def test_slack_action_missing_payload(client):
    response = await client.post("/api/slack/action", content="", headers={
        "Content-Type": "application/x-www-form-urlencoded"
    })
    # No actions in payload → returns empty 200
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_slack_action_invalid_signature(client, monkeypatch):
    monkeypatch.setenv("SLACK_SIGNING_SECRET", "real-secret")
    payload_dict = {"actions": [{"action_id": "approve", "value": "RUN-001"}], "user": {"name": "alice"}}
    body = "payload=" + urllib.parse.quote(json.dumps(payload_dict))

    response = await client.post(
        "/api/slack/action",
        content=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Slack-Request-Timestamp": str(int(time.time())),
            "X-Slack-Signature": "v0=badsignature",
        },
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_slack_action_valid_signature_unknown_run(client, monkeypatch):
    secret = "test-signing-secret"
    monkeypatch.setenv("SLACK_SIGNING_SECRET", secret)
    monkeypatch.setenv("SLACK_DRY_RUN", "true")

    payload_dict = {"actions": [{"action_id": "approve", "value": "nonexistent-run-id"}], "user": {"name": "alice"}}
    body = "payload=" + urllib.parse.quote(json.dumps(payload_dict))
    ts, sig = _slack_signature(secret, body)

    response = await client.post(
        "/api/slack/action",
        content=body,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Slack-Request-Timestamp": ts,
            "X-Slack-Signature": sig,
        },
    )
    # Run not found or not paused → returns 200 with empty body (Slack requires this)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_test_slack_returns_ok_on_valid_token(client):
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"ok": True, "team": "Acme Corp"}

    with patch("backend.api.app._call_slack_auth_test", new=AsyncMock(return_value=mock_resp.json())):
        response = await client.post(
            "/api/test/slack",
            json={"slack_bot_token": "xoxb-valid", "slack_channel_id": "C123"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert "Acme Corp" in body["message"]


@pytest.mark.asyncio
async def test_test_slack_returns_error_on_invalid_token(client):
    with patch("backend.api.app._call_slack_auth_test", new=AsyncMock(return_value={"ok": False, "error": "invalid_auth"})):
        response = await client.post(
            "/api/test/slack",
            json={"slack_bot_token": "xoxb-bad", "slack_channel_id": "C123"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert "invalid_auth" in body["message"]


@pytest.mark.asyncio
async def test_test_slack_requires_both_fields(client):
    response = await client.post("/api/test/slack", json={"slack_bot_token": "xoxb-x"})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_test_jira_returns_ok_on_valid_creds(client):
    with patch(
        "backend.api.app._call_jira_myself",
        new=AsyncMock(return_value=(200, {"displayName": "Jane Doe"})),
    ):
        response = await client.post(
            "/api/test/jira",
            json={
                "jira_base_url": "https://acme.atlassian.net",
                "jira_email": "jane@acme.com",
                "jira_api_token": "token123",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert "Jane Doe" in body["message"]


@pytest.mark.asyncio
async def test_test_jira_returns_error_on_bad_creds(client):
    with patch(
        "backend.api.app._call_jira_myself",
        new=AsyncMock(return_value=(401, {})),
    ):
        response = await client.post(
            "/api/test/jira",
            json={
                "jira_base_url": "https://acme.atlassian.net",
                "jira_email": "jane@acme.com",
                "jira_api_token": "badtoken",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert "401" in body["message"]


@pytest.mark.asyncio
async def test_test_jira_requires_all_three_fields(client):
    response = await client.post(
        "/api/test/jira",
        json={"jira_base_url": "https://acme.atlassian.net", "jira_email": "x@x.com"},
    )
    assert response.status_code == 422

