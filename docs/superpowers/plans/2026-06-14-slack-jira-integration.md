# Slack Bot + Jira Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic Jira ticket creation after triage and rich Slack Bot notifications (Block Kit approval message + threaded final report) to the LangGraph incident pipeline, with approval actionable from both Slack and the web UI.

**Architecture:** Two new LangGraph nodes (`jira_node`, `slack_report_node`) are inserted into the existing graph. Slack approval notification is sent from `app.py` at the existing pause-detection point. A new `POST /api/slack/action` endpoint handles interactive button callbacks and resumes the pipeline via the same path as the web UI.

**Tech Stack:** Python 3.12, FastAPI, LangGraph, `httpx` (already installed), Jira Cloud REST API v3, Slack Web API with Block Kit.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `backend/utils/config.py` | Add 9 new env-var properties |
| Modify | `backend/models/incident_state.py` | Add 3 optional state fields |
| Create | `backend/tools/jira_tool.py` | Jira REST client (create, transition, comment) |
| Create | `backend/tools/slack_bot_tool.py` | Slack Bot API (post Block Kit, update, thread) |
| Create | `backend/agents/jira_agent.py` | Graph node: create Jira ticket after triage |
| Create | `backend/agents/slack_agent.py` | Graph node: `slack_report_node` + helper `send_slack_approval` |
| Modify | `backend/graph/incident_graph.py` | Insert `jira` after triage; `slack_report` after reporter |
| Modify | `backend/api/app.py` | Call `send_slack_approval` at pause; add `/api/slack/action` endpoint; update Jira+Slack on resume |
| Modify | `.env.example` | Document new env vars |
| Create | `tests/test_jira_tool.py` | Unit tests for jira_tool |
| Create | `tests/test_slack_bot_tool.py` | Unit tests for slack_bot_tool |
| Modify | `tests/test_api.py` | Tests for `/api/slack/action` endpoint |

---

## Task 1: Extend AppConfig with Jira + Slack Bot properties

**Files:**
- Modify: `backend/utils/config.py`

- [ ] **Step 1: Add the 9 new properties to `AppConfig`**

Open `backend/utils/config.py`. After the `slack_webhook_url` property (line 39), add:

```python
    @property
    def jira_base_url(self) -> str:
        return os.getenv("JIRA_BASE_URL") or ""

    @property
    def jira_email(self) -> str:
        return os.getenv("JIRA_EMAIL") or ""

    @property
    def jira_api_token(self) -> str:
        return os.getenv("JIRA_API_TOKEN") or ""

    @property
    def jira_project_key(self) -> str:
        return os.getenv("JIRA_PROJECT_KEY") or "OPS"

    @property
    def jira_dry_run(self) -> bool:
        return _env_bool("JIRA_DRY_RUN", default=False)

    @property
    def slack_bot_token(self) -> str:
        return os.getenv("SLACK_BOT_TOKEN") or ""

    @property
    def slack_channel_id(self) -> str:
        return os.getenv("SLACK_CHANNEL_ID") or ""

    @property
    def slack_signing_secret(self) -> str:
        return os.getenv("SLACK_SIGNING_SECRET") or ""

    @property
    def slack_dry_run(self) -> bool:
        return _env_bool("SLACK_DRY_RUN", default=False)

    def jira_configured(self) -> bool:
        return bool(self.jira_base_url and self.jira_email and self.jira_api_token)

    def slack_bot_configured(self) -> bool:
        return bool(self.slack_bot_token and self.slack_channel_id)
```

- [ ] **Step 2: Verify the module imports cleanly**

```bash
cd "/Volumes/MyData/AI Acclerator program documents/Hackthon/vendor_outage_investigator"
python -c "from backend.utils.config import get_config; c = get_config(); print(c.jira_configured(), c.slack_bot_configured())"
```
Expected: `False False` (no env vars set)

- [ ] **Step 3: Commit**

```bash
git add backend/utils/config.py
git commit -m "feat: add Jira + Slack Bot config properties to AppConfig"
```

---

## Task 2: Add Jira/Slack fields to IncidentState

**Files:**
- Modify: `backend/models/incident_state.py`

