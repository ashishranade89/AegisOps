import json
from backend.models.incident_state import IncidentState
from backend.tools.llm_config import get_llm, load_agent_rules
from langchain_core.messages import SystemMessage, HumanMessage
from backend.api.streaming import send_sse_event
import backend.utils.cost_tracker as cost_tracker

async def reporter_node(state: IncidentState) -> IncidentState:
    run_id = state.get("incident_id", "CLI-RUN")
    # Reporter needs more tokens to generate a full postmortem
    llm = get_llm(state.get("openrouter_api_key"), state.get("llm_model"), max_tokens=2000)
    
    await send_sse_event(run_id, "phase_change", {"phase": "reporting"})
    await send_sse_event(run_id, "agent_start", {"agent_name": "Incident Reporter"})
    
    vendor = state.get("suspected_vendor", "unknown")
    severity = state.get("severity", "P2")
    findings = state.get("internal_findings", "No findings.")
    rag = state.get("rag_result") or {}
    browser = state.get("browser_result") or {}
    search = state.get("web_search_result")
    steps = state.get("remediation_steps") or []
    root_cause = state.get("root_cause", "Third-party vendor outage.")
    hypotheses = state.get("hypotheses") or []
    approval = state.get("approval") or {}

    search_section = (
        json.dumps(search, indent=2) if search
        else "Not executed — browser investigation provided sufficient confirmation."
    )
    approval_section = (
        f"Status: {approval.get('status', 'approved')} | Judge: {approval.get('judge_name', 'operator')} | Notes: {approval.get('comments', 'None')}"
        if approval.get('status') else "Auto-approved (no human gate triggered)"
    )

    prompt = (
        "You are an AI Ops Incident Reporter. Compile a comprehensive, production-grade Postmortem Incident Report in Markdown format.\n\n"
        "Include sections: Executive Summary, Timeline, Root Cause Analysis, Impact Assessment, Remediation Steps, Lessons Learned, and Action Items.\n\n"
        "Input details:\n"
        f"- Incident ID: {run_id}\n"
        f"- Severity: {severity}\n"
        f"- Suspected Vendor: {vendor}\n"
        f"- Internal Telemetry: {findings}\n"
        f"- Historical Context (RAG): {rag}\n"
        f"- Live Status Page Scrape: {json.dumps(browser, indent=2) if browser else 'Not executed'}\n"
        f"- Web Search Findings: {search_section}\n"
        f"- Root Cause: {root_cause}\n"
        f"- AI Hypotheses: {hypotheses}\n"
        f"- Human Review: {approval_section}\n"
        f"- Remediation Steps: {steps}\n\n"
        "Additionally, generate a dispatch_payload and a mock_ticket.\n"
        "Return your response in strict JSON format:\n"
        '{"final_report": "Markdown string...", "dispatch_payload": {"channel": "webhook", "title": "...", "severity": "...", "summary": "...", "actions": ["..."]}, "mock_ticket": {"ticket_type": "incident", "priority": "P1|P2|P3|P4", "summary": "...", "description": "...", "owner_team": "...", "labels": ["..."]}}'
    )
    
    try:
        rules = load_agent_rules()
        system_content = "You generate exhaustive Markdown postmortems and structured dispatch payloads for IT outages."
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
        report = data.get("final_report", "No report generated.")
        dispatch_payload = data.get("dispatch_payload")
        mock_ticket = data.get("mock_ticket")

        cost_info = cost_tracker.record(run_id, "Incident Reporter", response, state.get("llm_model"))
        await send_sse_event(run_id, "cost_update", cost_info)

        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Incident Reporter",
            "detail": "Final postmortem report, dispatch payload, and ticket generated."
        })
        
        return {
            **state,
            "final_report": report,
            "dispatch_payload": dispatch_payload,
            "mock_ticket": mock_ticket,
            "messages": [response],
            "last_error": None
        }
    except Exception as e:
        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Incident Reporter",
            "detail": f"Reporting failed: {str(e)}"
        })
        return {
            **state,
            "last_error": str(e),
            "failed_node": "reporter"
        }
