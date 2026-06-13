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


# ── Monitor CRUD ──────────────────────────────────────────────────────────────

_MONITOR_PAYLOAD = {
    "name": "Test Local Monitor",
    "type": "local",
    "log_path": "/tmp/test.log",
    "enabled": False,
}


@pytest.mark.asyncio
async def test_monitor_create_and_list(client):
    resp = await client.post("/api/monitors", json=_MONITOR_PAYLOAD)
    assert resp.status_code == 200
    body = resp.json()
    mid = body["id"]
    assert body["name"] == _MONITOR_PAYLOAD["name"]
    # credentials must not leak in response
    assert "credentials_enc" not in body

    list_resp = await client.get("/api/monitors")
    assert list_resp.status_code == 200
    assert any(m["id"] == mid for m in list_resp.json())

    # cleanup
    await client.delete(f"/api/monitors/{mid}")


@pytest.mark.asyncio
async def test_monitor_get(client):
    resp = await client.post("/api/monitors", json=_MONITOR_PAYLOAD)
    mid = resp.json()["id"]

    get_resp = await client.get(f"/api/monitors/{mid}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == mid

    await client.delete(f"/api/monitors/{mid}")


@pytest.mark.asyncio
async def test_monitor_update(client):
    resp = await client.post("/api/monitors", json=_MONITOR_PAYLOAD)
    mid = resp.json()["id"]

    put_resp = await client.put(f"/api/monitors/{mid}", json={"name": "Renamed Monitor"})
    assert put_resp.status_code == 200
    assert put_resp.json()["name"] == "Renamed Monitor"

    await client.delete(f"/api/monitors/{mid}")


@pytest.mark.asyncio
async def test_monitor_toggle(client):
    resp = await client.post("/api/monitors", json=_MONITOR_PAYLOAD)
    mid = resp.json()["id"]

    toggle_resp = await client.post(f"/api/monitors/{mid}/toggle", json={"enabled": False})
    assert toggle_resp.status_code == 200
    assert not toggle_resp.json()["enabled"]

    await client.delete(f"/api/monitors/{mid}")


@pytest.mark.asyncio
async def test_monitor_delete(client):
    resp = await client.post("/api/monitors", json=_MONITOR_PAYLOAD)
    mid = resp.json()["id"]

    del_resp = await client.delete(f"/api/monitors/{mid}")
    assert del_resp.status_code == 200
    assert del_resp.json()["deleted"] == mid

    get_resp = await client.get(f"/api/monitors/{mid}")
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_monitor_not_found_returns_404(client):
    resp = await client.get("/api/monitors/nonexistent-monitor-id")
    assert resp.status_code == 404

