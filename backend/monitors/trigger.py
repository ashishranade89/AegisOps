"""Triggers the AegisOps incident pipeline by POSTing to the internal API.

Using HTTP avoids circular imports: the monitor package doesn't need to
import from backend.api.app, and the pipeline's SSE/state machinery is
reused exactly as it is for user-initiated investigations.
"""
import logging
import os

import httpx

from backend.utils.config import get_config

logger = logging.getLogger(__name__)

_DEFAULT_PORT = 8004


async def trigger_incident(raw_logs: str, source_name: str, auto_remediate: bool = False) -> str:
    """Fire a custom_telemetry investigation and return the new run_id."""
    config = get_config()
    port = int(os.getenv("API_PORT", _DEFAULT_PORT))
    base_url = os.getenv("API_BASE_URL", f"http://127.0.0.1:{port}")

    # incident_api_key header auth is disabled in the local config; tolerate its
    # absence so the monitor can still trigger the pipeline.
    headers: dict[str, str] = {}
    incident_api_key = getattr(config, "incident_api_key", "") or os.getenv("INCIDENT_API_KEY", "")
    if incident_api_key:
        headers["Authorization"] = f"Bearer {incident_api_key}"

    payload = {
        "scenario_type": "custom_telemetry",
        "custom_telemetry": {
            "raw_logs": raw_logs,
            "raw_metrics": {"source": source_name},
            "auto_remediate": auto_remediate,
        },
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{base_url}/api/incident",
            json=payload,
            headers=headers,
            timeout=10.0,
        )
        resp.raise_for_status()
        run_id: str = resp.json()["run_id"]

    logger.info("[trigger] Incident pipeline started  run_id=%s  source=%s", run_id, source_name)
    return run_id
