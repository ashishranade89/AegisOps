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
