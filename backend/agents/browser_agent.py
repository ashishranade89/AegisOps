import json
from backend.models.incident_state import IncidentState
from backend.tools.vendor_status_tool import check_vendor_status_page
from backend.tools.llm_config import get_llm, load_agent_rules
from langchain_core.messages import SystemMessage, HumanMessage
from backend.api.streaming import send_sse_event
import backend.utils.cost_tracker as cost_tracker

async def browser_node(state: IncidentState) -> IncidentState:
    run_id = state.get("incident_id", "CLI-RUN")
    llm = get_llm(state.get("openrouter_api_key"), state.get("llm_model"), state.get("llm_base_url"))
    
    await send_sse_event(run_id, "phase_change", {"phase": "root_cause_analysis"})
    await send_sse_event(run_id, "agent_start", {"agent_name": "Browser Scraper Agent"})
    
    vendor = state.get("suspected_vendor", "unknown")
    
    # Send tool call start
    await send_sse_event(run_id, "tool_start", {"agent_name": "Browser Scraper Agent", "detail": "check_vendor_status_page"})
    
    try:
        # Run tool — pass OpenRouter key so Stagehand can use the LLM for extraction
        result_str = await check_vendor_status_page.ainvoke({
            "vendor_name": vendor,
            "api_key": state.get("openrouter_api_key") or "",
        })
        result_data = json.loads(result_str)
        
        await send_sse_event(run_id, "tool_end", {"agent_name": "Browser Scraper Agent", "detail": "check_vendor_status_page"})

        # Broadcast the raw scrape result so the frontend can render a live status card
        await send_sse_event(run_id, "browser_result", result_data)

        # Analyze findings via LLM
        prompt = (
            "Analyze the following status page scraping results for a vendor:\n\n"
            f"SCRAPER RESULT:\n{result_str}\n\n"
            "Does the scraper report confirm an active outage or service degradation?\n"
            "Respond in strict JSON format with keys:\n"
            '{"has_outage": true/false, "findings": "brief summary", "needs_web_search": true/false}'
        )
        
        rules = load_agent_rules()
        system_content = "You parse scraped status pages and assess outage status."
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

        cost_info = cost_tracker.record(run_id, "Browser Scraper Agent", response, state.get("llm_model"))
        await send_sse_event(run_id, "cost_update", cost_info)

        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Browser Scraper Agent",
            "detail": f"Scrape completed. Outage confirmed: {analysis.get('has_outage')}"
        })
        
        # Always run web search for independent online confirmation if a Tavily key is set
        run_web_search = bool(state.get("tavily_api_key")) or analysis.get("needs_web_search", False)

        return {
            **state,
            "browser_result": result_data,
            "needs_web_search": run_web_search,
            "root_cause": f"Status Page Outage: {analysis.get('findings')}" if analysis.get("has_outage") else state.get("root_cause"),
            "messages": [response],
            "last_error": None
        }
    except Exception as e:
        await send_sse_event(run_id, "tool_end", {"agent_name": "Browser Scraper Agent", "detail": "check_vendor_status_page"})
        await send_sse_event(run_id, "agent_end", {
            "agent_name": "Browser Scraper Agent",
            "detail": f"Scraper error: {str(e)}"
        })
        return {
            **state,
            "last_error": str(e),
            "failed_node": "browser"
        }