- [ ] **Step 1: Add 3 optional fields to `IncidentState`**

In `backend/models/incident_state.py`, inside the `IncidentState(TypedDict)` class, add after `recommendations`:

```python
    # Integrations
    jira_ticket_url: Optional[str]    # e.g. "https://company.atlassian.net/browse/OPS-42"
    jira_ticket_id: Optional[str]     # e.g. "OPS-42"
    slack_approval_ts: Optional[str]  # Slack message ts for threading + updates
```

- [ ] **Step 2: Verify import**

```bash
python -c "from backend.models.incident_state import IncidentState; print('jira_ticket_id' in IncidentState.__annotations__)"
```
Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add backend/models/incident_state.py
git commit -m "feat: add jira_ticket_url, jira_ticket_id, slack_approval_ts to IncidentState"
```

---

## Task 3: Create `jira_tool.py`

**Files:**
- Create: `backend/tools/jira_tool.py`
- Create: `tests/test_jira_tool.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_jira_tool.py`:

```python
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
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd "/Volumes/MyData/AI Acclerator program documents/Hackthon/vendor_outage_investigator"
python -m pytest tests/test_jira_tool.py -v 2>&1 | head -20
```
Expected: `ModuleNotFoundError` or `ImportError` for `backend.tools.jira_tool`

- [ ] **Step 3: Create `backend/tools/jira_tool.py`**

```python
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
        # Get available transitions
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
```

- [ ] **Step 4: Run tests — expect pass**

```bash
python -m pytest tests/test_jira_tool.py -v
```
Expected: 5 tests PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/tools/jira_tool.py tests/test_jira_tool.py
git commit -m "feat: add jira_tool with create/update/comment + dry-run support"
```

---

## Task 4: Create `slack_bot_tool.py`

**Files:**
- Create: `backend/tools/slack_bot_tool.py`
- Create: `tests/test_slack_bot_tool.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_slack_bot_tool.py`:

```python
import json
import pytest


def test_post_approval_message_dry_run(monkeypatch):
    monkeypatch.setenv("SLACK_DRY_RUN", "true")
    monkeypatch.setenv("SLACK_BOT_TOKEN", "xoxb-test")
    monkeypatch.setenv("SLACK_CHANNEL_ID", "C123456")

    from backend.tools.slack_bot_tool import post_approval_message
    result = json.loads(post_approval_message(
        run_id="RUN-001",
        root_cause="Stripe API returning 502 on charge endpoint",
        severity="sev1",
        suspected_vendor="Stripe",
        remediation_steps=["Switch to PayPal gateway", "Alert on-call engineer"],
        jira_url="https://test.atlassian.net/browse/OPS-DRY",
    ))
    assert result["dry_run"] is True
    assert "message_ts" in result


def test_post_approval_message_skips_without_token(monkeypatch):
    monkeypatch.delenv("SLACK_BOT_TOKEN", raising=False)
    monkeypatch.delenv("SLACK_CHANNEL_ID", raising=False)

    from backend.tools.slack_bot_tool import post_approval_message
    result = json.loads(post_approval_message(
        run_id="RUN-001",
        root_cause="test",
        severity="sev1",
        suspected_vendor="Stripe",
        remediation_steps=[],
        jira_url=None,
    ))
    assert result["skipped"] is True


def test_update_approval_message_dry_run(monkeypatch):
    monkeypatch.setenv("SLACK_DRY_RUN", "true")
    monkeypatch.setenv("SLACK_BOT_TOKEN", "xoxb-test")
    monkeypatch.setenv("SLACK_CHANNEL_ID", "C123456")

    from backend.tools.slack_bot_tool import update_approval_message
    result = json.loads(update_approval_message(
        message_ts="1234567890.123456",
        decision="approved",
        decided_by="alice",
    ))
    assert result["dry_run"] is True


def test_post_report_thread_dry_run(monkeypatch):
    monkeypatch.setenv("SLACK_DRY_RUN", "true")
    monkeypatch.setenv("SLACK_BOT_TOKEN", "xoxb-test")
    monkeypatch.setenv("SLACK_CHANNEL_ID", "C123456")

    from backend.tools.slack_bot_tool import post_report_thread
    result = json.loads(post_report_thread(
        approval_ts="1234567890.123456",
        final_report="Investigation complete. Root cause: Stripe outage.",
        jira_ticket_id="OPS-42",
    ))
    assert result["dry_run"] is True


def test_build_approval_blocks_structure():
    from backend.tools.slack_bot_tool import _build_approval_blocks
    blocks = _build_approval_blocks(
        run_id="RUN-001",
        root_cause="Stripe 502s",
        severity="sev1",
        suspected_vendor="Stripe",
        remediation_steps=["Step 1", "Step 2"],
        jira_url="https://jira.test/browse/OPS-1",
    )
    assert isinstance(blocks, list)
    assert len(blocks) > 0
    # Last block should contain actions with approve/reject buttons
    action_block = next((b for b in blocks if b.get("type") == "actions"), None)
    assert action_block is not None
    action_ids = [a["action_id"] for a in action_block["elements"]]
    assert "approve" in action_ids
    assert "reject" in action_ids
    # Approve button value should contain run_id
    approve_btn = next(a for a in action_block["elements"] if a["action_id"] == "approve")
    assert "RUN-001" in approve_btn["value"]
```

