# Code Summary — AegisOps Vendor Outage Investigator

This document provides a detailed, module-by-module description of the entire codebase. It is intended for developers, auditors, and AI assistant sessions that need a complete picture of how the system is built.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Backend — Core Modules](#4-backend--core-modules)
   - [State Model](#41-state-model)
   - [LangGraph DAG](#42-langgraph-dag)
   - [FastAPI Server](#43-fastapi-server)
   - [Authentication](#44-authentication)
   - [Persistence](#45-persistence)
   - [SSE Streaming](#46-sse-streaming)
   - [Secrets Resolution](#47-secrets-resolution)
   - [CLI Entry Point](#48-cli-entry-point)
5. [Backend — Agent Nodes](#5-backend--agent-nodes)
   - [Triage Agent](#51-triage-agent)
   - [RAG Cache Lookup](#52-rag-cache-lookup)
   - [RCA Agent](#53-rca-agent)
   - [Browser Agent](#54-browser-agent)
   - [Web Search Agent](#55-web-search-agent)
   - [Remediation Agent](#56-remediation-agent)
   - [Reporter Agent](#57-reporter-agent)
   - [Self-Heal Agent](#58-self-heal-agent)
   - [RAG Storage](#59-rag-storage)
6. [Backend — Tools](#6-backend--tools)
7. [Backend — Memory / RAG](#7-backend--memory--rag)
8. [Backend — Utilities](#8-backend--utilities)
9. [Backend — Simulators](#9-backend--simulators)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Data Flow — End to End](#11-data-flow--end-to-end)
12. [LangGraph Routing Logic](#12-langgraph-routing-logic)
13. [Human-in-the-Loop Design](#13-human-in-the-loop-design)
14. [RAG Memory System](#14-rag-memory-system)
15. [Cost Tracking System](#15-cost-tracking-system)
16. [Database Schema](#16-database-schema)
17. [Environment Variables Reference](#17-environment-variables-reference)
18. [Dependencies](#18-dependencies)

---

## 1. Project Overview

AegisOps is an **autonomous multi-agent system** for investigating third-party vendor outages. It automates a workflow that typically requires an SRE to manually:

- Triage incoming alerts
- Check vendor status pages
- Search Twitter/Slack for community confirmation
- Draft a containment plan
- Write a postmortem

The system is built on **LangGraph** — a stateful graph execution engine — where each node in the graph is a specialized AI agent. The graph has conditional routing (dynamic paths depending on what the agents discover), a **Human-in-the-Loop** pause gate before remediation, and a **Self-Heal** recovery mechanism that automatically reroutes around failures.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| LLM Orchestration | LangGraph 0.0.60+, LangChain 0.1+ |
| LLM Provider | OpenRouter (Gemini, GPT-4o, Claude, DeepSeek) |
| Backend Framework | FastAPI 0.115+ with Uvicorn |
| Real-time Streaming | Server-Sent Events (SSE) via `sse-starlette` |
| Browser Automation | Playwright via `stagehand` |
| Web Search | Tavily API, DuckDuckGo fallback |
| Vector Database | ChromaDB with JSON file fallback |
| Checkpointing | SQLite via `langgraph-checkpoint-sqlite` / `AsyncSqliteSaver` |
| Run Persistence | SQLite (`runs.db`) |
| Frontend Framework | React 19 + Vite 5 + TypeScript |
| Styling | Tailwind CSS v4 |
| 3D Visualization | Three.js via `@react-three/fiber` and `@react-three/drei` |
| State Management | Zustand |
| Desktop Packaging | Electron 36 |
| Testing | pytest + pytest-asyncio + httpx |
| Python Package Manager | uv |
| JS Package Manager | npm |

---

## 3. Project Structure

```
vendor_outage_investigator/
│
├── backend/
│   ├── agents/                  # One file per agent node
│   │   ├── triage_agent.py
│   │   ├── rca_agent.py
│   │   ├── browser_agent.py
│   │   ├── web_search_agent.py
│   │   ├── remediation_agent.py
│   │   ├── reporter_agent.py
│   │   └── self_heal_agent.py
│   ├── api/
│   │   ├── app.py               # FastAPI app + all HTTP routes
│   │   ├── auth.py              # Optional API key middleware
│   │   ├── persistence.py       # SQLite run metadata (runs.db)
│   │   ├── secrets.py           # LLM credential resolution
│   │   └── streaming.py         # SSE event helpers + in-memory run store
│   ├── graph/
│   │   └── incident_graph.py    # LangGraph DAG: nodes, edges, routing
│   ├── guardrails/
│   │   └── safety_guardrails.py
│   ├── memory/
│   │   └── incident_rag.py      # ChromaDB + JSON RAG tools
│   ├── models/
│   │   └── incident_state.py    # IncidentState TypedDict + Pydantic models
│   ├── monitors/                # Log source monitor subsystem
│   │   ├── __init__.py
│   │   ├── base.py              # BaseMonitor ABC + classify() + _process()
│   │   ├── encryption.py        # Fernet key management (data/monitor.key)
│   │   ├── local_monitor.py     # Local file polling by byte offset
│   │   ├── manager.py           # start/stop/add/remove asyncio task manager
│   │   ├── persistence.py       # `monitors` table CRUD in runs.db
│   │   ├── ssh_monitor.py       # asyncssh SFTP remote log polling
│   │   ├── syslog_monitor.py    # UDP + TCP syslog push receiver
│   │   └── trigger.py           # HTTP POST to /api/incident (avoids circular import)
│   ├── simulators/
│   │   └── payment_outage.py    # Built-in test scenarios
│   ├── tools/
│   │   ├── llm_config.py        # LLM factory + agent_rules loader
│   │   ├── slack_tool.py        # Slack webhook LangChain tool
│   │   ├── vendor_status_tool.py # Playwright status page scraper
│   │   └── web_search_tool.py   # Tavily / DuckDuckGo search tool
│   ├── utils/
│   │   ├── config.py            # Pydantic settings (reads .env)
│   │   └── cost_tracker.py      # Per-agent token + cost tracking
│   └── main.py                  # CLI entry point
│
├── frontend/
│   └── src/
│       ├── components/          # React UI components
│       ├── pages/               # home.tsx, run.tsx, sources.tsx
│       ├── stores/              # Zustand store
│       ├── hooks/               # use-sse.ts SSE hook
│       └── lib/                 # api.ts typed client + utilities
│
├── data/                        # SQLite databases + encryption key (git-ignored)
├── incident_memory_db/          # JSON RAG knowledge base files
├── docs/                        # All documentation
├── tests/                       # pytest suite
├── Dockerfile
├── pyproject.toml
├── setup.sh / setup.ps1
├── fix.sh
└── .env.example
```

---

## 4. Backend — Core Modules

### 4.1 State Model

**File:** `backend/models/incident_state.py`

The **central shared data structure** — an `IncidentState` TypedDict that every agent reads from and writes to. All data flows through this object as it passes through the LangGraph pipeline.

#### Key fields

| Field | Type | Description |
|---|---|---|
| `incident_id` | `str` | Unique run ID (e.g., `RUN-A1B2C3D4`) |
| `raw_logs` | `list[dict]` | Raw application log entries |
| `raw_metrics` | `dict` | Numeric metric values (error rates, latency, etc.) |
| `severity` | `str` | `P1`/`sev1` through `P4`/`sev4` |
| `suspected_vendor` | `str` | Name of the suspected third-party vendor |
| `internal_findings` | `str` | Human-readable summary of what is failing |
| `events` | `list[dict]` | Structured events extracted from logs |
| `rag_result` | `dict` | Result from historical incident memory search |
| `rag_confidence` | `float` | Confidence score from RAG (0.0–1.0) |
| `browser_result` | `dict` | Scraped status page data |
| `web_search_result` | `dict` | Web/social media search results |
| `root_cause` | `str` | Identified root cause string |
| `hypotheses` | `list[dict]` | Investigation hypotheses with confidence scores |
| `remediation_steps` | `list[str]` | Containment action items |
| `recommendations` | `list[dict]` | Long-term `ActionItem` recommendations |
| `final_report` | `str` | Full Markdown postmortem |
| `retry_count` | `int` | How many times Self-Heal agent has retried |
| `last_error` | `str` | Most recent error message |
| `failed_node` | `str` | Which graph node failed |
| `needs_browser` | `bool` | Routing: should we scrape a status page? |
| `needs_web_search` | `bool` | Routing: should we do a web search? |
| `needs_human_escalation` | `bool` | Routing: escalate to human? |
| `approval` | `dict` | The `ApprovalDecision` from the HITL gate |
| `openrouter_api_key` | `str` | LLM API key (from UI or `.env`) |
| `llm_model` | `str` | Model name (e.g., `google/gemini-2.5-flash`) |
| `agent_costs` | `dict` | Per-agent token/cost usage |
| `total_cost_usd` | `float` | Running total cost |
| `messages` | `list` | LangChain message history (uses `add_messages` reducer) |

#### Pydantic models (also defined here)

- **`Event`** — Structured log event: `timestamp`, `service`, `level`, `message`, `error_code`, `category`
- **`Hypothesis`** — Investigation hypothesis: `label` (`vendor|application|infrastructure|network|configuration|unknown`), `confidence`, `rationale`
- **`ActionItem`** — Remediation action: `title`, `action`, `priority` (`high|medium|low`), `rationale`
- **`ApprovalDecision`** — Human approval result: `status` (`approved|rejected|needs_changes|pending`), `judge_name`, `comments`
- **`DispatchPayload`** — Slack dispatch structure: `channel`, `title`, `severity`, `summary`, `actions`

---

### 4.2 LangGraph DAG

**File:** `backend/graph/incident_graph.py`

Defines the entire agent orchestration graph using LangGraph's `StateGraph`.

#### Graph topology

```
triage → rag_search ──[confidence ≥ 0.85]──────────────────→ remediation
                    ──[confidence < 0.85]──→ rca ─[browser]──→ browser ──→ remediation
                                                 ─[web_search]→ web_search → remediation
                                                 ─[human]─────→ reporter

self_heal ←── (any node on failure)
remediation → reporter → store_incident → END
```

#### Key functions

| Function | Purpose |
|---|---|
| `build_incident_graph(checkpointer)` | Builds and compiles the `StateGraph` with all nodes, edges, and the HITL interrupt |
| `init_incident_graph(checkpointer)` | One-time initialization called at app startup |
| `get_compiled_graph()` | Returns the singleton compiled graph |
| `rag_search_node(state)` | Graph-level wrapper calling the RAG search tool |
| `store_incident_node(state)` | Graph-level wrapper persisting resolved incident to RAG |
| `route_after_rag(state)` | Conditional router → `remediation | rca | self_heal` |
| `route_after_rca(state)` | Conditional router → `browser | web_search | remediation | reporter | self_heal` |
| `route_after_browser(state)` | Conditional router → `web_search | remediation | self_heal` |
| `route_after_web_search(state)` | Conditional router → `remediation | self_heal` |
| `route_after_self_heal(state)` | Conditional router → `rca | browser | web_search | reporter` |
| `route_after_remediation(state)` | Conditional router → `reporter | self_heal` |

The graph is compiled with `interrupt_before=["remediation"]` — this is the HITL pause gate.

---

### 4.3 FastAPI Server

**File:** `backend/api/app.py`

The main application server. Uses FastAPI's async lifespan to initialize the SQLite checkpointer and LangGraph at startup.

#### Startup lifespan

1. Loads `.env` via `python-dotenv`
2. Initializes `runs.db`
3. Calls `init_monitors_db()` — creates `monitors` table if absent, runs `ALTER TABLE` migration for `auto_remediate` column
4. Opens `AsyncSqliteSaver` connection to `checkpoints.db`
5. Calls `init_incident_graph(checkpointer)` to compile the LangGraph
6. Calls `await monitor_manager.start_all()` — spawns asyncio tasks for all enabled monitors
7. On shutdown: `await monitor_manager.stop_all()` cancels all monitor tasks

#### All API routes

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Server status + config flags |
| `GET` | `/api/incident/scenarios` | Optional | List simulation scenarios |
| `POST` | `/api/incident` | Optional | Start a new investigation run |
| `GET` | `/api/incident/{run_id}` | Optional | Run status + report |
| `GET` | `/api/incident/{run_id}/stream` | Optional | SSE stream of real-time agent events |
| `POST` | `/api/incident/{run_id}/resume` | Optional | Resume paused run with HITL approval |
| `GET` | `/api/incident/{run_id}/cost` | Optional | Token/cost summary |
| `POST` | `/api/incident/{run_id}/chat` | Optional | AI assistant Q&A about the incident |
| `GET` | `/api/history` | Optional | List past runs from SQLite (last 100) |
| `GET` | `/api/history/{run_id}/report` | Optional | Full Markdown report for a historical run |
| `DELETE` | `/api/history/{run_id}` | Optional | Delete a run from history |
| `GET` | `/api/rag/entries` | Optional | List all knowledge base entries |
| `DELETE` | `/api/rag/entries/{incident_id}` | Optional | Remove one incident from knowledge base |
| `DELETE` | `/api/rag/clear` | Optional | Clear all knowledge base entries |
| `GET` | `/api/monitors` | Optional | List all configured log source monitors |
| `POST` | `/api/monitors` | Optional | Create a new monitor (credentials encrypted via Fernet) |
| `PUT` | `/api/monitors/{mon_id}` | Optional | Update monitor config (partial update via `_ALLOWED_UPDATES`) |
| `DELETE` | `/api/monitors/{mon_id}` | Optional | Delete a monitor and stop its task |
| `POST` | `/api/monitors/{mon_id}/toggle` | Optional | Enable or disable a monitor |
| `GET` | `/api/monitors/{mon_id}` | Optional | Get a single monitor (credentials stripped from response) |

#### `run_graph_task` (background async coroutine)

The core function that runs the LangGraph pipeline in the background:

1. Sets run status to `"running"`
2. **Fresh run**: builds `initial_state` dict → calls `graph.ainvoke(initial_state)`
3. **Resume run**: calls `graph.aupdate_state(config, resume_state)` → `graph.ainvoke(None)`
4. After invoke, checks `graph.aget_state().next` — if non-empty, graph paused for HITL
5. **Auto-Remediate path**: if `custom_telemetry.auto_remediate` is `True` (set by a monitor trigger), injects an `ApprovalDecision(status="approved", judge_name="System (Auto-Remediate Policy)")` via `aupdate_state` then immediately calls `ainvoke(None)` to continue — no UI pause
6. **On HITL pause** (non-auto): emits `approval_context` SSE event, sets status to `"paused"`
7. **On completion**: saves report, emits `report` + `done` SSE events

#### Chat assistant (`/chat`)

Contextual AI assistant for plain-language incident Q&A. Features:
- Reads live graph state (vendor, severity, root cause, browser results, report) for context
- Falls back to run metadata if graph state unavailable
- Detects confusion signals (`"don't understand"`, `"explain again"`, etc.) in user messages
- First rejection: asks a clarifying question to pinpoint confusion
- Repeated rejection: switches to everyday-analogy mode with numbered points

---

### 4.4 Authentication

**File:** `backend/api/auth.py`

API auth is disabled for local and hackathon use. `/api/incident/*` routes do not require `Authorization` or `X-API-Key` headers.

---

### 4.5 Persistence

**File:** `backend/api/persistence.py`

Manages the `data/runs.db` SQLite database for run metadata.

**`runs` table columns:** `run_id`, `scenario_type`, `status`, `current_phase`, `report`, `created_at`, `updated_at`

**Status values:** `pending → running → paused → resuming → completed | failed`

Key functions: `init_runs_db()`, `persist_run(state)`

---

**File:** `backend/monitors/persistence.py`

Manages the `monitors` table (also in `data/runs.db`) for log source configuration.

**`monitors` table columns:** `id` (UUID), `name`, `type` (`ssh|syslog_udp|syslog_tcp|local`), `host`, `port`, `log_path`, `scan_interval`, `credentials_enc` (Fernet-encrypted JSON), `enabled`, `auto_remediate`, `byte_offset`, `created_at`

Valid types: `_VALID_TYPES = {"ssh", "syslog_udp", "syslog_tcp", "local"}`

Key functions: `init_monitors_db()`, `create_monitor()`, `list_monitors()`, `get_monitor()`, `update_monitor()`, `delete_monitor()`, `update_offset()`, `set_enabled()`

**Credential security:** `credentials_enc` is never returned in API responses — `_sanitize()` in `app.py` strips it and substitutes `has_credentials: bool`.

---

### 4.6 SSE Streaming

**File:** `backend/api/streaming.py`

Manages in-memory run state and Server-Sent Events delivery.

- **`RunState`** — Dataclass holding live run data (run_id, status, scenario_type, current_phase, report, asyncio event queue)
- **`create_run(scenario_type)`** — Creates a `RunState`, stores in global `_runs` dict, returns it
- **`get_run(run_id)`** — Retrieves a `RunState` by ID
- **`send_sse_event(run_id, event_type, data)`** — Puts an event onto the run's asyncio queue
- **`event_generator(state)`** — Async generator that yields SSE-formatted strings to the HTTP response

#### SSE event types emitted during a run

| Event | Payload | When emitted |
|---|---|---|
| `phase_change` | `{"phase": "triage \| root_cause_analysis \| remediation \| completed \| paused_for_approval"}` | Each phase transition |
| `agent_start` | `{"agent_name": "..."}` | Agent begins working |
| `agent_end` | `{"agent_name": "...", "detail": "..."}` | Agent finishes |
| `tool_start` | `{"agent_name": "...", "detail": "tool_name"}` | Tool call begins |
| `tool_end` | `{"agent_name": "...", "detail": "tool_name"}` | Tool call completes |
| `cost_update` | `{"agent": "...", "input_tokens": N, "output_tokens": N, "cost_usd": N}` | After each LLM call |
| `approval_context` | Full investigation context dict | When graph pauses for HITL |
| `report` | `{"content": "## Postmortem..."}` | Final Markdown report ready |
| `done` | `{"run_id": "..."}` | Pipeline complete |
| `error` | `{"message": "..."}` | Pipeline failure |

---

### 4.7 Secrets Resolution

**File:** `backend/api/secrets.py`

`resolve_llm_credentials(payload)` determines which LLM credentials to use:

1. If `ALLOW_CLIENT_API_KEYS=true` and the request body includes `openrouter_api_key` → use client-provided key
2. Otherwise → use server-side `OPENROUTER_API_KEY` from `.env`
3. Same logic applies for `tavily_api_key`

Ensures API keys never leave the server in production mode (`ALLOW_CLIENT_API_KEYS=false`).

---

### 4.8 CLI Entry Point

**File:** `backend/main.py`

Command-line interface for running investigations without the web UI.

```bash
uv run python backend/main.py --scenario stripe_outage --model google/gemini-2.5-flash
```

Uses an in-memory `MemorySaver` checkpointer (no SQLite). The HITL gate is effectively bypassed in CLI mode (no UI to send the resume call). Prints the final postmortem to stdout.

---

## 5. Backend — Agent Nodes

Each agent is an `async` function that:
1. Reads fields from `IncidentState`
2. Emits `agent_start` SSE event
3. Calls an LLM with a structured JSON prompt
4. Parses the JSON response
5. Emits `agent_end` + `cost_update` SSE events
6. Returns an updated partial state dict

---

### 5.1 Triage Agent

**File:** `backend/agents/triage_agent.py`

**Inputs:** `raw_logs` (truncated to last 50), `raw_metrics`

**LLM prompt asks for:** suspected vendor, severity, internal findings summary, affected service, structured events list

**Tools called:** `post_slack_notification` (sends "New Incident Triaged" Slack alert)

**Outputs:** `suspected_vendor`, `severity`, `internal_findings`, `affected_service`, `events`

**Error:** Sets `last_error` + `failed_node = "triage"` → triggers Self-Heal routing

---

### 5.2 RAG Cache Lookup

**File:** `backend/graph/incident_graph.py` → `rag_search_node()`

Graph-level node wrapping the `search_incident_history` LangChain tool.

**Inputs:** `internal_findings`, `suspected_vendor`, `llm_model`, `openrouter_api_key`

**Logic:** Constructs query `"Vendor: {vendor}. Symptoms: {findings}"` → ChromaDB/JSON similarity search

**Outputs:** `rag_result` dict, `rag_confidence` float

**Routing decision:** `confidence ≥ 0.85` → fast path directly to remediation; otherwise → RCA

---

### 5.3 RCA Agent

**File:** `backend/agents/rca_agent.py`

**Inputs:** `internal_findings`, `events`, `suspected_vendor`, `rag_result`

**LLM prompt asks for:**
- Routing flags: `needs_browser`, `needs_web_search`, `needs_human_escalation`
- Preliminary `root_cause` string
- List of `hypotheses` with confidence and label
- Overall `confidence_score`

**Outputs:** `needs_browser`, `needs_web_search`, `needs_human_escalation`, `root_cause`, `hypotheses`, `confidence_score`

**Typical routing:** Known vendor → `needs_browser = true`; unknown symptoms → `needs_web_search = true`

---

### 5.4 Browser Agent

**File:** `backend/agents/browser_agent.py`

**Inputs:** `suspected_vendor`

Uses Playwright (via Stagehand) to navigate to the vendor's official status page and extract live incident data.

**Vendor → URL mapping:** Stripe, AWS, Twilio, Cloudflare, GitHub, SendGrid, PagerDuty

**Output (`browser_result`):**
```json
{
  "vendor": "Stripe",
  "status": "major_outage | partial_outage | operational",
  "data": {
    "incident_title": "...",
    "affected_services": ["API Requests"],
    "last_updated": "..."
  }
}
```

**Fallback:** Returns mock data with `"source": "mock"` if Playwright is unavailable.

---

### 5.5 Web Search Agent

**File:** `backend/agents/web_search_agent.py`

**Inputs:** `suspected_vendor`, `internal_findings`

Queries the web for community confirmation of the outage. Uses Tavily (if API key set) or DuckDuckGo fallback. Passes results to LLM for synthesis.

**Output:** `web_search_result` dict with `summary`, `source_count`, `sources`

---

### 5.6 Remediation Agent

**File:** `backend/agents/remediation_agent.py`

**Inputs:** `suspected_vendor`, `root_cause`, `hypotheses`, `approval`

The node behind the HITL gate. Checks `approval.status` first:

- `"rejected"` → skips LLM, sets rejection message in `remediation_steps`, sets `needs_human_escalation = True`
- `"needs_changes"` → skips LLM, sets "changes requested" message
- `"approved"` (or no approval in CLI mode) → calls LLM

**LLM prompt asks for:** `remediation_steps` list, Slack `alert_summary`, `recommendations` (ActionItem list)

**Tools called:** `post_slack_notification` (sends remediation plan)

**Outputs:** `remediation_steps`, `recommendations`

---

### 5.7 Reporter Agent

**File:** `backend/agents/reporter_agent.py`

**Inputs:** Full state (all investigation findings)

Synthesizes everything into a professional Markdown postmortem.

**Report sections:** Executive Summary, Incident Timeline, Business Impact, Root Cause Analysis, Remediation Steps, Preventive Recommendations

**Output:** `final_report` (Markdown string)

---

### 5.8 Self-Heal Agent

**File:** `backend/agents/self_heal_agent.py`

**Inputs:** `failed_node`, `last_error`, `retry_count`

**Logic:**
1. Increments `retry_count`
2. If `retry_count ≥ 3` → `needs_human_escalation = True` (escalates to reporter)
3. If browser failed → disables browser, enables web search (graceful degradation)
4. If web search failed → disables both, proceeds with partial data
5. Clears `last_error` and `failed_node`

**Output:** Updated routing flags + incremented `retry_count`

---

### 5.9 RAG Storage

**File:** `backend/graph/incident_graph.py` → `store_incident_node()`

Graph-level node that persists the resolved incident to the RAG knowledge base.

**Inputs:** `incident_id`, `internal_findings`, `suspected_vendor`, `root_cause`, `remediation_steps`

Calls `store_resolved_incident` tool. Stores in both ChromaDB (if available) and JSON fallback.

---

## 6. Backend — Tools

### LLM Configuration (`backend/tools/llm_config.py`)

**`get_llm(api_key, model, base_url, max_tokens=1024)`** — Factory returning a `ChatOpenAI` instance configured for OpenRouter (base URL `https://openrouter.ai/api/v1`, temperature `0.1`). Handles local LLM base URLs transparently.

**`load_agent_rules()`** — Reads `agent_rules.md` from project root. Contents are prepended to every agent's system prompt (e.g., "Address all postmortems to Admin").

---

### Slack Tool (`backend/tools/slack_tool.py`)

LangChain `@tool`: `post_slack_notification(channel, message)`

- If `SLACK_WEBHOOK_URL` is set → sends real Slack webhook POST
- Otherwise → logs at INFO level (no-op for development)

Called by: Triage Agent and Remediation Agent.

---

### Vendor Status Tool (`backend/tools/vendor_status_tool.py`)

LangChain `@tool`: `check_vendor_status_page(vendor_name)`

Uses Playwright to navigate vendor status pages and extract live incident data. Falls back to mock data if Playwright is unavailable.

| Vendor | Status Page URL |
|---|---|
| Stripe | https://status.stripe.com |
| AWS | https://health.aws.amazon.com |
| Twilio | https://status.twilio.com |
| Cloudflare | https://www.cloudflarestatus.com |
| GitHub | https://githubstatus.com |
| SendGrid | https://status.sendgrid.com |
| PagerDuty | https://status.pagerduty.com |

---

### Web Search Tool (`backend/tools/web_search_tool.py`)

LangChain `@tool`: `search_vendor_outage_online(vendor_name, query)`

1. **Tavily** (if `TAVILY_API_KEY` set) — `TavilySearchResults`, `max_results=5`, depth `"advanced"`
2. **DuckDuckGo fallback** — `DuckDuckGoSearchRun` from `langchain_community`

---

## 7. Backend — Memory / RAG

**File:** `backend/memory/incident_rag.py`

Two-tier RAG system for historical incident memory.

### Tier 1: ChromaDB (vector store)

- Embeddings: `text-embedding-3-small` via OpenRouter
- Collection: `incident_history_{model_suffix}` (namespaced per model to prevent dimension mismatch)
- Persist dir: `incident_memory_db/chroma_{model_suffix}/`
- Retrieval threshold: similarity ≥ 0.70

### Tier 2: JSON fallback

- File: `incident_memory_db/incident_memory_fallback_{model_suffix}.json`
- Search: Word-overlap Jaccard scoring + vendor name boost (+0.30)
- Retrieval threshold: score ≥ 0.50

### LangChain tools

**`search_incident_history(symptoms, vendor_name, model_name, api_key, base_url)`**
Returns: `{"found": bool, "confidence": float, "incidents": [...]}`

**`store_resolved_incident(incident_id, symptoms, vendor_name, root_cause, resolution, duration_minutes, ...)`**
Deduplicates by `incident_id`. Stores to both ChromaDB and JSON.
Returns: `{"stored": true, "incident_id": "..."}`

---

## 8. Backend — Utilities

### Config (`backend/utils/config.py`)

Pydantic `BaseSettings` model reading from `.env`:

| Field | Default | Description |
|---|---|---|
| `openrouter_api_key` | — | OpenRouter API key |
| `openrouter_base_url` | `https://openrouter.ai/api/v1` | LLM base URL |
| `openrouter_model` | `google/gemini-2.5-flash` | Default model |
| `tavily_api_key` | — | Tavily search key |
| `slack_webhook_url` | — | Slack webhook URL |
| `allow_client_api_keys` | `False` | Allow browser to send keys |
| `checkpoint_db_path` | `data/checkpoints.db` | LangGraph state storage |
| `runs_db_path` | `data/runs.db` | Run metadata storage |

`get_config()` returns a cached singleton.

---

### Cost Tracker (`backend/utils/cost_tracker.py`)

Tracks per-agent token usage and estimated USD cost.

**`record(run_id, agent_name, response, model)`** — Reads `response.usage_metadata`, calculates cost from a built-in pricing table, stores in memory, returns dict for SSE emission.

**`get_summary(run_id)`** — Returns per-agent breakdown + `total_usd`.

**Approximate pricing table (USD per 1M tokens, input/output):**

| Model | Input | Output |
|---|---|---|
| `google/gemini-2.5-flash` | $0.075 | $0.30 |
| `openai/gpt-4o-mini` | $0.15 | $0.60 |
| `openai/gpt-4o` | $2.50 | $10.00 |
| `anthropic/claude-3.5-sonnet` | $3.00 | $15.00 |
| `deepseek/deepseek-chat` | $0.14 | $0.28 |

---

## 9. Backend — Simulators

**File:** `backend/simulators/payment_outage.py`

Pre-built incident scenarios for demos and testing. Each scenario contains realistic `raw_logs` and `raw_metrics`.

| Scenario ID | Vendor | Severity | Description |
|---|---|---|---|
| `stripe_outage` | Stripe | P1 | Payment API timeouts at 92.5% error rate |
| `aws_s3_degradation` | AWS | P2 | S3 read errors at 74% in us-east-1 |
| `twilio_sms_delay` | Twilio | P2 | OTP/MFA SMS delayed 13+ minutes |
| `cloudflare_dns_failure` | Cloudflare | P2 | DNS resolution failing for webhooks |
| `github_actions_slow` | GitHub | P3 | CI/CD queue times exceeding 45 minutes |
| `sendgrid_email_bounce` | SendGrid | P2 | Transactional email bounce rate at 67% |
| `pagerduty_alert_delay` | PagerDuty | P3 | Alert delivery delayed 18 minutes |

`generate_payment_scenario(scenario_type)` → `{"raw_logs": [...], "raw_metrics": {...}}`

`list_payment_scenarios()` → list of scenario metadata (used by `/api/incident/scenarios`)

---

## 10. Frontend Architecture

**Stack:** React 19 + Vite 5 + TypeScript + Tailwind CSS v4 + Electron 36

### 10.1 Pages

**`frontend/src/pages/home.tsx`** — Landing / Simulator UI
- Scenario picker dropdown
- Custom JSON telemetry file upload
- API key input (stored in `localStorage`)
- Model selector
- Triggers `POST /api/incident`

**`frontend/src/pages/run.tsx`** — Live investigation view
- Phase progress bar
- Real-time agent activity feed (SSE)
- 3D topology graph showing active agents
- Approval card when run is paused for HITL
- Markdown report renderer when complete
- Incident chat assistant

**`frontend/src/pages/sources.tsx`** — Log Sources configuration page
- Lists all configured monitors as cards with type badge, enabled/disabled status, and auto-remediate indicator
- `MonitorModal` form for creating/editing: name, type selector (SSH/SFTP, Syslog UDP/TCP, Local File), host, port, log path, scan interval, credential fields (password or PEM key), Enabled toggle, Auto-Remediate toggle
- Per-card Enable/Disable, Edit, and Delete actions
- Auto-Remediate shown as amber `⚡ Auto-Remediate` badge vs green `✓ Manual Approval` when off

### 10.2 Components

| Component | File | Purpose |
|---|---|---|
| Agent Feed | `agent-feed.tsx` | Scrolling real-time SSE event log |
| Approval Card | `approval-card.tsx` | HITL approve / reject / changes UI |
| Hero Graph 3D | `hero-graph-3d.tsx` | Three.js animated globe on landing page |
| Incident Chat | `incident-chat.tsx` | AI assistant chat widget |
| Phase Bar | `phase-bar.tsx` | Investigation progress bar |
| Report Visuals | `report-visuals.tsx` | Markdown postmortem renderer |
| Scenario Picker | `scenario-picker.tsx` | Scenario dropdown selector |
| Topology Graph | `topology-graph.tsx` | 2D agent connection graph |
| Vendor Status Card | `vendor-status-card.tsx` | Scraped vendor status display |
| AIGlobeHero | `vigilant/AIGlobeHero.tsx` | Animated globe hero component |
| AgentSwarmCockpit | `vigilant/AgentSwarmCockpit.tsx` | Investigation cockpit layout |
| NetworkParticles | `vigilant/NetworkParticles.tsx` | Background particle animation |
| RootCauseGraph | `vigilant/RootCauseGraph.tsx` | Hypothesis visualization |
| VendorMonitor | `vigilant/VendorMonitor.tsx` | Vendor status monitor panel |

### 10.3 State Management

**File:** `frontend/src/stores/incident-store.ts` (Zustand)

Stores: `runId`, `status`, `events` (SSE event list), `phase`, `report`, `approvalContext`

### 10.4 API Client

**File:** `frontend/src/lib/api.ts`

Typed `fetch()` wrappers: `startIncident`, `resumeIncident`, `getIncident`, `chatAboutIncident`, `getHistory`, `getRagEntries`. No incident API key header is sent.

Monitor management functions: `listMonitors()`, `createMonitor(payload)`, `updateMonitor(id, payload)`, `deleteMonitor(id)`, `toggleMonitor(id, enabled)`. Types exported: `MonitorType`, `MonitorCredentials`, `Monitor`, `MonitorPayload`.

### 10.5 SSE Hook

**File:** `frontend/src/hooks/use-sse.ts`

`useSSE(runId)` — Opens `EventSource` to `/api/incident/{run_id}/stream`, parses events, updates Zustand store. Closes on `done` or `error`.

---

## 11. Data Flow — End to End

```
1. User picks scenario in home.tsx
        │
        ▼
2. POST /api/incident { scenario_type, llm_model, openrouter_api_key }
        │
        ▼
3. api/app.py → create_run() + asyncio.create_task(run_graph_task())
        │
        ▼ (background)
4. run_graph_task() builds initial_state → graph.ainvoke(initial_state)
        │
        ▼
5. [triage_node]         → SSE: phase_change("triage"), agent events, cost_update
        │
        ▼
6. [rag_search_node]     → SSE: agent events
        │
    ┌───┴──────────────────────────────┐
    ▼ confidence < 0.85                ▼ confidence ≥ 0.85
7. [rca_node]                    [skip to remediation]
        │
    ┌───┴───────────┐
    ▼               ▼
[browser_node]  [web_search_node]
        │
        └──────────────────────────────────────────────┐
                                                       ▼
8. GRAPH PAUSES (interrupt_before=["remediation"])
   SSE: approval_context → Frontend shows ApprovalCard
        │
        ▼
9. User approves/rejects in UI
   POST /api/incident/{run_id}/resume { approval: {...} }
        │
        ▼
10. graph.aupdate_state() + graph.ainvoke(None) → resumes
        │
        ▼
11. [remediation_node]  → SSE events + Slack notification
        │
        ▼
12. [reporter_node]     → generates final_report (Markdown)
        │
        ▼
13. [store_incident_node] → saves to RAG memory for future runs
        │
        ▼
14. END → SSE: report, done → Frontend renders postmortem
```

---

## 12. LangGraph Routing Logic

All routing functions inspect `IncidentState` fields. Any node that fails sets `last_error`, which every routing function checks first to redirect to `self_heal`.

```python
# After RAG search
def route_after_rag(state):
    if state.get("last_error"):             return "self_heal"
    if state["rag_confidence"] >= 0.85:     return "remediation"  # fast path
    return "rca"

# After RCA
def route_after_rca(state):
    if state.get("last_error"):             return "self_heal"
    if state.get("needs_human_escalation"): return "reporter"     # skip remediation
    if state.get("needs_browser"):          return "browser"
    if state.get("needs_web_search"):       return "web_search"
    return "remediation"

# After Self-Heal (retry routing)
def route_after_self_heal(state):
    if state.get("needs_human_escalation"): return "reporter"
    if state.get("needs_web_search") and not state.get("needs_browser"):
        return "web_search"
    if state.get("needs_browser"):          return "browser"
    return "rca"
```

---

## 13. Human-in-the-Loop Design

1. **Graph compilation**: `interrupt_before=["remediation"]` tells LangGraph to pause before that node
2. **First run**: pipeline executes triage → rag → rca → browser/web_search, then **stops**
3. **Detection**: `graph.aget_state(config).next` is non-empty → API marks run as `"paused"`, emits `approval_context` SSE event
4. **UI**: Frontend receives `approval_context`, renders `ApprovalCard` with full investigation summary
5. **User decides**: Approve / Reject / Request Changes
6. **Resume API**: `POST /api/incident/{run_id}/resume` with `ApprovalDecision` payload
7. **State injection**: `graph.aupdate_state(config, {"approval": decision})` writes decision into graph state
8. **Resume**: `graph.ainvoke(None, config)` continues from remediation node
9. **Remediation node**: Reads `state["approval"]["status"]` — handles all three cases (approved/rejected/needs_changes)

The **SQLite checkpointer** (`AsyncSqliteSaver`) persists graph state between the pause and resume, so the run survives a server restart.

### Auto-Remediate bypass

When a Log Source Monitor triggers an incident with `auto_remediate=True` in `custom_telemetry`, `run_graph_task` detects this **after** the graph first pauses and immediately injects a pre-approved decision:

```python
auto_approval = ApprovalDecision(
    status="approved",
    judge_name="System (Auto-Remediate Policy)",
    comments="Automatically approved by log-source monitor policy.",
)
await graph.aupdate_state(config, {"approval": auto_approval.model_dump()})
result = await graph.ainvoke(None, config=config)
```

This keeps the HITL gate code path unchanged — the graph still compiles with `interrupt_before=["remediation"]` — but skips the human wait.

---

## 14. RAG Memory System

The RAG system provides instant recall for recurring incidents.

### Storage document format

```json
{
  "content": "Vendor: Stripe. Symptoms: payment timeout, 504 errors. Root Cause: Stripe API outage affecting US regions. Resolution: Switch to Adyen backup.",
  "metadata": {
    "incident_id": "RUN-ABCD1234",
    "vendor": "Stripe",
    "resolved_at": "2026-06-13T14:30:00.000000",
    "duration": 15
  }
}
```

### Fast path (confidence ≥ 0.85)

Skips RCA, browser scraping, and web search — jumps directly to remediation. This is the "we've seen this before" shortcut that enables sub-10-second investigation for known patterns.

### Per-model isolation

Each LLM model gets its own ChromaDB collection and JSON file (model name used as filename suffix). This prevents embedding dimension mismatches when switching models.

---

## 15. Cost Tracking System

Every agent calls `cost_tracker.record()` after each LLM call. Cost data is:
- Emitted as `cost_update` SSE events → shown live in the frontend
- Aggregated in an in-memory dict keyed by `(run_id, agent_name)`
- Returned by `GET /api/incident/{run_id}/cost`

Typical cost per full run: ~$0.004 (Gemini 2.5 Flash) to ~$0.12 (Claude 3.5 Sonnet).

---

## 16. Database Schema

### `data/runs.db` — Run metadata

```sql
CREATE TABLE runs (
    run_id        TEXT PRIMARY KEY,
    scenario_type TEXT,
    status        TEXT,      -- pending|running|paused|resuming|completed|failed
    current_phase TEXT,
    report        TEXT,      -- full Markdown postmortem
    created_at    TEXT,      -- ISO 8601
    updated_at    TEXT       -- ISO 8601
);
```

### `data/checkpoints.db` — LangGraph state checkpoints

Fully managed by `langgraph-checkpoint-sqlite`. Contains serialized graph state for each thread ID at each checkpoint. Enables HITL pause/resume across server restarts.

### `monitors` table (also in `data/runs.db`)

```sql
CREATE TABLE monitors (
    id               TEXT PRIMARY KEY,   -- UUID
    name             TEXT NOT NULL,
    type             TEXT NOT NULL,      -- ssh|syslog_udp|syslog_tcp|local
    host             TEXT,
    port             INTEGER,
    log_path         TEXT,
    scan_interval    INTEGER NOT NULL DEFAULT 60,
    credentials_enc  TEXT,              -- Fernet-encrypted JSON blob
    enabled          INTEGER NOT NULL DEFAULT 1,
    auto_remediate   INTEGER NOT NULL DEFAULT 0,
    byte_offset      INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT               -- ISO 8601
);
```

### `data/monitor.key` — Fernet encryption key

Auto-generated on first startup. Used by `backend/monitors/encryption.py` to encrypt/decrypt `credentials_enc`. Must be backed up alongside `runs.db`.

---

## 17. Environment Variables Reference

| Variable | Default | Required | Description |
|---|---|---|---|
| `OPENROUTER_API_KEY` | — | Yes | OpenRouter API key |
| `OPENROUTER_MODEL` | `google/gemini-2.5-flash` | No | Default LLM model |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | No | OpenRouter API base URL |
| `TAVILY_API_KEY` | — | No | Enables Tavily real-time web search |
| `SLACK_WEBHOOK_URL` | — | No | Enables Slack incident notifications |
| `ALLOW_CLIENT_API_KEYS` | `false` | No | Allow browser to send API keys (dev only) |
| `CHECKPOINT_DB_PATH` | `data/checkpoints.db` | No | LangGraph checkpoint SQLite path |
| `RUNS_DB_PATH` | `data/runs.db` | No | Run metadata SQLite path |
| `API_PORT` | `8004` | No | Port the backend listens on; monitors POST to this port for internal incident triggers |

---

## 18. Dependencies

### Python (`pyproject.toml`)

| Package | Version | Purpose |
|---|---|---|
| `langgraph` | ≥0.0.60 | Multi-agent graph orchestration |
| `langchain` | ≥0.1.0 | LLM abstraction, tools, messages |
| `langchain-openai` | ≥0.1.0 | OpenAI-compatible LLM client |
| `langchain-community` | ≥0.1.0 | DuckDuckGo, ChromaDB integrations |
| `fastapi` | ≥0.115.0 | Web API framework |
| `uvicorn[standard]` | ≥0.34.0 | ASGI server |
| `sse-starlette` | ≥2.2.1 | Server-Sent Events support |
| `stagehand` | ≥3.5.0 | Playwright browser automation |
| `tavily-python` | ≥0.7.17 | Tavily search API client |
| `duckduckgo-search` | ≥8.1.1 | DuckDuckGo fallback search |
| `pydantic` | ≥2.0 | Data validation and settings |
| `python-dotenv` | ≥1.2.1 | `.env` file loading |
| `langgraph-checkpoint-sqlite` | ≥3.1.0 | SQLite state persistence |
| `aiosqlite` | ≥0.22.1 | Async SQLite driver |
| `httpx` | ≥0.28.1 | Async HTTP client (testing + monitor trigger) |
| `asyncssh` | ≥2.14.0 | Pure-asyncio SSH/SFTP client for remote log polling |
| `cryptography` | ≥42.0.0 | Fernet symmetric encryption for stored credentials |
| `pytest` | ≥9.0.3 | Test framework |
| `pytest-asyncio` | ≥1.4.0 | Async test support |

### JavaScript (`frontend/package.json`)

| Package | Version | Purpose |
|---|---|---|
| `react` + `react-dom` | ^19.0.0 | UI framework |
| `react-router-dom` | ^6.20.0 | Client-side routing |
| `react-markdown` | ^9.0.0 | Markdown rendering |
| `@react-three/fiber` | ^8.17.0 | React bindings for Three.js |
| `@react-three/drei` | ^9.115.0 | Three.js helpers and abstractions |
| `three` | ^0.176.0 | 3D graphics engine |
| `zustand` | ^4.4.0 | Lightweight state management |
| `tailwindcss` | ^4.0.0 | Utility-first CSS framework |
| `lucide-react` | ^1.7.0 | Icon library |
| `clsx` + `tailwind-merge` | latest | CSS class utilities |
| `vite` | ^5.0.0 | Frontend build tool |
| `electron` | ^36.0.0 | Desktop app packaging |
| `electron-builder` | ^26.0.0 | Electron distribution builder |
| `concurrently` | ^9.0.0 | Run Vite + Electron simultaneously |
| `wait-on` | ^8.0.0 | Wait for Vite before launching Electron |

---

*Last updated: 2026-06-13 — AI Accelerator Hackathon 2026*
