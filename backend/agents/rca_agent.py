import json
from backend.models.incident_state import IncidentState
from backend.tools.llm_config import get_llm, load_agent_rules
from langchain_core.messages import SystemMessage, HumanMessage
from backend.api.streaming import send_sse_event
import backend.utils.cost_tracker as cost_tracker
import logging

async def rca_node(state: IncidentState) -> IncidentState:
    run_id = state.get("incident_id", "CLI-RUN")
    llm = get_llm(state.get("openrouter_api_key"), state.get("llm_model"))
    # Emit masked key for debugging authentication issues
    try:
        masked_key = (state.get("openrouter_api_key") or "")[:8]
        logging.getLogger(__name__).info("rca_node using openrouter_api_key=%s...", masked_key)
        print(f"[DEBUG] rca_node openrouter_api_key={masked_key}...")
    except Exception:
        pass
    await send_sse_event(run_id, "phase_change", {"phase": "root_cause_analysis"})
    await send_sse_event(run_id, "agent_start", {"agent_name": "Root Cause Analyzer"})
    
    findings = state.get("internal_findings", "No internal findings.")
    vendor = state.get("suspected_vendor", "unknown")
    rag = state.get("rag_result")
    events = state.get("events", [])
    
    prompt = (
        "You are an AI Ops Root Cause Analyzer. Review the internal incident findings, events, and historical RAG lookup:\n\n"
        f"INTERNAL FINDINGS: {findings}\n"
        f"EVENTS: {events}\n"
        f"SUSPECTED VENDOR: {vendor}\n"
        f"RAG MEMORY LOOKUP RESULT: {rag}\n\n"
        "Tasks:\n"
        "1. Identify the routing steps. If vendor suspected, set needs_browser = true. If unknown, set needs_web_search = true. If completely lost, needs_human_escalation = true.\n"
        "2. Provide a preliminary root_cause string.\n"
        "3. Generate a list of hypotheses with confidence (0.0 to 1.0), label (application|infrastructure|vendor|network|configuration|unknown), and a rationale list.\n"
        "4. Output an overall confidence_score (0.0 to 1.0).\n\n"
        "Return strict JSON with keys:\n"
        '{"needs_browser": bool, "needs_web_search": bool, "needs_human_escalation": bool, "root_cause": "...", "confidence_score": 0.0, "hypotheses": [{"label": "...", "confidence": 0.0, "rationale": ["...", "..."]}]}'
    )
    
    try:
        rules = load_agent_rules()
        system_content = "You determine the investigation routing path and formulate root cause hypotheses."
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

        cost_info = cost_tracker.record(run_id, "Root Cause Analyzer", response, state.get("llm_model"))
        await send_sse_event(run_id, "cost_update", cost_info)

        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Root Cause Analyzer",
            "detail": f"Browser needed: {data.get('needs_browser')}, Confidence: {data.get('confidence_score', 0.0)}"
        })
        
        return {
            **state,
            "needs_browser": data.get("needs_browser", False),
            "needs_web_search": data.get("needs_web_search", False),
            "needs_human_escalation": data.get("needs_human_escalation", False),
            "root_cause": data.get("root_cause"),
            "hypotheses": data.get("hypotheses", []),
            "confidence_score": data.get("confidence_score", 0.0),
            "messages": [response]
        }
    except Exception as e:
        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Root Cause Analyzer",
            "detail": f"Error during RCA routing: {str(e)}"
        })
        return {
            **state,
            "last_error": str(e),
            "failed_node": "rca"
        }