- [ ] **Step 2: Run tests — expect failure**

```bash
python -m pytest tests/test_slack_bot_tool.py -v 2>&1 | head -20
```
Expected: `ImportError` for `backend.tools.slack_bot_tool`

- [ ] **Step 3: Create `backend/tools/slack_bot_tool.py`**

```python
import json
import logging
import httpx
from backend.utils.config import get_config

logger = logging.getLogger(__name__)

_SLACK_API = "https://slack.com/api"


def _headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _build_approval_blocks(
    run_id: str,
    root_cause: str,
    severity: str,
    suspected_vendor: str,
    remediation_steps: list,
    jira_url: str | None,
) -> list:
    steps_text = "\n".join(f"• {s}" for s in (remediation_steps or [])[:5]) or "_None yet_"
    jira_section = f"\n*Jira:* <{jira_url}|View Ticket>" if jira_url else ""

    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": "🚨 Incident Approval Required", "emoji": True}
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Severity:*\n{severity.upper()}"},
                {"type": "mrkdwn", "text": f"*Vendor:*\n{suspected_vendor}"},
            ]
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Root Cause:*\n{root_cause}{jira_section}"}
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Proposed Remediation:*\n{steps_text}"}
        },
        {"type": "divider"},
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "✅ Approve", "emoji": True},
                    "style": "primary",
                    "action_id": "approve",
                    "value": run_id,
                },
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "❌ Reject", "emoji": True},
                    "style": "danger",
                    "action_id": "reject",
                    "value": run_id,
                },
            ]
        }
    ]
    return blocks


def post_approval_message(
    run_id: str,
    root_cause: str,
    severity: str,
    suspected_vendor: str,
    remediation_steps: list,
    jira_url: str | None,
) -> str:
    """
    Posts a Block Kit approval message to the configured Slack channel.
    Returns JSON with message_ts (needed for threading and updates).
    Skips silently if Slack Bot is not configured.
    """
    config = get_config()

    if not config.slack_bot_configured():
        logger.warning("Slack Bot not configured — skipping approval message")
        return json.dumps({"skipped": True, "reason": "Slack Bot not configured"})

    if config.slack_dry_run:
        return json.dumps({"dry_run": True, "message_ts": "0000000000.000000"})

    blocks = _build_approval_blocks(
        run_id, root_cause, severity, suspected_vendor, remediation_steps, jira_url
    )

    try:
        resp = httpx.post(
            f"{_SLACK_API}/chat.postMessage",
            json={
                "channel": config.slack_channel_id,
                "text": f"Incident approval required: {suspected_vendor} ({severity})",
                "blocks": blocks,
            },
            headers=_headers(config.slack_bot_token),
            timeout=10.0,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            raise ValueError(f"Slack API error: {data.get('error')}")
        ts = data["message"]["ts"]
        logger.info("Slack approval message posted (ts=%s)", ts)
        return json.dumps({"message_ts": ts})
    except Exception as e:
        logger.error("Slack post_approval_message failed: %s", e)
        return json.dumps({"error": str(e)})


def update_approval_message(
    message_ts: str,
    decision: str,
    decided_by: str,
) -> str:
    """
    Replaces the approval buttons with the decision result.
    decision: 'approved' or 'rejected'
    """
    config = get_config()

    if not config.slack_bot_configured():
        return json.dumps({"skipped": True})

    if config.slack_dry_run:
        return json.dumps({"dry_run": True, "decision": decision})

    icon = "✅" if decision == "approved" else "❌"
    label = "Approved" if decision == "approved" else "Rejected"

    blocks = [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"{icon} *{label}* by *{decided_by}*"
            }
        }
    ]

    try:
        resp = httpx.post(
            f"{_SLACK_API}/chat.update",
            json={
                "channel": config.slack_channel_id,
                "ts": message_ts,
                "blocks": blocks,
                "text": f"{label} by {decided_by}",
            },
            headers=_headers(config.slack_bot_token),
            timeout=10.0,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            raise ValueError(f"Slack API error: {data.get('error')}")
        logger.info("Slack approval message updated: %s", decision)
        return json.dumps({"updated": True, "decision": decision})
    except Exception as e:
        logger.error("Slack update_approval_message failed: %s", e)
        return json.dumps({"error": str(e)})


def post_report_thread(
    approval_ts: str,
    final_report: str,
    jira_ticket_id: str | None,
) -> str:
    """
    Posts the final report as a threaded reply to the approval message.
    """
    config = get_config()

    if not config.slack_bot_configured():
        return json.dumps({"skipped": True})

    if config.slack_dry_run:
        return json.dumps({"dry_run": True})

    jira_line = f"\n*Jira Ticket:* {jira_ticket_id}" if jira_ticket_id else ""
    summary = final_report[:1500] + ("..." if len(final_report) > 1500 else "")

    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": "📋 Final Incident Report", "emoji": True}
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"{summary}{jira_line}"}
        }
    ]

    try:
        resp = httpx.post(
            f"{_SLACK_API}/chat.postMessage",
            json={
                "channel": config.slack_channel_id,
                "thread_ts": approval_ts,
                "text": "Final incident report",
                "blocks": blocks,
            },
            headers=_headers(config.slack_bot_token),
            timeout=10.0,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            raise ValueError(f"Slack API error: {data.get('error')}")
        logger.info("Slack report thread posted")
        return json.dumps({"posted": True})
    except Exception as e:
        logger.error("Slack post_report_thread failed: %s", e)
        return json.dumps({"error": str(e)})
```

