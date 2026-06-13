import json
from backend.models.incident_state import IncidentState
from backend.tools.slack_tool import post_slack_notification
from backend.tools.llm_config import get_llm, load_agent_rules
from langchain_core.messages import SystemMessage, HumanMessage
from backend.api.streaming import send_sse_event
import backend.utils.cost_tracker as cost_tracker

async def remediation_node(state: IncidentState) -> IncidentState:
    run_id = state.get("incident_id", "CLI-RUN")

    approval = state.get("approval") or {}
    approval_status = approval.get("status")
    judge = approval.get("judge_name") or "operator"
    comments = approval.get("comments") or ""

    if approval_status == "rejected":
        await send_sse_event(run_id, "phase_change", {"phase": "remediation"})
        await send_sse_event(run_id, "agent_start", {"agent_name": "Remediation Agent"})
        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Remediation Agent",
            "detail": f"Remediation blocked — rejected by {judge}.",
        })
        return {
            **state,
            "remediation_steps": [f"Remediation rejected by {judge}: {comments or 'No comments provided.'}"],
            "needs_human_escalation": True,
            "last_error": None,
        }

    if approval_status == "needs_changes":
        await send_sse_event(run_id, "phase_change", {"phase": "remediation"})
        await send_sse_event(run_id, "agent_start", {"agent_name": "Remediation Agent"})
        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Remediation Agent",
            "detail": f"Remediation deferred — changes requested by {judge}.",
        })
        return {
            **state,
            "remediation_steps": [f"Changes requested by {judge}: {comments or 'Revise plan before executing remediation.'}"],
            "needs_human_escalation": True,
            "last_error": None,
        }

    llm = get_llm(state.get("openrouter_api_key"), state.get("llm_model"), state.get("llm_base_url"))
    
    await send_sse_event(run_id, "phase_change", {"phase": "remediation"})
    await send_sse_event(run_id, "agent_start", {"agent_name": "Remediation Agent"})
    
    vendor = state.get("suspected_vendor", "unknown")
    root_cause = state.get("root_cause", "Third-party vendor dependency outage.")
    hypotheses = state.get("hypotheses", [])
    
    prompt = (
        "You are an AI Ops Remediation Agent. Based on the confirmed third-party vendor outage, propose concrete containment actions:\n\n"
        f"SUSPECTED VENDOR: {vendor}\n"
        f"ROOT CAUSE SUMMARY: {root_cause}\n"
        f"HYPOTHESES: {hypotheses}\n\n"
        "Provide a list of containment tasks. Also generate a structured list of recommendations (ActionItem).\n"
        "Respond in strict JSON format with keys:\n"
        '{"remediation_steps": ["step 1", "step 2", ...], "alert_summary": "slack alert text", "recommendations": [{"title": "...", "action": "...", "priority": "high|medium|low", "rationale": "..."}]}'
    )
    
    try:
        rules = load_agent_rules()
        system_content = "You propose operational mitigations for third-party outages."
        if rules:
            system_content += f"\n\nStrict Guidelines to Follow:\n{rules}"
            
        response = await llm.ainvoke([
            SystemMessage(content=system_content),
            HumanMessage(content=prompt)
        ])
        
        clean_content = response.content.strip()
        if clean_content.startswith("```json"):
            clean_content = clean_content[7:]
        if clean_content.endswith("```"):
            clean_content = clean_content[:-3]
            
        data = json.loads(clean_content.strip())
        cost_info = cost_tracker.record(run_id, "Remediation Agent", response, state.get("llm_model"))
        await send_sse_event(run_id, "cost_update", cost_info)
        steps = data.get("remediation_steps", [])
        recommendations = data.get("recommendations", [])
        alert_text = data.get("alert_summary", f"Proposed remediation: {', '.join(steps)}")
        
        # Call Slack tool
        await send_sse_event(run_id, "tool_start", {"agent_name": "Remediation Agent", "detail": "post_slack_notification"})
        slack_result = await post_slack_notification.ainvoke({
            "channel": "incident-alerts",
            "message": f"*Incident REMEDIATION Action Planned for {vendor}:*\n\n" + "\n".join(f"• {step}" for step in steps)
        })
        await send_sse_event(run_id, "tool_end", {"agent_name": "Remediation Agent", "detail": "post_slack_notification"})
        
        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Remediation Agent",
            "detail": f"Remediation planned: {len(steps)} steps proposed."
        })
        
        return {
            **state,
            "remediation_steps": steps,
            "recommendations": recommendations,
            "messages": [response],
            "last_error": None
        }
    except Exception as e:
        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Remediation Agent",
            "detail": f"Remediation failed: {str(e)}"
        })
        return {
            **state,
            "last_error": str(e),
            "failed_node": "remediation"
        }
