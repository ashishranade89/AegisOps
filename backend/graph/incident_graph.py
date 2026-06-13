from langgraph.graph import StateGraph, END
from backend.models.incident_state import IncidentState
from backend.agents.triage_agent import triage_node
from backend.agents.rca_agent import rca_node
from backend.agents.browser_agent import browser_node
from backend.agents.web_search_agent import web_search_node
from backend.agents.self_heal_agent import self_heal_node
from backend.agents.remediation_agent import remediation_node
from backend.agents.reporter_agent import reporter_node
from backend.memory.incident_rag import search_incident_history, store_resolved_incident
import json
import logging
from backend.api.streaming import send_sse_event

logger = logging.getLogger(__name__)

# ── Node Definitions ─────────────────────────────────────────

async def rag_search_node(state: IncidentState) -> IncidentState:
    """Wraps local ChromaDB query inside a state graph node."""
    run_id = state.get("incident_id", "CLI-RUN")
    await send_sse_event(run_id, "phase_change", {"phase": "root_cause_analysis"})
    await send_sse_event(run_id, "agent_start", {"agent_name": "RAG Cache Lookup"})
    
    try:
        symptoms = state.get("internal_findings") or "generic alert"
        vendor = state.get("suspected_vendor") or "unknown"
        
        await send_sse_event(run_id, "tool_start", {"agent_name": "RAG Cache Lookup", "detail": "search_incident_history"})
        
        result_str = await search_incident_history.ainvoke({
            "symptoms": symptoms,
            "vendor_name": vendor,
            "model_name": state.get("llm_model"),
            "api_key": state.get("openrouter_api_key") or "",
            "base_url": state.get("llm_base_url") or ""
        })
        result_data = json.loads(result_str)
        
        await send_sse_event(run_id, "tool_end", {"agent_name": "RAG Cache Lookup", "detail": "search_incident_history"})
        
        confidence = result_data.get("confidence", 0.0)
        found = result_data.get("found", False)
        
        await send_sse_event(run_id, "agent_end", {
            "agent_name": "RAG Cache Lookup",
            "detail": f"Search complete. Match found: {found} (confidence: {confidence})"
        })
        
        return {
            **state,
            "rag_result": result_data,
            "rag_confidence": confidence,
            "last_error": None
        }
    except Exception as e:
        logger.error("RAG search node failed: %s", e)
        await send_sse_event(run_id, "agent_end", {
            "agent_name": "RAG Cache Lookup",
            "detail": f"Error in RAG: {str(e)}"
        })
        return {
            **state,
            "last_error": str(e),
            "failed_node": "rag_search_node"
        }

async def store_incident_node(state: IncidentState) -> IncidentState:
    """Enriches the persistent vector store with the resolved postmortem details."""
    run_id = state.get("incident_id", "CLI-RUN")
    await send_sse_event(run_id, "agent_start", {"agent_name": "RAG Storage Node"})
    
    try:
        await send_sse_event(run_id, "tool_start", {"agent_name": "RAG Storage Node", "detail": "store_resolved_incident"})
        
        await store_resolved_incident.ainvoke({
            "incident_id": state["incident_id"],
            "symptoms": state.get("internal_findings") or "None",
            "vendor_name": state.get("suspected_vendor") or "None",
            "root_cause": state.get("root_cause") or "None",
            "resolution": ", ".join(state.get("remediation_steps", [])),
            "duration_minutes": 15,
            "model_name": state.get("llm_model"),
            "api_key": state.get("openrouter_api_key") or "",
            "base_url": state.get("llm_base_url") or ""
        })
        
        await send_sse_event(run_id, "tool_end", {"agent_name": "RAG Storage Node", "detail": "store_resolved_incident"})
    except Exception as e:
        logger.error("Database storage failed: %s", e)
        
    await send_sse_event(run_id, "agent_end", {
        "agent_name": "RAG Storage Node",
        "detail": "Resolution stored. Incident archived."
    })
    return state

# ── Dynamic Conditional Routing Logic ────────────────────────

def route_after_rag(state: IncidentState) -> str:
    if state.get("last_error"):
        return "self_heal"
    
    confidence = state.get("rag_confidence", 0.0)
    # If confidence is 0.85 or higher, skip browser and web search (route directly to remediation)
    if confidence >= 0.85:
        return "remediation"
    return "rca"

def route_after_rca(state: IncidentState) -> str:
    if state.get("last_error"):
        return "self_heal"
    if state.get("needs_human_escalation"):
        return "reporter"
    if state.get("needs_browser"):
        return "browser"
    if state.get("needs_web_search"):
        return "web_search"
    return "remediation"

def route_after_browser(state: IncidentState) -> str:
    if state.get("last_error"):
        return "self_heal"
    if state.get("needs_web_search"):
        return "web_search"
    return "remediation"

def route_after_web_search(state: IncidentState) -> str:
    if state.get("last_error"):
        return "self_heal"
    return "remediation"

def route_after_self_heal(state: IncidentState) -> str:
    if state.get("needs_human_escalation"):
        return "reporter"
    if state.get("needs_web_search") and not state.get("needs_browser"):
        return "web_search"
    if state.get("needs_browser"):
        return "browser"
    return "rca"

def route_after_remediation(state: IncidentState) -> str:
    if state.get("last_error"):
        return "self_heal"
    return "reporter"

# ── Building the Stateful Directed Acyclic Graph ─────────────

_compiled_graph = None


def get_compiled_graph():
    if _compiled_graph is None:
        raise RuntimeError("LangGraph not initialized — call init_incident_graph() during app startup.")
    return _compiled_graph


def init_incident_graph(checkpointer) -> None:
    global _compiled_graph
    _compiled_graph = build_incident_graph(checkpointer)


def build_incident_graph(checkpointer) -> StateGraph:
    builder = StateGraph(IncidentState)
    
    # Adding processing nodes
    builder.add_node("triage", triage_node)
    builder.add_node("rag_search", rag_search_node)
    builder.add_node("rca", rca_node)
    builder.add_node("browser", browser_node)
    builder.add_node("web_search", web_search_node)
    builder.add_node("self_heal", self_heal_node)
    builder.add_node("remediation", remediation_node)
    builder.add_node("reporter", reporter_node)
    builder.add_node("store_incident", store_incident_node)
    
    # Execution topology flow
    builder.set_entry_point("triage")
    builder.add_edge("triage", "rag_search")
    
    # Intelligent conditional edges
    builder.add_conditional_edges("rag_search", route_after_rag, {
        "remediation": "remediation",
        "rca": "rca",
        "self_heal": "self_heal"
    })
    builder.add_conditional_edges("rca", route_after_rca, {
        "browser": "browser",
        "web_search": "web_search",
        "remediation": "remediation",
        "reporter": "reporter",
        "self_heal": "self_heal"
    })
    builder.add_conditional_edges("browser", route_after_browser, {
        "web_search": "web_search",
        "remediation": "remediation",
        "self_heal": "self_heal"
    })
    builder.add_conditional_edges("web_search", route_after_web_search, {
        "remediation": "remediation",
        "self_heal": "self_heal"
    })
    builder.add_conditional_edges("self_heal", route_after_self_heal, {
        "rca": "rca",
        "browser": "browser",
        "web_search": "web_search",
        "reporter": "reporter"
    })
    builder.add_conditional_edges("remediation", route_after_remediation, {
        "reporter": "reporter",
        "self_heal": "self_heal"
    })
    
    builder.add_edge("reporter", "store_incident")
    builder.add_edge("store_incident", END)
    
    return builder.compile(checkpointer=checkpointer, interrupt_before=["remediation"])