- [ ] **Step 4: Run tests — expect pass**

```bash
python -m pytest tests/test_slack_bot_tool.py -v
```
Expected: 5 tests PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/tools/slack_bot_tool.py tests/test_slack_bot_tool.py
git commit -m "feat: add slack_bot_tool with Block Kit approval, update, and threaded report"
```

---

## Task 5: Create `jira_agent.py` (graph node)

**Files:**
- Create: `backend/agents/jira_agent.py`

- [ ] **Step 1: Create `backend/agents/jira_agent.py`**

```python
import json
import logging
from backend.models.incident_state import IncidentState
from backend.tools.jira_tool import create_jira_incident
from backend.api.streaming import send_sse_event

logger = logging.getLogger(__name__)


async def jira_node(state: IncidentState) -> IncidentState:
    """
    Creates a Jira incident ticket using triage output.
    Runs immediately after triage_node. Non-blocking: failures are logged but never stop the pipeline.
    """
    run_id = state.get("incident_id", "CLI-RUN")
    await send_sse_event(run_id, "agent_start", {"agent_name": "Jira Integration"})

    try:
        await send_sse_event(run_id, "tool_start", {
            "agent_name": "Jira Integration",
            "detail": "create_jira_incident"
        })

        # Build a run URL for the Jira ticket description
        run_url = f"http://localhost:5173/run/{run_id}"

        result_str = create_jira_incident.invoke({
            "incident_id": run_id,
            "severity": state.get("severity") or "unknown",
            "suspected_vendor": state.get("suspected_vendor") or "Unknown",
            "internal_findings": state.get("internal_findings") or "No findings yet",
            "run_url": run_url,
        })
        result = json.loads(result_str)

        await send_sse_event(run_id, "tool_end", {
            "agent_name": "Jira Integration",
            "detail": "create_jira_incident"
        })

        if result.get("skipped"):
            await send_sse_event(run_id, "agent_end", {
                "agent_name": "Jira Integration",
                "detail": "Jira not configured — skipped"
            })
            return state

        if result.get("dry_run") or result.get("ticket_id"):
            ticket_id = result.get("ticket_id", "")
            ticket_url = result.get("ticket_url", "")
            await send_sse_event(run_id, "agent_end", {
                "agent_name": "Jira Integration",
                "detail": f"Ticket created: {ticket_id}"
            })
            return {
                **state,
                "jira_ticket_id": ticket_id,
                "jira_ticket_url": ticket_url,
            }

        # API error — log and continue
        logger.error("Jira ticket creation error: %s", result.get("error"))
        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Jira Integration",
            "detail": f"Jira error (non-fatal): {result.get('error')}"
        })
        return state

    except Exception as e:
        logger.error("jira_node unexpected error: %s", e)
        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Jira Integration",
            "detail": f"Unexpected error (non-fatal): {e}"
        })
        return state
