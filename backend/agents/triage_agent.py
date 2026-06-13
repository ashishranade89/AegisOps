import asyncio
from backend.models.incident_state import IncidentState
from backend.tools.llm_config import get_llm, load_agent_rules
from backend.tools.slack_tool import post_slack_notification
from langchain_core.messages import SystemMessage, HumanMessage
from backend.api.streaming import send_sse_event
import backend.utils.cost_tracker as cost_tracker

async def triage_node(state: IncidentState) -> IncidentState:
    run_id = state.get("incident_id", "CLI-RUN")
    llm = get_llm(state.get("openrouter_api_key"), state.get("llm_model"), state.get("llm_base_url"))

    # Notify SSE listeners of phase change
    await send_sse_event(run_id, "phase_change", {"phase": "triage"})
    await send_sse_event(run_id, "agent_start", {"agent_name": "Triage Agent"})

    # Truncate logs to last 50 entries to keep prompt tokens low
    logs = state.get("raw_logs", [])[-50:]
    metrics = state.get("raw_metrics", {})
    
    prompt = (
        "You are an AI Ops Triage Agent. Inspect the following raw application logs and metrics:\n\n"
        f"LOGS:\n{logs}\n\n"
        f"METRICS:\n{metrics}\n\n"
        "Determine:\n"
        "1. Suspected Vendor (e.g., Stripe, AWS, Twilio, Cloudflare, GitHub)\n"
        "2. Severity (sev1, sev2, sev3, or sev4)\n"
        "3. Internal Findings summary (what is failing internally)\n"
        "4. Affected Service (the main service impacted)\n"
        "5. Events (list of events extracted from logs, with timestamp, service, level, message, error_code, category)\n\n"
        "Return your response in strict JSON format with keys:\n"
        '{"suspected_vendor": "...", "severity": "...", "internal_findings": "...", "affected_service": "...", "events": [{"timestamp": "...", "service": "...", "level": "...", "message": "...", "error_code": "...", "category": "..."}]}'
    )
    
    try:
        rules = load_agent_rules()
        system_content = "You analyze incident logs and return structured JSON summaries."
        if rules:
            system_content += f"\n\nStrict Guidelines to Follow:\n{rules}"
            
        response = await llm.ainvoke([
            SystemMessage(content=system_content),
            HumanMessage(content=prompt)
        ])
        
        import json
        clean_content = response.content.strip()
        # strip markdown code blocks if any
        if clean_content.startswith("```json"):
            clean_content = clean_content[7:]
        if clean_content.endswith("```"):
            clean_content = clean_content[:-3]
            
        data = json.loads(clean_content.strip())

        # Record LLM cost and emit to UI
        cost_info = cost_tracker.record(run_id, "Triage Agent", response, state.get("llm_model"))
        await send_sse_event(run_id, "cost_update", cost_info)

        # Trigger Slack webhook notification for Triage Alert!
        await send_sse_event(run_id, "tool_start", {"agent_name": "Triage Agent", "detail": "post_slack_notification"})
        await post_slack_notification.ainvoke({
            "channel": "incident-alerts",
            "message": (
                f"🚨 *New Incident Triaged by Admin* 🚨\n"
                f"• *Incident ID*: `{run_id}`\n"
                f"• *Suspected Vendor*: `{data.get('suspected_vendor')}`\n"
                f"• *Severity*: `{data.get('severity')}`\n"
                f"• *Affected Service*: `{data.get('affected_service', 'Unknown')}`\n"
                f"• *Internal Findings*: {data.get('internal_findings')}"
            )
        })
        await send_sse_event(run_id, "tool_end", {"agent_name": "Triage Agent", "detail": "post_slack_notification"})
        
        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Triage Agent",
            "detail": f"Suspect: {data.get('suspected_vendor')}, Severity: {data.get('severity')}"
        })
        
        return {
            **state,
            "suspected_vendor": data.get("suspected_vendor"),
            "severity": data.get("severity"),
            "internal_findings": data.get("internal_findings"),
            "affected_service": data.get("affected_service"),
            "events": data.get("events", []),
            "messages": [response]
        }
    except Exception as e:
        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Triage Agent",
            "detail": f"Error during triage: {str(e)}"
        })
        return {
            **state,
            "last_error": str(e),
            "failed_node": "triage"
        }
