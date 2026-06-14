import asyncio
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
    Always emits a 'slack_message' SSE event so the UI knows what happened.
    Returns the Slack message_ts so it can be stored and used for updates.
    """
    from backend.utils.config import get_config
    config = get_config()
    channel_id = (state_values.get("slack_channel_id_override") or "").strip() or config.slack_channel_id

    try:
        result_str = post_approval_message(
            run_id=run_id,
            root_cause=state_values.get("root_cause") or "Under investigation",
            severity=state_values.get("severity") or "unknown",
            suspected_vendor=state_values.get("suspected_vendor") or "Unknown",
            remediation_steps=state_values.get("remediation_steps") or [],
            jira_url=state_values.get("jira_ticket_url"),
            bot_token=state_values.get("slack_bot_token_override") or "",
            channel_id=state_values.get("slack_channel_id_override") or "",
        )
        result = json.loads(result_str)

        if result.get("skipped"):
            await send_sse_event(run_id, "slack_message", {
                "status": "skipped",
                "reason": result.get("reason", "Slack Bot not configured"),
            })
            return None

        if result.get("dry_run"):
            await send_sse_event(run_id, "slack_message", {
                "status": "dry_run",
                "channel_id": channel_id,
                "message_ts": result.get("message_ts", "0000000000.000000"),
            })
            logger.info("Slack dry_run — no real message posted")
            return result.get("message_ts")

        if result.get("error"):
            await send_sse_event(run_id, "slack_message", {
                "status": "error",
                "reason": result["error"],
            })
            return None

        if result.get("message_ts"):
            ts = result["message_ts"]
            ts_path = ts.replace(".", "")
            thread_url = f"https://slack.com/archives/{channel_id}/p{ts_path}"
            await send_sse_event(run_id, "slack_message", {
                "status": "posted",
                "channel_id": channel_id,
                "message_ts": ts,
                "thread_url": thread_url,
            })
            logger.info("Slack approval message posted (ts=%s)", ts)
            return ts

        return None

    except Exception as e:
        logger.error("send_slack_approval failed: %s", e)
        await send_sse_event(run_id, "slack_message", {
            "status": "error",
            "reason": str(e),
        })
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

        bot_token = state.get("slack_bot_token_override") or ""
        channel_id = state.get("slack_channel_id_override") or ""

        # Post final report thread to Slack
        if approval_ts:
            await send_sse_event(run_id, "tool_start", {
                "agent_name": "Slack Report",
                "detail": "post_report_thread"
            })
            await asyncio.to_thread(
                post_report_thread,
                approval_ts=approval_ts,
                final_report=final_report,
                jira_ticket_id=jira_ticket_id,
                bot_token=bot_token,
                channel_id=channel_id,
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
            await update_jira_status.ainvoke({"ticket_id": jira_ticket_id, "status": "Done"})
            await add_jira_comment.ainvoke({
                "ticket_id": jira_ticket_id,
                "comment": f"Incident resolved.\n\n{final_report[:2000]}"
            })
            await send_sse_event(run_id, "tool_end", {
                "agent_name": "Slack Report",
                "detail": "update_jira_status → Done"
            })

        parts = []
        if approval_ts:
            parts.append("Slack thread posted")
        if jira_ticket_id:
            parts.append("Jira updated to Done")
        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Slack Report",
            "detail": " and ".join(parts) if parts else "Completed (nothing to post)"
        })
        return state

    except Exception as e:
        logger.error("slack_report_node unexpected error: %s", e)
        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Slack Report",
            "detail": f"Non-fatal error: {e}"
        })
        return state