```

- [ ] **Step 2: Verify import**

```bash
python -c "from backend.agents.jira_agent import jira_node; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/agents/jira_agent.py
git commit -m "feat: add jira_agent graph node — creates Jira ticket after triage"
```

---

## Task 6: Create `slack_agent.py`

**Files:**
- Create: `backend/agents/slack_agent.py`

- [ ] **Step 1: Create `backend/agents/slack_agent.py`**

```python
import json
import logging
from backend.models.incident_state import IncidentState
from backend.tools.slack_bot_tool import (
    post_approval_message,
    post_report_thread,
    update_approval_message,
)
from backend.tools.jira_tool import update_jira_status, add_jira_comment
from backend.api.streaming import send_sse_event

logger = logging.getLogger(__name__)


async def send_slack_approval(state_values: dict, run_id: str) -> str | None:
    """
    Called from app.py when the graph pauses for approval.
    Posts a Block Kit message with Approve/Reject buttons.
    Returns the Slack message_ts so it can be stored and used for updates.
    """
    try:
        result_str = post_approval_message(
            run_id=run_id,
            root_cause=state_values.get("root_cause") or "Under investigation",
            severity=state_values.get("severity") or "unknown",
            suspected_vendor=state_values.get("suspected_vendor") or "Unknown",
            remediation_steps=state_values.get("remediation_steps") or [],
            jira_url=state_values.get("jira_ticket_url"),
        )
        result = json.loads(result_str)
        if result.get("message_ts"):
            logger.info("Slack approval message posted (ts=%s)", result["message_ts"])
            return result["message_ts"]
        return None
    except Exception as e:
        logger.error("send_slack_approval failed: %s", e)
        return None


async def slack_report_node(state: IncidentState) -> IncidentState:
    """
    Posts the final report as a threaded Slack reply and updates Jira to Done.
    Runs after reporter_node. Non-blocking: failures never stop the pipeline.
    """
    run_id = state.get("incident_id", "CLI-RUN")
    await send_sse_event(run_id, "agent_start", {"agent_name": "Slack Report"})

    try:
        approval_ts = state.get("slack_approval_ts")
        jira_ticket_id = state.get("jira_ticket_id")
        final_report = state.get("final_report") or "No report generated."

        # Post final report thread to Slack
        if approval_ts:
            await send_sse_event(run_id, "tool_start", {
                "agent_name": "Slack Report",
                "detail": "post_report_thread"
            })
            post_report_thread(
                approval_ts=approval_ts,
                final_report=final_report,
                jira_ticket_id=jira_ticket_id,
            )
            await send_sse_event(run_id, "tool_end", {
                "agent_name": "Slack Report",
                "detail": "post_report_thread"
            })

        # Update Jira ticket to Done and add the report as a comment
        if jira_ticket_id:
            await send_sse_event(run_id, "tool_start", {
                "agent_name": "Slack Report",
                "detail": "update_jira_status → Done"
            })
            update_jira_status.invoke({"ticket_id": jira_ticket_id, "status": "Done"})
            add_jira_comment.invoke({
                "ticket_id": jira_ticket_id,
                "comment": f"Incident resolved.\n\n{final_report[:2000]}"
            })
            await send_sse_event(run_id, "tool_end", {
                "agent_name": "Slack Report",
                "detail": "update_jira_status → Done"
            })

        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Slack Report",
            "detail": "Slack thread posted and Jira updated to Done"
        })
        return state

    except Exception as e:
        logger.error("slack_report_node unexpected error: %s", e)
        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Slack Report",
            "detail": f"Non-fatal error: {e}"
        })
        return state
