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
