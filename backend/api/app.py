import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import asyncio
import logging
import uuid
from contextlib import asynccontextmanager

# Unique ID generated once per backend process — frontend uses this to detect restarts
SERVER_INSTANCE_ID = str(uuid.uuid4())

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from pydantic import BaseModel, ValidationError
from sse_starlette.sse import EventSourceResponse

from backend.api.auth import require_api_auth
from backend.api.persistence import init_runs_db, persist_run
from backend.api.secrets import resolve_llm_credentials
from backend.api.streaming import create_run, event_generator, get_run, send_sse_event
from backend.models.incident_state import ApprovalDecision
from backend.simulators.payment_outage import list_payment_scenarios
from backend.utils.config import get_config

import base64
import hashlib
import hmac
import httpx
import json
import time
from backend.agents.slack_agent import send_slack_approval
from backend.tools.slack_bot_tool import update_approval_message
from backend.tools.jira_tool import update_jira_status, add_jira_comment

# ─── Test-connection models ────────────────────────────────────────────────────

class TestSlackRequest(BaseModel):
    slack_bot_token: str
    slack_channel_id: str


class TestJiraRequest(BaseModel):
    jira_base_url: str
    jira_email: str
    jira_api_token: str


class TestConnectionResponse(BaseModel):
    ok: bool
    message: str


logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Enable detailed httpx/httpcore logs to inspect outgoing request headers when debugging
logging.getLogger("httpx").setLevel(logging.DEBUG)
logging.getLogger("httpcore").setLevel(logging.DEBUG)
logging.getLogger("backend.tools.llm_config").setLevel(logging.DEBUG)

_checkpointer = None
_running_tasks = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _checkpointer
    load_dotenv()
    init_runs_db()

    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
    from backend.graph.incident_graph import init_incident_graph

    db_path = get_config().checkpoint_db_path
    async with AsyncSqliteSaver.from_conn_string(str(db_path)) as checkpointer:
        await checkpointer.setup()
        _checkpointer = checkpointer
        init_incident_graph(checkpointer)
        logger.info("Outage Investigator API starting up (checkpoint=%s)", db_path)
        yield

    _checkpointer = None
    logger.info("Outage Investigator API shutting down")


app = FastAPI(
    title="AegisOps API",
    description="LangGraph-based incident response server with real-time SSE streaming",
    version="1.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
        "http://localhost:5175", "http://127.0.0.1:5175",
        "http://localhost:5176", "http://127.0.0.1:5176",
        "http://localhost:5177", "http://127.0.0.1:5177",
        "http://localhost:3000", "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def run_graph_task(
    run_id: str,
    scenario_type: str,
    credentials: dict,
    custom_telemetry: dict | None = None,
    resume_state: dict | None = None,
):
    state = get_run(run_id)
    if not state:
        return

    state.status = "running"
    persist_run(state)

    try:
        from backend.simulators.payment_outage import generate_payment_scenario
        from backend.graph.incident_graph import get_compiled_graph

        compiled_graph = get_compiled_graph()
        config = {"configurable": {"thread_id": run_id}}

        if resume_state:
            await compiled_graph.aupdate_state(config, resume_state)
            result = await compiled_graph.ainvoke(None, config=config)
        else:
            if custom_telemetry:
                raw_logs = custom_telemetry.get("raw_logs", [])
                raw_metrics = custom_telemetry.get("raw_metrics", {})
            else:
                payload_data = generate_payment_scenario(scenario_type)
                raw_logs = payload_data["raw_logs"]
                raw_metrics = payload_data["raw_metrics"]

            initial_state = {
                "incident_id": run_id,
                "raw_logs": raw_logs,
                "raw_metrics": raw_metrics,
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
                "openrouter_api_key": credentials["openrouter_api_key"],
                "tavily_api_key": credentials["tavily_api_key"],
                "llm_model": credentials["llm_model"],
                "agent_costs": {},
                "total_cost_usd": 0.0,
                "messages": [],
            }
            result = await compiled_graph.ainvoke(initial_state, config=config)

        current_state = await compiled_graph.aget_state(config)
        if current_state.next:
            # Emit a rich context event so the UI can show a non-expert summary
            vals = current_state.values or {}
            await send_sse_event(run_id, "approval_context", {
                "root_cause": vals.get("root_cause"),
                "suspected_vendor": vals.get("suspected_vendor"),
                "severity": vals.get("severity"),
                "internal_findings": vals.get("internal_findings"),
                "hypotheses": vals.get("hypotheses") or [],
                "browser_result": vals.get("browser_result"),
                "web_search_result": vals.get("web_search_result"),
            })
            # Send Slack approval message and store ts in graph state for later threading
            slack_ts = await send_slack_approval(vals, run_id)
            if slack_ts:
                await compiled_graph.aupdate_state(config, {"slack_approval_ts": slack_ts})
            state.status = "paused"
            state.current_phase = "paused_for_approval"
            persist_run(state)
            await send_sse_event(run_id, "phase_change", {"phase": "paused_for_approval"})
            logger.info("LangGraph pipeline paused for approval: run_id=%s", run_id)
            return

        state.report = result.get("final_report") or "No final report generated."
        state.status = "completed"
        state.current_phase = "completed"
        persist_run(state)

        await send_sse_event(run_id, "phase_change", {"phase": "completed"})
        await send_sse_event(run_id, "report", {"content": state.report})
        await send_sse_event(run_id, "done", {"run_id": run_id})
        logger.info("LangGraph pipeline completed: run_id=%s", run_id)

    except Exception as e:
        logger.exception("Run graph task failed for run_id=%s", run_id)
        state.status = "failed"
        persist_run(state)
        await send_sse_event(run_id, "error", {"message": f"Pipeline execution failed: {str(e)}"})