```

- [ ] **Step 2: Verify import**

```bash
python -c "from backend.agents.slack_agent import slack_report_node, send_slack_approval; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/agents/slack_agent.py
git commit -m "feat: add slack_agent — slack_report_node and send_slack_approval helper"
```

---

## Task 7: Wire new nodes into the LangGraph pipeline

**Files:**
- Modify: `backend/graph/incident_graph.py`

- [ ] **Step 1: Add imports at the top of `incident_graph.py`**

After the existing imports (around line 12), add:

```python
from backend.agents.jira_agent import jira_node
from backend.agents.slack_agent import slack_report_node
```

- [ ] **Step 2: Register the two new nodes in `build_incident_graph`**

In `build_incident_graph`, after `builder.add_node("triage", triage_node)` (around line 167), add:

```python
    builder.add_node("jira", jira_node)
    builder.add_node("slack_report", slack_report_node)
```

- [ ] **Step 3: Rewire edges**

Replace this line (around line 179):
```python
    builder.add_edge("triage", "rag_search")
```
With:
```python
    builder.add_edge("triage", "jira")
    builder.add_edge("jira", "rag_search")
```

Replace this line (around line 214):
```python
    builder.add_edge("reporter", "store_incident")
```
With:
```python
    builder.add_edge("reporter", "slack_report")
    builder.add_edge("slack_report", "store_incident")
```

- [ ] **Step 4: Verify the graph builds without error**

```bash
python -c "
from unittest.mock import MagicMock
from backend.graph.incident_graph import build_incident_graph
g = build_incident_graph(MagicMock())
print('Nodes:', list(g.nodes))
"
```
Expected: output includes `'jira'` and `'slack_report'` in the nodes list

- [ ] **Step 5: Run existing tests to confirm no regressions**

```bash
python -m pytest tests/test_api.py -v
```
Expected: all previously passing tests still PASS

- [ ] **Step 6: Commit**

```bash
git add backend/graph/incident_graph.py
git commit -m "feat: wire jira and slack_report nodes into LangGraph pipeline"
```

---

## Task 8: Update `app.py` — Slack approval at pause + `/api/slack/action` endpoint + update on resume

**Files:**
- Modify: `backend/api/app.py`

- [ ] **Step 1: Add imports at the top of `app.py`**

After the existing imports, add:

```python
import hashlib
import hmac
import time
from backend.agents.slack_agent import send_slack_approval
from backend.tools.slack_bot_tool import update_approval_message
from backend.tools.jira_tool import update_jira_status, add_jira_comment
```

- [ ] **Step 2: Send Slack approval message when pipeline pauses**

In `run_graph_task`, find the block that starts with `if current_state.next:` (around line 149). Inside that block, after the `approval_context` SSE event is sent and before `state.status = "paused"`, add:

```python
        # Send Slack approval message and store the message timestamp in graph state
        slack_ts = await send_slack_approval(vals, run_id)
        if slack_ts:
            await compiled_graph.aupdate_state(config, {"slack_approval_ts": slack_ts})
