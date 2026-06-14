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


def _join_channel(token: str, channel_id: str) -> None:
    """Attempt to join a public channel. No-op for private channels (bot must be invited)."""
    try:
        resp = httpx.post(
            f"{_SLACK_API}/conversations.join",
            json={"channel": channel_id},
            headers=_headers(token),
            timeout=10.0,
        )
        data = resp.json()
        if data.get("ok"):
            logger.info("Slack bot joined channel %s", channel_id)
        else:
            logger.warning("Could not join channel %s: %s", channel_id, data.get("error"))
    except Exception as e:
        logger.warning("conversations.join failed: %s", e)


def _build_approval_blocks(
    run_id: str,
    root_cause: str,
    severity: str,
    suspected_vendor: str,
    remediation_steps: list,
    jira_url: str | None,
) -> list:
    # Slack section text limit is 3000 chars; header text limit is 150 chars
    _MAX_SECTION = 2900
    jira_section = f"\n*Jira:* <{jira_url}|View Ticket>" if jira_url else ""
    root_cause_body = (root_cause or "Under investigation")
    # Reserve space for prefix "*Root Cause:*\n" (15 chars) and jira_section
    max_rc = _MAX_SECTION - 15 - len(jira_section)
    if len(root_cause_body) > max_rc:
        root_cause_body = root_cause_body[:max_rc - 3] + "..."

    raw_steps = [str(s)[:200] for s in (remediation_steps or [])[:5]]
    steps_text = "\n".join(f"• {s}" for s in raw_steps) or "_None yet_"
    if len(steps_text) > _MAX_SECTION - 25:
        steps_text = steps_text[:_MAX_SECTION - 28] + "..."

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
            "text": {"type": "mrkdwn", "text": f"*Root Cause:*\n{root_cause_body}{jira_section}"}
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


def _effective_slack_creds(bot_token: str = "", channel_id: str = "") -> tuple[str, str]:
    """Returns (bot_token, channel_id) — per-request values override env config."""
    config = get_config()
    return (
        bot_token.strip() or config.slack_bot_token,
        channel_id.strip() or config.slack_channel_id,
    )


def post_approval_message(
    run_id: str,
    root_cause: str,
    severity: str,
    suspected_vendor: str,
    remediation_steps: list,
    jira_url: str | None,
    bot_token: str = "",
    channel_id: str = "",
) -> str:
    """
    Posts a Block Kit approval message to the configured Slack channel.
    Returns JSON with message_ts (needed for threading and updates).
    Skips silently if Slack Bot is not configured.
    bot_token / channel_id override env-var config when provided.
    """
    config = get_config()
    effective_token, effective_channel = _effective_slack_creds(bot_token, channel_id)

    if not (effective_token and effective_channel):
        logger.error("Slack Bot not configured — SLACK_BOT_TOKEN and SLACK_CHANNEL_ID must be set in .env")
        return json.dumps({"skipped": True, "reason": "Slack Bot not configured"})

    if config.slack_dry_run:
        return json.dumps({"dry_run": True, "message_ts": "0000000000.000000"})

    blocks = _build_approval_blocks(
        run_id, root_cause, severity, suspected_vendor, remediation_steps, jira_url
    )

    def _post_message() -> dict:
        resp = httpx.post(
            f"{_SLACK_API}/chat.postMessage",
            json={
                "channel": effective_channel,
                "text": f"Incident approval required: {suspected_vendor} ({severity})",
                "blocks": blocks,
            },
            headers=_headers(effective_token),
            timeout=10.0,
        )
        resp.raise_for_status()
        return resp.json()

    try:
        data = _post_message()
        if not data.get("ok") and data.get("error") == "not_in_channel":
            # Bot is not a member — try joining (works for public channels)
            logger.info("Bot not in channel %s — attempting to join", effective_channel)
            _join_channel(effective_token, effective_channel)
            data = _post_message()
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
    bot_token: str = "",
    channel_id: str = "",
) -> str:
    """
    Replaces the approval buttons with the decision result.
    decision: 'approved' or 'rejected'
    bot_token / channel_id override env-var config when provided.
    """
    config = get_config()
    effective_token, effective_channel = _effective_slack_creds(bot_token, channel_id)

    if not (effective_token and effective_channel):
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
                "channel": effective_channel,
                "ts": message_ts,
                "blocks": blocks,
                "text": f"{label} by {decided_by}",
            },
            headers=_headers(effective_token),
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
    bot_token: str = "",
    channel_id: str = "",
) -> str:
    """
    Posts the final report as a threaded reply to the approval message.
    bot_token / channel_id override env-var config when provided.
    """
    config = get_config()
    effective_token, effective_channel = _effective_slack_creds(bot_token, channel_id)

    if not (effective_token and effective_channel):
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
                "channel": effective_channel,
                "thread_ts": approval_ts,
                "text": "Final incident report",
                "blocks": blocks,
            },
            headers=_headers(effective_token),
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