@app.get("/api/incident/scenarios", dependencies=[Depends(require_api_auth)])
async def get_scenarios():
    return list_payment_scenarios()


@app.post("/api/incident", dependencies=[Depends(require_api_auth)])
async def start_incident(payload: dict):
    scenario_type = payload.get("scenario_type")
    if not scenario_type:
        raise HTTPException(status_code=400, detail="Missing scenario_type")

    credentials = resolve_llm_credentials(payload)
    custom_telemetry = payload.get("custom_telemetry")
    if scenario_type == "custom_telemetry" and not custom_telemetry:
        raise HTTPException(status_code=400, detail="custom_telemetry body is required when scenario_type is 'custom_telemetry'")

    try:
        state = create_run(scenario_type)
        task = asyncio.create_task(
            run_graph_task(
                state.run_id,
                scenario_type,
                credentials,
                custom_telemetry,
            )
        )
        _running_tasks[state.run_id] = task
        task.add_done_callback(lambda t: _running_tasks.pop(state.run_id, None))
        return {"run_id": state.run_id, "status": "pending"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/incident/{run_id}/resume", dependencies=[Depends(require_api_auth)])
async def resume_incident(run_id: str, payload: dict):
    state = get_run(run_id)
    if not state:
        raise HTTPException(status_code=404, detail="Run not found")

    if state.status != "paused":
        raise HTTPException(status_code=400, detail="Run is not paused")

    approval_raw = payload.get("approval")
    if not approval_raw:
        raise HTTPException(status_code=400, detail="Missing approval payload")

    try:
        approval = ApprovalDecision.model_validate(approval_raw)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())

    if approval.status == "pending":
        raise HTTPException(status_code=400, detail="Approval status must not be pending")

    try:
        state.status = "resuming"
        persist_run(state)
        # Update Slack message and Jira ticket status to reflect the decision
        try:
            from backend.graph.incident_graph import get_compiled_graph
            compiled = get_compiled_graph()
            cfg = {"configurable": {"thread_id": run_id}}
            current = await compiled.aget_state(cfg)
            if current and current.values:
                cv = current.values
                slack_ts = cv.get("slack_approval_ts")
                jira_ticket_id = cv.get("jira_ticket_id")
                judge = approval.judge_name or "Web UI"
                decision = "approved" if approval.status == "approved" else "rejected"

                if slack_ts:
                    update_approval_message(
                        message_ts=slack_ts,
                        decision=decision,
                        decided_by=judge,
                    )
                if jira_ticket_id:
                    jira_status = "In Progress" if decision == "approved" else "Closed"
                    update_jira_status.invoke({"ticket_id": jira_ticket_id, "status": jira_status})
                    if decision == "rejected" and approval.comments:
                        add_jira_comment.invoke({
                            "ticket_id": jira_ticket_id,
                            "comment": f"Rejected by {judge}: {approval.comments}"
                        })
        except Exception as _e:
            logger.warning("Jira/Slack update on resume failed (non-fatal): %s", _e)
        task = asyncio.create_task(
            run_graph_task(
                run_id,
                state.scenario_type,
                credentials=resolve_llm_credentials(payload),
                resume_state={"approval": approval.model_dump()},
            )
        )
        _running_tasks[run_id] = task
        task.add_done_callback(lambda t: _running_tasks.pop(run_id, None))
        return {"run_id": run_id, "status": "resumed", "approval": approval.model_dump()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/incident/{run_id}/stop", dependencies=[Depends(require_api_auth)])
async def stop_incident(run_id: str):
    task = _running_tasks.get(run_id)
    if task:
        task.cancel()

    state = get_run(run_id)
    if state:
        state.status = "failed"
        state.current_phase = "failed"
        persist_run(state)
        await send_sse_event(run_id, "error", {"message": "Pipeline execution stopped by user."})
        await send_sse_event(run_id, "done", {"run_id": run_id})
    return {"status": "stopped", "run_id": run_id}


@app.get("/api/incident/{run_id}/stream", dependencies=[Depends(require_api_auth)])
async def stream_incident(run_id: str):
    state = get_run(run_id)
    if not state:
        raise HTTPException(status_code=404, detail="Run not found")
    return EventSourceResponse(event_generator(state))


@app.get("/api/incident/{run_id}", dependencies=[Depends(require_api_auth)])
async def get_incident(run_id: str):
    state = get_run(run_id)
    if not state:
        raise HTTPException(status_code=404, detail="Run not found")

    return {
        "run_id": state.run_id,
        "status": state.status,
        "scenario_type": state.scenario_type,
        "current_phase": state.current_phase,
        "report": state.report,
    }


@app.get("/api/incident/{run_id}/cost", dependencies=[Depends(require_api_auth)])
async def get_cost(run_id: str):
    from backend.utils.cost_tracker import get_summary

    return get_summary(run_id)


@app.post("/api/incident/{run_id}/chat", dependencies=[Depends(require_api_auth)])
async def chat_about_incident(run_id: str, payload: dict):
    """
    AI assistant that answers questions about a specific incident in plain language.
    Accepts: message, history[], openrouter_api_key, llm_model
    """
    from backend.tools.llm_config import get_llm
    from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

    user_message = (payload.get("message") or "").strip()
    if not user_message:
        raise HTTPException(status_code=400, detail="message is required")

    credentials = resolve_llm_credentials(payload)
    llm = get_llm(
        credentials.get("openrouter_api_key"),
        credentials.get("llm_model"),
        max_tokens=600,
    )

    # Try to get live graph state for context
    context_parts: list[str] = []
    try:
        from backend.graph.incident_graph import get_compiled_graph
        compiled = get_compiled_graph()
        config_obj = {"configurable": {"thread_id": run_id}}
        current = await compiled.aget_state(config_obj)
        if current and current.values:
            vals = current.values
            if vals.get("suspected_vendor"):
                context_parts.append(f"Affected Vendor: {vals['suspected_vendor']}")
            if vals.get("severity"):
                context_parts.append(f"Severity: {vals['severity']}")
            if vals.get("internal_findings"):
                context_parts.append(f"Symptoms: {vals['internal_findings']}")
            if vals.get("root_cause"):
                context_parts.append(f"Root Cause: {vals['root_cause']}")
            if vals.get("browser_result"):
                br = vals["browser_result"]
                d = br.get("data", {}) if isinstance(br, dict) else {}
                if d.get("incident_title"):
                    context_parts.append(f"Status Page Confirms: {d['incident_title']}")
                if d.get("affected_services"):
                    context_parts.append(f"Affected Services: {', '.join(d['affected_services'])}")
            if vals.get("remediation_steps"):
                steps = vals["remediation_steps"]
                context_parts.append(f"Remediation Steps: {'; '.join(steps[:4])}")
            if vals.get("final_report"):
                # Include only the first 1000 chars of the report for context
                context_parts.append(f"Report Summary: {vals['final_report'][:1000]}...")
    except Exception:
        pass  # graph may not be initialized or run may not exist

    # Fallback: get basic info from run state
    if not context_parts:
        run_state = get_run(run_id)
        if run_state:
            context_parts.append(f"Scenario: {run_state.scenario_type.replace('_', ' ')}")
            context_parts.append(f"Status: {run_state.status}")
            if run_state.report:
                context_parts.append(f"Report: {run_state.report[:800]}...")

    context_block = "\n".join(context_parts) if context_parts else "Investigation is still in progress."

    # Detect if the user is rejecting/confused by the previous answer
    REJECTION_SIGNALS = [
        "don't understand", "do not understand", "doesn't make sense", "not helpful",
        "explain again", "explain more", "what do you mean", "confused", "unclear",
        "too technical", "simpler", "in plain english", "plain english",
        "still don't get", "can you clarify", "what is that", "what does that mean",
        "elaborate", "didn't help", "try again", "rephrase", "what?", "huh?",
        "i'm lost", "im lost", "lost me", "not clear", "more detail",
    ]
    msg_lower = user_message.lower()
    is_rejection = any(sig in msg_lower for sig in REJECTION_SIGNALS)

    # Check how many consecutive clarification turns are in recent history
    history = payload.get("history") or []
    retry_count = 0
    for turn in reversed(history[-6:]):
        if turn.get("role") == "user" and any(sig in turn.get("content", "").lower() for sig in REJECTION_SIGNALS):
            retry_count += 1
        else:
            break

    # Build adaptive system prompt
    system_prompt = f"""You are a helpful AI assistant for an incident response platform.
Your job is to explain what's happening in a current or past incident investigation in plain, simple language — suitable for people who may not be technical.

Be concise, warm, and clear. Avoid jargon. If asked about technical terms, explain them simply.
If information isn't available yet, say the investigation is still running.

CURRENT INCIDENT CONTEXT (Run ID: {run_id}):
{context_block}

Answer the user's question based on this context. Keep responses under 150 words unless a longer explanation is genuinely needed."""

    if is_rejection and retry_count == 0:
        # First rejection: ask a clarifying question to diagnose confusion
        system_prompt += """

IMPORTANT — The user is confused or unsatisfied with the previous answer.
Do TWO things in your reply:
1. Ask ONE short clarifying question to pinpoint exactly what they're confused about (e.g. "Are you asking about [X] or [Y]?").
2. Offer a simpler one-sentence re-summary of the last point.
Keep the whole reply under 80 words."""

    elif is_rejection and retry_count >= 1:
        # Repeated rejection: switch to step-by-step plain-language explanation
        system_prompt += """

IMPORTANT — The user is still confused after the previous attempt.
Re-explain using ALL of these techniques:
- Use an everyday analogy (e.g. "Think of it like a traffic jam...")
- Number your points: 1. 2. 3.
- Zero jargon — if a technical word is needed, define it in parentheses
- End with: "Does that make more sense, or shall I break down a specific part?"
Keep it under 120 words."""

    # Build message history (last 8 messages = 4 turns for better retry context)
    messages: list = [SystemMessage(content=system_prompt)]
    for turn in history[-8:]:
        role = turn.get("role", "")
        content = turn.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))
    messages.append(HumanMessage(content=user_message))

    try:
        response = await llm.ainvoke(messages)
        reply_text = response.content.strip()
        return {
            "reply": reply_text,
            "retry_mode": is_rejection,
            "retry_count": retry_count,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {str(e)}")


@app.get("/api/history", dependencies=[Depends(require_api_auth)])
async def list_history():
    """Return all past runs from the SQLite DB."""
    import sqlite3
    from backend.utils.config import get_config as _cfg
    db_path = _cfg().runs_db_path
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT run_id, scenario_type, status, current_phase, created_at, updated_at, "
            "CASE WHEN length(report) > 0 THEN 1 ELSE 0 END AS has_report "
            "FROM runs ORDER BY created_at DESC LIMIT 100"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/api/history/{run_id}/report", dependencies=[Depends(require_api_auth)])
async def get_history_report(run_id: str):
    """Return the full report for a historical run."""
    import sqlite3
    from backend.utils.config import get_config as _cfg
    db_path = _cfg().runs_db_path
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute("SELECT report FROM runs WHERE run_id = ?", (run_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Run not found")
        return {"run_id": run_id, "report": row["report"] or ""}
    finally:
        conn.close()


@app.delete("/api/history/{run_id}", dependencies=[Depends(require_api_auth)])
async def delete_history_run(run_id: str):
    """Delete a historical run record."""
    import sqlite3
    from backend.utils.config import get_config as _cfg
    db_path = _cfg().runs_db_path
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    try:
        conn.execute("DELETE FROM runs WHERE run_id = ?", (run_id,))
        conn.commit()
        return {"deleted": run_id}
    finally:
        conn.close()


@app.get("/api/rag/entries", dependencies=[Depends(require_api_auth)])
async def list_rag_entries():
    """Return all entries in the JSON knowledge base files."""
    import glob as _glob
    from pathlib import Path as _Path
    db_dir = _Path(__file__).parent.parent.parent / "incident_memory_db"
    all_entries = []
    for jf in _glob.glob(str(db_dir / "incident_memory_fallback_*.json")):
        try:
            with open(jf) as f:
                import json as _json
                entries = _json.load(f)
                for e in entries:
                    all_entries.append({
                        "incident_id": e.get("metadata", {}).get("incident_id", "unknown"),
                        "vendor": e.get("metadata", {}).get("vendor", ""),
                        "resolved_at": e.get("metadata", {}).get("resolved_at", ""),
                        "duration": e.get("metadata", {}).get("duration", 0),
                        "content": e.get("content", ""),
                        "_source_file": jf,
                    })
        except Exception:
            pass
    return all_entries


@app.delete("/api/rag/entries/{incident_id}", dependencies=[Depends(require_api_auth)])
async def delete_rag_entry(incident_id: str):
    """Remove a specific incident from all JSON knowledge base files."""
    import glob as _glob
    import json as _json
    from pathlib import Path as _Path
    db_dir = _Path(__file__).parent.parent.parent / "incident_memory_db"
    removed = 0
    for jf in _glob.glob(str(db_dir / "incident_memory_fallback_*.json")):
        try:
            with open(jf) as f:
                entries = _json.load(f)
            before = len(entries)
            entries = [e for e in entries if e.get("metadata", {}).get("incident_id") != incident_id]
            if len(entries) < before:
                with open(jf, "w") as f:
                    _json.dump(entries, f, indent=2)
                removed += before - len(entries)
        except Exception:
            pass
    return {"deleted": incident_id, "removed_count": removed}


@app.delete("/api/rag/clear", dependencies=[Depends(require_api_auth)])
async def clear_rag():
    """Clear all JSON knowledge base entries."""
    import glob as _glob
    import json as _json
    from pathlib import Path as _Path
    db_dir = _Path(__file__).parent.parent.parent / "incident_memory_db"
    cleared = 0
    for jf in _glob.glob(str(db_dir / "incident_memory_fallback_*.json")):
        try:
            with open(jf) as f:
                entries = _json.load(f)
            cleared += len(entries)
            with open(jf, "w") as f:
                _json.dump([], f)
        except Exception:
            pass
    return {"cleared_count": cleared}


@app.post("/api/slack/action")
async def slack_action(request: Request):
    """
    Handles interactive Slack button callbacks (Approve / Reject).
    Verifies Slack signing secret, then resumes the pipeline.
    """
    from backend.utils.config import get_config as _cfg
    import urllib.parse as _urlparse

    body_bytes = await request.body()
    body_str = body_bytes.decode("utf-8")

    # Verify Slack signing secret
    signing_secret = _cfg().slack_signing_secret
    if signing_secret:
        timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
        slack_sig = request.headers.get("X-Slack-Signature", "")
        # Reject replays older than 5 minutes
        if abs(time.time() - float(timestamp or 0)) > 300:
            raise HTTPException(status_code=403, detail="Request too old")
        sig_basestring = f"v0:{timestamp}:{body_str}"
        computed = "v0=" + hmac.new(
            signing_secret.encode(),
            sig_basestring.encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(computed, slack_sig):
            logger.warning("Slack signature mismatch from IP %s", request.client.host)
            raise HTTPException(status_code=403, detail="Invalid signature")

    # Parse the payload form field
    parsed = _urlparse.parse_qs(body_str)
    payload_str = parsed.get("payload", ["{}"])[0]
    payload = json.loads(payload_str)

    actions = payload.get("actions", [])
    if not actions:
        return {}

    action = actions[0]
    action_id = action.get("action_id")   # "approve" or "reject"
    run_id = action.get("value", "")
    user_name = payload.get("user", {}).get("name", "Slack User")

    # Immediately update the Slack message to prevent double-clicks
    try:
        from backend.graph.incident_graph import get_compiled_graph
        compiled = get_compiled_graph()
        cfg = {"configurable": {"thread_id": run_id}}
        current = await compiled.aget_state(cfg)
        slack_ts = (current.values or {}).get("slack_approval_ts") if current else None
        jira_ticket_id = (current.values or {}).get("jira_ticket_id") if current else None
    except Exception:
        slack_ts = None
        jira_ticket_id = None

    decision = "approved" if action_id == "approve" else "rejected"

    if slack_ts:
        update_approval_message(
            message_ts=slack_ts,
            decision=decision,
            decided_by=user_name,
        )

    if jira_ticket_id:
        jira_status = "In Progress" if decision == "approved" else "Closed"
        update_jira_status.invoke({"ticket_id": jira_ticket_id, "status": jira_status})
        if decision == "rejected":
            add_jira_comment.invoke({
                "ticket_id": jira_ticket_id,
                "comment": f"Rejected via Slack by {user_name}",
            })

    # Resume the pipeline using the same path as the web UI
    run_state = get_run(run_id)
    if not run_state or run_state.status != "paused":
        logger.warning("Slack action on non-paused run %s (status=%s)",
                       run_id, run_state.status if run_state else "not found")
        return {}

    approval_status = "approved" if action_id == "approve" else "rejected"
    approval = ApprovalDecision(status=approval_status, judge_name=user_name)

    run_state.status = "resuming"
    persist_run(run_state)

    credentials = resolve_llm_credentials({})  # uses server-side config
    task = asyncio.create_task(
        run_graph_task(
            run_id,
            run_state.scenario_type,
            credentials=credentials,
            resume_state={"approval": approval.model_dump()},
        )
    )
    _running_tasks[run_id] = task
    task.add_done_callback(lambda t: _running_tasks.pop(run_id, None))

    # Slack requires HTTP 200 with empty body within 3 seconds
    return {}


@app.get("/health")
async def health():
    config = get_config()
    return {
        "status": "ok",
        "llm_configured": config.llm_configured(),
        "auth_required": False,
        "client_keys_allowed": config.allow_client_api_keys,
        "server_instance_id": SERVER_INSTANCE_ID,
    }


# ─── Integration test helpers (extracted for easy mocking in tests) ───────────

async def _call_slack_auth_test(token: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        resp = await c.post(
            "https://slack.com/api/auth.test",
            headers={"Authorization": f"Bearer {token}"},
        )
    return resp.json()


async def _call_jira_myself(base_url: str, email: str, api_token: str) -> tuple[int, dict]:
    credentials = base64.b64encode(f"{email}:{api_token}".encode()).decode()
    url = base_url.rstrip("/") + "/rest/api/2/myself"
    async with httpx.AsyncClient(timeout=10) as c:
        resp = await c.get(
            url,
            headers={"Authorization": f"Basic {credentials}", "Accept": "application/json"},
        )
    try:
        return resp.status_code, resp.json()
    except Exception:
        return resp.status_code, {}


# ─── Test-connection endpoints ────────────────────────────────────────────────

@app.post("/api/test/slack", response_model=TestConnectionResponse)
async def test_slack_connection(req: TestSlackRequest) -> TestConnectionResponse:
    try:
        data = await _call_slack_auth_test(req.slack_bot_token)
        if data.get("ok"):
            team = data.get("team", "your workspace")
            return TestConnectionResponse(ok=True, message=f'Connected to workspace "{team}"')
        error = data.get("error", "unknown_error")
        return TestConnectionResponse(ok=False, message=f"{error} — check your Slack Bot Token")
    except httpx.TimeoutException:
        return TestConnectionResponse(ok=False, message="Could not reach Slack — request timed out")
    except Exception:
        return TestConnectionResponse(ok=False, message="Unexpected error — try again")


@app.post("/api/test/jira", response_model=TestConnectionResponse)
async def test_jira_connection(req: TestJiraRequest) -> TestConnectionResponse:
    try:
        status_code, data = await _call_jira_myself(
            req.jira_base_url, req.jira_email, req.jira_api_token
        )
        if status_code == 200:
            name = data.get("displayName", "unknown")
            return TestConnectionResponse(ok=True, message=f'Authenticated as "{name}"')
        if status_code == 401:
            return TestConnectionResponse(
                ok=False, message="401 Unauthorized — check your Jira email and API token"
            )
        return TestConnectionResponse(
            ok=False, message=f"Jira returned {status_code} — check your Base URL"
        )
    except httpx.TimeoutException:
        return TestConnectionResponse(ok=False, message="Could not reach Jira — request timed out")
    except Exception:
        return TestConnectionResponse(ok=False, message="Unexpected error — try again")


# Serve the compiled React frontend (production only — skipped if dist not built)
_FRONTEND_DIST = Path(__file__).parent.parent.parent / "frontend" / "dist"

if _FRONTEND_DIST.exists():
    _assets_dir = _FRONTEND_DIST / "assets"
    if _assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="frontend-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def _serve_spa(full_path: str):
        # Serve known static files (favicon, icons, etc.) directly
        candidate = _FRONTEND_DIST / full_path
        if full_path and candidate.exists() and candidate.is_file():
            return FileResponse(str(candidate))
        # Fall back to index.html for all SPA routes
        return FileResponse(str(_FRONTEND_DIST / "index.html"))
