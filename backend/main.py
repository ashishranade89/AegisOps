import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import argparse
import asyncio
import logging

from dotenv import load_dotenv
from langgraph.checkpoint.memory import MemorySaver

from backend.graph.incident_graph import get_compiled_graph, init_incident_graph
from backend.simulators.payment_outage import generate_payment_scenario, list_payment_scenarios
from backend.utils.config import get_config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def run_cli(scenario_type: str, model: str):
    load_dotenv()
    init_incident_graph(MemorySaver())

    logger.info("Starting CLI Outage Investigator for scenario: %s", scenario_type)

    try:
        payload = generate_payment_scenario(scenario_type)
    except ValueError as e:
        logger.error(e)
        scenarios = [s["scenario_type"] for s in list_payment_scenarios()]
        logger.info("Available scenarios: %s", ", ".join(scenarios))
        sys.exit(1)

    config = get_config()
    initial_state = {
        "incident_id": f"CLI-{scenario_type.upper()}",
        "raw_logs": payload["raw_logs"],
        "raw_metrics": payload["raw_metrics"],
        "severity": None,
        "internal_findings": None,
        "suspected_vendor": None,
        "rag_result": None,
        "rag_confidence": None,
        "browser_result": None,
        "web_search_result": None,
        "root_cause": None,
        "remediation_steps": [],
        "final_report": None,
        "retry_count": 0,
        "last_error": None,
        "failed_node": None,
        "needs_browser": False,
        "needs_web_search": False,
        "needs_human_escalation": False,
        "openrouter_api_key": config.openrouter_api_key or None,
        "tavily_api_key": config.tavily_api_key or None,
        "llm_model": model,
        "llm_base_url": None,
        "agent_costs": {},
        "total_cost_usd": 0.0,
        "messages": [],
    }

    logger.info("Invoking LangGraph pipeline...")
    graph = get_compiled_graph()
    thread_config = {"configurable": {"thread_id": initial_state["incident_id"]}}
    result = await graph.ainvoke(initial_state, config=thread_config)

    print("\n" + "=" * 80)
    print("  FINAL INCIDENT POSTMORTEM REPORT")
    print("=" * 80 + "\n")
    print(result.get("final_report") or "No report generated.")
    print("\n" + "=" * 80 + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CLI Runner for Third-Party Outage Investigator")
    parser.add_argument(
        "--scenario",
        type=str,
        default="stripe_outage",
        help="Simulated scenario type (stripe_outage, aws_s3_degradation, etc.)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="openai/gpt-4o",
        help="LLM model via OpenRouter",
    )

    args = parser.parse_args()
    asyncio.run(run_cli(args.scenario, args.model))
