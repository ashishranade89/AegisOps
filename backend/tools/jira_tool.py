from langchain.tools import tool
import json
import logging
import base64
import httpx
from backend.utils.config import get_config

logger = logging.getLogger(__name__)


def _severity_to_priority(severity: str) -> str:
    mapping = {
        "sev1": "Critical", "p1": "Critical",
        "sev2": "High",     "p2": "High",
        "sev3": "Medium",   "p3": "Medium",
        "sev4": "Low",      "p4": "Low",
    }
    return mapping.get((severity or "").lower(), "Medium")


def _jira_auth_header(email: str, token: str) -> str:
    encoded = base64.b64encode(f"{email}:{token}".encode()).decode()
    return f"Basic {encoded}"


@tool
def create_jira_incident(
    incident_id: str,
    severity: str,
    suspected_vendor: str,
    internal_findings: str,
    run_url: str,
) -> str:
    """
    Creates a Jira incident ticket after triage. Returns ticket_id and ticket_url.
    Skips silently if Jira is not configured. Returns dry-run mock if JIRA_DRY_RUN=true.
    """
    config = get_config()

    if not config.jira_configured():
        logger.warning("Jira not configured — skipping ticket creation")
        return json.dumps({"skipped": True, "reason": "Jira not configured"})

    if config.jira_dry_run:
        mock_id = f"{config.jira_project_key}-DRY"
        return json.dumps({
            "dry_run": True,
            "ticket_id": mock_id,
            "ticket_url": f"{config.jira_base_url}/browse/{mock_id}",
        })

    priority = _severity_to_priority(severity)
    payload = {
        "fields": {
            "project": {"key": config.jira_project_key},
            "summary": f"[{severity.upper()}] Vendor Outage: {suspected_vendor} — {incident_id}",
            "description": {
                "type": "doc",
                "version": 1,
                "content": [{
                    "type": "paragraph",
                    "content": [{"type": "text", "text": (
                        f"Incident ID: {incident_id}\n"
                        f"Severity: {severity}\n"
                        f"Suspected Vendor: {suspected_vendor}\n"
                        f"Findings: {internal_findings}\n"
                        f"Investigation URL: {run_url}"
                    )}]
                }]
            },
            "issuetype": {"name": "Incident"},
            "priority": {"name": priority},
            "labels": ["vendor-outage", "auto-created"],
        }
    }

    try:
        resp = httpx.post(
            f"{config.jira_base_url}/rest/api/3/issue",
            json=payload,
            headers={
                "Authorization": _jira_auth_header(config.jira_email, config.jira_api_token),
                "Content-Type": "application/json",
            },
            timeout=10.0,
        )
        resp.raise_for_status()
        data = resp.json()
        ticket_id = data["key"]
        ticket_url = f"{config.jira_base_url}/browse/{ticket_id}"
        logger.info("Jira ticket created: %s", ticket_url)
        return json.dumps({"ticket_id": ticket_id, "ticket_url": ticket_url})
    except Exception as e:
        logger.error("Jira create_issue failed: %s", e)
        return json.dumps({"error": str(e)})


@tool
def update_jira_status(ticket_id: str, status: str) -> str:
    """
    Transitions a Jira ticket to a new status. Looks up the transition ID dynamically.
    status: one of 'In Progress', 'Done', 'Closed'
    """
    config = get_config()

    if not config.jira_configured():
        return json.dumps({"skipped": True})

    if config.jira_dry_run:
        return json.dumps({"dry_run": True, "ticket_id": ticket_id, "status": status})

    headers = {
        "Authorization": _jira_auth_header(config.jira_email, config.jira_api_token),
        "Content-Type": "application/json",
    }
    base = config.jira_base_url

    try:
        resp = httpx.get(
            f"{base}/rest/api/3/issue/{ticket_id}/transitions",
            headers=headers,
            timeout=10.0,
        )
        resp.raise_for_status()
        transitions = resp.json().get("transitions", [])
        match = next(
            (t for t in transitions if t["name"].lower() == status.lower()),
            None
        )
        if not match:
            logger.warning("Transition '%s' not found for %s. Available: %s",
                           status, ticket_id, [t["name"] for t in transitions])
            return json.dumps({"skipped": True, "reason": f"Transition '{status}' not found"})

        resp2 = httpx.post(
            f"{base}/rest/api/3/issue/{ticket_id}/transitions",
            json={"transition": {"id": match["id"]}},
            headers=headers,
            timeout=10.0,
        )
        resp2.raise_for_status()
        logger.info("Jira %s transitioned to '%s'", ticket_id, status)
        return json.dumps({"ticket_id": ticket_id, "status": status})
    except Exception as e:
        logger.error("Jira update_status failed: %s", e)
        return json.dumps({"error": str(e)})


@tool
def add_jira_comment(ticket_id: str, comment: str) -> str:
    """Appends a plain-text comment to a Jira ticket."""
    config = get_config()

    if not config.jira_configured():
        return json.dumps({"skipped": True})

    if config.jira_dry_run:
        return json.dumps({"dry_run": True, "ticket_id": ticket_id})

    payload = {
        "body": {
            "type": "doc",
            "version": 1,
            "content": [{
                "type": "paragraph",
                "content": [{"type": "text", "text": comment}]
            }]
        }
    }

    try:
        resp = httpx.post(
            f"{config.jira_base_url}/rest/api/3/issue/{ticket_id}/comment",
            json=payload,
            headers={
                "Authorization": _jira_auth_header(config.jira_email, config.jira_api_token),
                "Content-Type": "application/json",
            },
            timeout=10.0,
        )
        resp.raise_for_status()
        logger.info("Jira comment added to %s", ticket_id)
        return json.dumps({"ticket_id": ticket_id, "commented": True})
    except Exception as e:
        logger.error("Jira add_comment failed: %s", e)
        return json.dumps({"error": str(e)})
