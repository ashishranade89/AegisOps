from typing import TypedDict, Annotated, Literal, List, Optional, Dict
from langgraph.graph.message import add_messages
from pydantic import BaseModel

# --- New IncidentPilot Pydantic Models ---

class Event(BaseModel):
    timestamp: str
    service: str
    level: str
    message: str
    error_code: Optional[str] = None
    category: Optional[str] = None

class SimilarCase(BaseModel):
    incident_id: str
    title: str
    similarity: float
    root_cause: str
    remediation: str

class Hypothesis(BaseModel):
    label: Literal["application", "infrastructure", "vendor", "network", "configuration", "unknown"]
    confidence: float
    rationale: List[str]

class ActionItem(BaseModel):
    title: str
    action: str
    priority: Literal["high", "medium", "low"]
    rationale: str

class DispatchPayload(BaseModel):
    channel: Literal["console", "webhook"]
    title: str
    severity: str
    summary: str
    actions: List[str]

class ApprovalDecision(BaseModel):
    status: Literal["approved", "rejected", "needs_changes", "pending"]
    judge_name: Optional[str] = None
    comments: Optional[str] = None

# --- Main State Definition ---

class IncidentState(TypedDict):
    # Input Data (Legacy + Upgraded)
    incident_id: str
    raw_logs: list[dict]
    raw_metrics: dict
    raw_log_text: Optional[str]
    filename: Optional[str]
    
    # Enrichment
    severity: Literal["P1", "P2", "P3", "P4", "sev1", "sev2", "sev3", "sev4"] | None
    internal_findings: str | None
    suspected_vendor: str | None
    affected_service: Optional[str]
    events: Optional[List[dict]]  # dict representation of Event
    categories: Optional[List[str]]
    
    # RAG Context
    rag_result: dict | None
    rag_confidence: float | None
    similar_cases: Optional[List[dict]] # dict representation of SimilarCase
    
    # Live Investigation Findings
    browser_result: dict | None
    web_search_result: dict | None
    evidence_links: Optional[List[str]]
    
    # Resolution details
    root_cause: str | None
    remediation_steps: list[str]
    final_report: str | None
    hypotheses: Optional[List[dict]] # dict representation of Hypothesis
    recommendations: Optional[List[dict]] # dict representation of ActionItem
    
    # Self-Healing & Exception tracking
    retry_count: int
    last_error: str | None
    failed_node: str | None
    reflection_notes: Optional[List[str]]
    
    # Routing signals
    needs_browser: bool
    needs_web_search: bool
    needs_human_escalation: bool
    
    # Approval & Dispatch (IncidentPilot specifics)
    dispatch_payload: Optional[dict] # dict representation of DispatchPayload
    mock_ticket: Optional[Dict]
    approval: Optional[dict] # dict representation of ApprovalDecision
    confidence_score: Optional[float]
    
    # Custom API Keys from UI
    openrouter_api_key: str | None
    tavily_api_key: str | None
    llm_model: str | None
    llm_base_url: str | None

    # Live cost tracking — populated by each agent after every LLM call
    agent_costs: dict | None        # {agent_name: {input_tokens, output_tokens, cost_usd}}
    total_cost_usd: float | None

    # Conversation thread history (for model memory)
    messages: Annotated[list, add_messages]
