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