```

The full `if current_state.next:` block should look like:

```python
        if current_state.next:
            vals = current_state.values or {}
            await send_sse_event(run_id, "approval_context", {
                "root_cause": vals.get("root_cause"),
                "suspected_vendor": vals.get("suspected_vendor"),
                "severity": vals.get("severity"),
                "internal_findings": vals.get("internal_findings"),
                "hypotheses": vals.get("hypotheses") or [],
                "browser_result": vals.get("browser_result"),
                "web_search_result": vals.get("web_search_result"),
            })
            # Send Slack approval message and store ts in graph state for later threading
            slack_ts = await send_slack_approval(vals, run_id)
            if slack_ts:
                await compiled_graph.aupdate_state(config, {"slack_approval_ts": slack_ts})
            state.status = "paused"
            state.current_phase = "paused_for_approval"
            persist_run(state)
            await send_sse_event(run_id, "phase_change", {"phase": "paused_for_approval"})
            logger.info("LangGraph pipeline paused for approval: run_id=%s", run_id)
            return
```

- [ ] **Step 3: Update Jira + Slack when the web UI approves/rejects**

In the `resume_incident` endpoint, after `state.status = "resuming"` and before creating the asyncio task, add:

```python
        # Update Slack message and Jira ticket status to reflect the decision
        try:
            from backend.graph.incident_graph import get_compiled_graph
            compiled = get_compiled_graph()
            cfg = {"configurable": {"thread_id": run_id}}
            current = await compiled.aget_state(cfg)
            if current and current.values:
                cv = current.values
                slack_ts = cv.get("slack_approval_ts")
                jira_ticket_id = cv.get("jira_ticket_id")
                judge = approval.judge_name or "Web UI"
                decision = "approved" if approval.status == "approved" else "rejected"

                if slack_ts:
                    update_approval_message(
                        message_ts=slack_ts,
                        decision=decision,
                        decided_by=judge,
                    )
                if jira_ticket_id:
                    jira_status = "In Progress" if decision == "approved" else "Closed"
                    update_jira_status.invoke({"ticket_id": jira_ticket_id, "status": jira_status})
                    if decision == "rejected" and approval.comments:
                        add_jira_comment.invoke({
                            "ticket_id": jira_ticket_id,
                            "comment": f"Rejected by {judge}: {approval.comments}"
                        })
        except Exception as _e:
            logger.warning("Jira/Slack update on resume failed (non-fatal): %s", _e)
