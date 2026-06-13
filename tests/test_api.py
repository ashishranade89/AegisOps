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
