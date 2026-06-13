import json
from backend.models.incident_state import IncidentState
from backend.tools.web_search_tool import search_vendor_outage_online
from backend.tools.llm_config import get_llm, load_agent_rules
from langchain_core.messages import SystemMessage, HumanMessage
from backend.api.streaming import send_sse_event
import backend.utils.cost_tracker as cost_tracker

async def web_search_node(state: IncidentState) -> IncidentState:
    run_id = state.get("incident_id", "CLI-RUN")
    llm = get_llm(state.get("openrouter_api_key"), state.get("llm_model"))
    tavily_key = state.get("tavily_api_key")
    
    await send_sse_event(run_id, "phase_change", {"phase": "root_cause_analysis"})
    await send_sse_event(run_id, "agent_start", {"agent_name": "Web Search Agent"})
    
    vendor = state.get("suspected_vendor", "unknown")
    symptoms = state.get("internal_findings", "API timeouts")
    
    # Send tool call start
    await send_sse_event(run_id, "tool_start", {"agent_name": "Web Search Agent", "detail": "search_vendor_outage_online"})
    
    try:
        # Run search tool
        result_str = await search_vendor_outage_online.ainvoke({
            "vendor_name": vendor,
            "symptoms": symptoms,
            "tavily_api_key": tavily_key
        })
        result_data = json.loads(result_str)
        
        await send_sse_event(run_id, "tool_end", {"agent_name": "Web Search Agent", "detail": "search_vendor_outage_online"})
        
        # Analyze findings via LLM
        prompt = (
            "Analyze the following web search results regarding a potential third-party vendor outage:\n\n"
            f"VENDOR: {vendor}\n"
            f"SEARCH RESULTS:\n{result_str}\n\n"
            "Summarize if there is external confirmation of an outage. Include details from Twitter, DownDetector, etc.\n"
            "Respond in strict JSON format with keys:\n"
            '{"outage_confirmed": true/false, "summary": "brief summary of external validation", "citations": ["url1", "url2"]}'
        )
        
        rules = load_agent_rules()
        system_content = "You analyze search queries and synthesize third-party outage reports."
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
            
        analysis = json.loads(clean_content.strip())

        cost_info = cost_tracker.record(run_id, "Web Search Agent", response, state.get("llm_model"))
        await send_sse_event(run_id, "cost_update", cost_info)

        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Web Search Agent",
            "detail": f"Search complete. Outage verified: {analysis.get('outage_confirmed')}"
        })
        
        return {
            **state,
            "web_search_result": result_data,
            "root_cause": f"Online Outage Confirmation: {analysis.get('summary')}" if analysis.get("outage_confirmed") else state.get("root_cause"),
            "messages": [response],
            "last_error": None
        }
    except Exception as e:
        await send_sse_event(run_id, "tool_end", {"agent_name": "Web Search Agent", "detail": "search_vendor_outage_online"})
        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Web Search Agent",
            "detail": f"Search error: {str(e)}"
        })
        return {
            **state,
            "last_error": str(e),
            "failed_node": "web_search"
        }