```

- [ ] **Step 4: Add the `/api/slack/action` endpoint**

Add this new endpoint to `app.py` (before the `/health` endpoint):

```python
@app.post("/api/slack/action")
async def slack_action(request: Request):
    """
    Handles interactive Slack button callbacks (Approve / Reject).
    Verifies Slack signing secret, then resumes the pipeline.
    """
    from fastapi import Request
    from backend.utils.config import get_config as _cfg

    body_bytes = await request.body()
    body_str = body_bytes.decode("utf-8")

    # Verify Slack signing secret
    signing_secret = _cfg().slack_signing_secret
    if signing_secret:
        timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
        slack_sig = request.headers.get("X-Slack-Signature", "")
        # Reject replays older than 5 minutes
        if abs(time.time() - float(timestamp or 0)) > 300:
            raise HTTPException(status_code=403, detail="Request too old")
        sig_basestring = f"v0:{timestamp}:{body_str}"
        computed = "v0=" + hmac.new(
            signing_secret.encode(),
            sig_basestring.encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(computed, slack_sig):
            logger.warning("Slack signature mismatch from IP %s", request.client.host)
            raise HTTPException(status_code=403, detail="Invalid signature")

    # Parse the payload form field
    import urllib.parse as _urlparse
    parsed = _urlparse.parse_qs(body_str)
    payload_str = parsed.get("payload", ["{}"])[0]
    payload = json.loads(payload_str)

    actions = payload.get("actions", [])
    if not actions:
        return {}

    action = actions[0]
    action_id = action.get("action_id")   # "approve" or "reject"
    run_id = action.get("value", "")
    user_name = payload.get("user", {}).get("name", "Slack User")

    # Immediately update the Slack message to prevent double-clicks
    try:
        from backend.graph.incident_graph import get_compiled_graph
        compiled = get_compiled_graph()
        cfg = {"configurable": {"thread_id": run_id}}
        current = await compiled.aget_state(cfg)
        slack_ts = (current.values or {}).get("slack_approval_ts") if current else None
        jira_ticket_id = (current.values or {}).get("jira_ticket_id") if current else None
    except Exception:
        slack_ts = None
        jira_ticket_id = None

    decision = "approved" if action_id == "approve" else "rejected"

    if slack_ts:
        update_approval_message(
            message_ts=slack_ts,
            decision=decision,
            decided_by=user_name,
        )

    if jira_ticket_id:
        jira_status = "In Progress" if decision == "approved" else "Closed"
        update_jira_status.invoke({"ticket_id": jira_ticket_id, "status": jira_status})

    # Resume the pipeline using the same path as the web UI
    run_state = get_run(run_id)
    if not run_state or run_state.status != "paused":
        logger.warning("Slack action on non-paused run %s (status=%s)",
                       run_id, run_state.status if run_state else "not found")
        return {}

    approval_status = "approved" if action_id == "approve" else "rejected"
    approval = ApprovalDecision(status=approval_status, judge_name=user_name)

    run_state.status = "resuming"
    persist_run(run_state)

    credentials = resolve_llm_credentials({})  # uses server-side config
    task = asyncio.create_task(
        run_graph_task(
            run_id,
            run_state.scenario_type,
            credentials=credentials,
            resume_state={"approval": approval.model_dump()},
        )
    )
    _running_tasks[run_id] = task
    task.add_done_callback(lambda t: _running_tasks.pop(run_id, None))

    # Slack requires HTTP 200 with empty body within 3 seconds
    return {}
```

Also add `Request` to the FastAPI imports at the top of `app.py`:
```python
from fastapi import Depends, FastAPI, HTTPException, Request
```

- [ ] **Step 5: Run existing tests**

```bash
python -m pytest tests/test_api.py -v
```
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/api/app.py
git commit -m "feat: wire Slack approval at pause, add /api/slack/action endpoint, update Jira+Slack on resume"
```

---

## Task 9: Update `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add the new env vars to `.env.example`**

Append to the end of `.env.example`:

```bash
# # ─── Jira Integration (all four required together; leave blank to disable) ────
# JIRA_BASE_URL=https://yourcompany.atlassian.net
# JIRA_EMAIL=you@yourcompany.com
# JIRA_API_TOKEN=your-jira-api-token
# JIRA_PROJECT_KEY=OPS
# # Set to true to test without hitting the real Jira API
# JIRA_DRY_RUN=false

# # ─── Slack Bot Integration ─────────────────────────────────────────────────────
# # SLACK_BOT_TOKEN and SLACK_CHANNEL_ID are required for the rich Bot integration.
# # Falls back to SLACK_WEBHOOK_URL (one-way notifications) if token is absent.
# SLACK_BOT_TOKEN=xoxb-your-bot-token
# SLACK_CHANNEL_ID=C0123456789
# # Required to verify Slack interactive button callbacks
# SLACK_SIGNING_SECRET=your-signing-secret
# # Set to true to test without hitting the real Slack API
# SLACK_DRY_RUN=false
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add Jira + Slack Bot env vars to .env.example"
```

---

## Task 10: Add integration test for `/api/slack/action`

**Files:**
- Modify: `tests/test_api.py`

- [ ] **Step 1: Add the Slack action tests**

Append to `tests/test_api.py`:

```python
import hashlib
import hmac
import time
import urllib.parse


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
```

- [ ] **Step 2: Run all tests**

```bash
python -m pytest tests/ -v
```
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/test_api.py
git commit -m "test: add /api/slack/action endpoint tests"
```

---

## Done

At this point:
- Jira ticket is auto-created after every triage with severity, vendor, and findings
- Slack Block Kit approval message fires when the pipeline pauses, with Approve/Reject buttons
- Both Slack and the web UI can approve/reject; both paths resume the same pipeline
- Final report is posted as a Slack thread reply and added as a Jira comment
- All integrations degrade gracefully when credentials are absent
- `JIRA_DRY_RUN=true` / `SLACK_DRY_RUN=true` allows testing without real API credentials
