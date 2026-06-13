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
async def test_auth_enforced_when_configured(client, monkeypatch):
    monkeypatch.setenv("INCIDENT_API_KEY", "secret-test-key")

    response = await client.get("/api/incident/scenarios")
    assert response.status_code == 401

    response = await client.get(
        "/api/incident/scenarios",
        headers={"Authorization": "Bearer secret-test-key"},
    )
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

