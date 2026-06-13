from backend.models.incident_state import IncidentState
from backend.api.streaming import send_sse_event

async def self_heal_node(state: IncidentState) -> IncidentState:
    run_id = state.get("incident_id", "CLI-RUN")
    
    # Increment retry counter
    retries = state.get("retry_count", 0) + 1
    failed_node = state.get("failed_node", "unknown")
    error_msg = state.get("last_error", "No error captured.")
    
    # Send a warning/error notification via SSE so the UI shows self-healing is active!
    await send_sse_event(run_id, "error", {
        "message": f"Self-Healing: Node '{failed_node}' failed with: {error_msg}. Retrying (attempt {retries})..."
    })
    await send_sse_event(run_id, "agent_start", {"agent_name": "Self-Heal Agent"})
    
    # Plan recovery paths based on where it failed
    needs_browser = state.get("needs_browser", False)
    needs_web_search = state.get("needs_web_search", False)
    needs_human_escalation = False
    
    if retries > 3:
        # Prevent infinite loops, route to human escalation
        needs_human_escalation = True
        needs_browser = False
        needs_web_search = False
        await send_sse_event(run_id, "error", {"message": "Max retry limit exceeded. Escalating to engineering team."})
    else:
        if failed_node == "browser":
            # If Stagehand failed, fallback to web search directly
            needs_browser = False
            needs_web_search = True
        elif failed_node == "web_search":
            # If web search failed too, escalate to human
            needs_web_search = False
            needs_human_escalation = True
            
    await send_sse_event(run_id, "agent_end", {
        "agent_name": "Self-Heal Agent",
        "detail": f"Rerouting... Browser: {needs_browser}, Web Search: {needs_web_search}, Escalation: {needs_human_escalation}"
    })
    
    return {
        **state,
        "retry_count": retries,
        "needs_browser": needs_browser,
        "needs_web_search": needs_web_search,
        "needs_human_escalation": needs_human_escalation,
        "last_error": None, # clear error to allow re-entry
        "failed_node": None
    }
