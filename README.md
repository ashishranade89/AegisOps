# AegisOps — Autonomous Vendor Outage Investigator

Autonomous AI swarm that triages vendor outages, scrapes status pages, searches the web, and generates postmortem reports in under 60 seconds.

Built for the **AI Accelerator Hackathon 2026**, this tool helps SREs and Incident Response teams automate the tedious process of investigating third-party service failures.

---

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [Using the CLI](#using-the-cli)
- [Running Tests](#running-tests)
- [Docker Deployment](#docker-deployment)
- [Key Features](#key-features)
- [The Agent Swarm](#the-agent-swarm)
- [Codebase Map](#codebase-map)
- [Documentation](#documentation)
- [Troubleshooting](#troubleshooting)

---

## Overview

AegisOps is a **multi-agent LangGraph pipeline** that fully automates vendor outage investigation. When your payment gateway, CDN, or cloud provider goes down, AegisOps:

1. Ingests your raw application logs and metrics
2. Triages severity and suspects the responsible vendor
3. Searches historical incident memory (RAG) for known patterns
4. Scrapes the vendor's official status page in real time
5. Cross-validates with web/social media search
6. Proposes a remediation plan (with human approval gate)
7. Generates a professional Markdown postmortem
8. Stores the resolved incident for future pattern matching

---

## Prerequisites

Before installing, make sure you have the following installed:

| Tool | Required Version | Check | Install |
|---|---|---|---|
| Python | 3.12 or newer | `python3 --version` | [python.org](https://python.org/downloads) or `brew install python@3.13` |
| uv (Python package manager) | Latest | `uv --version` | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Node.js | 18 or newer | `node --version` | [nodejs.org](https://nodejs.org/en/download) or `brew install node` |
| npm | 9 or newer | `npm --version` | Bundled with Node.js |

### API Keys

| Key | Required | Purpose | Get it |
|---|---|---|---|
| `OPENROUTER_API_KEY` | **Yes** | Powers all LLM agents (Gemini, GPT-4o, Claude, etc.) | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `TAVILY_API_KEY` | Optional | Enhanced real-time web search | [tavily.com](https://tavily.com) |
| `SLACK_WEBHOOK_URL` | Optional | Automated Slack incident alerts | Slack App settings |

---

## Installation

### Step 1 — Clone the repository

```bash
git clone https://github.com/your-repo/vendor-outage-investigator.git
cd vendor-outage-investigator
```

### Step 2 — Run the automated setup script

**macOS / Linux:**
```bash
chmod +x setup.sh
./setup.sh
```

**Windows (PowerShell):**
```powershell
.\setup.ps1
```

The setup script automatically does all of the following:
- Installs Python dependencies via `uv` into a local `.venv`
- Installs frontend npm packages (`cd frontend && npm install`)
- Copies `.env.example` → `.env` and prompts you to enter your API key
- Installs Playwright Chromium (used by the Browser Agent to scrape status pages)
- Creates the `data/` directory for SQLite databases

### Step 3 — Configure your API keys

Open the `.env` file in the project root and fill in your credentials:

```env
# Required — get from https://openrouter.ai/keys
OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxxxxxx

# Optional — for real-time web search
TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxx

# Optional — for Slack notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

See the full [Configuration](#configuration) section for all available options.

---

## Configuration

All settings live in the `.env` file. Here is every available variable:

```env
# ─── LLM Provider (Required) ──────────────────────────────────────────────────
OPENROUTER_API_KEY=sk-or-...         # Your OpenRouter API key
OPENROUTER_MODEL=google/gemini-2.5-flash  # Default model (can change in UI too)

# ─── Optional Integrations ────────────────────────────────────────────────────
TAVILY_API_KEY=tvly-...              # Real-time web search (falls back to DuckDuckGo)
SLACK_WEBHOOK_URL=https://hooks...  # Slack notifications on triage + remediation

# ─── Production Security ──────────────────────────────────────────────────────
INCIDENT_API_KEY=                    # Set a strong random key to protect API routes
ALLOW_CLIENT_API_KEYS=true           # true = hackathon/dev mode; false = production

# ─── Persistence (SQLite) ─────────────────────────────────────────────────────
CHECKPOINT_DB_PATH=data/checkpoints.db   # LangGraph state checkpoints
RUNS_DB_PATH=data/runs.db                # Run metadata and reports

```

### Choosing a model

You can set the model globally in `.env` or change it per-run in the UI dropdown.

| Model | Cost / Run | Notes |
|---|---|---|
| `google/gemini-2.5-flash` | ~$0.004 | Default — best for demos |
| `openai/gpt-4o-mini` | ~$0.01 | Better reasoning, still cheap |
| `deepseek/deepseek-chat` | ~$0.006 | Strong reasoning, very cheap |
| `openai/gpt-4o` | ~$0.08 | Production-grade quality |
| `anthropic/claude-3.5-sonnet` | ~$0.12 | Best output quality |

---

## Running the Application

There are four ways to run AegisOps.

### Quickest — `./start.sh` (one command)

Starts both the backend and frontend in a single terminal. Clears any stale port conflicts automatically. Press `Ctrl+C` to stop both servers.

```bash
./start.sh
```

Then open [http://localhost:5176](http://localhost:5176).

On Windows, use `.\start.ps1`. It follows the same startup flow, clears existing listeners before launch, and falls back to the next free backend port if `8004` stays blocked.

### Option A — Electron Desktop App (Recommended for demos)

Launches a self-contained desktop app with the backend and frontend bundled together:

```bash
cd frontend
npm run electron:dev
```

The Electron window opens automatically once Vite is ready. If the window is blank, wait 3 seconds and press `Ctrl+R` to reload.

### Option B — Web Browser (Two terminals)

**Terminal 1 — Start the FastAPI backend:**
```bash
uv run uvicorn backend.api.app:app --host 127.0.0.1 --port 8004 --reload
```

Wait for the message: `Outage Investigator API starting up`

**Terminal 2 — Start the React frontend:**
```bash
cd frontend
npm run dev
```

Open your browser at [http://localhost:5176](http://localhost:5176)

### Option C — Backend API only (headless)

If you only need the API server (e.g., for integration or testing):

```bash
uv run uvicorn backend.api.app:app --host 0.0.0.0 --port 8004
```

Verify it's running:
```bash
curl http://127.0.0.1:8004/health
# Expected: {"status":"ok","llm_configured":true,"auth_required":false,"client_keys_allowed":true}
```

---

## Using the CLI

Run an investigation directly in the terminal — no UI needed. Note: the HITL (human-in-the-loop) approval gate is bypassed in CLI mode.

```bash
# Run the default Stripe outage scenario
uv run python backend/main.py --scenario stripe_outage

# Run with a specific model
uv run python backend/main.py --scenario aws_s3_degradation --model openai/gpt-4o-mini
```

### Available built-in scenarios

| Scenario | Vendor | Severity |
|---|---|---|
| `stripe_outage` | Stripe | P1 |
| `aws_s3_degradation` | AWS | P2 |
| `twilio_sms_delay` | Twilio | P2 |
| `cloudflare_dns_failure` | Cloudflare | P2 |
| `github_actions_slow` | GitHub | P3 |
| `sendgrid_email_bounce` | SendGrid | P2 |
| `pagerduty_alert_delay` | PagerDuty | P3 |

### Trigger an investigation via API (curl)

```bash
# Start a new run
curl -X POST http://127.0.0.1:8004/api/incident \
  -H "Content-Type: application/json" \
  -d '{"scenario_type": "stripe_outage", "llm_model": "google/gemini-2.5-flash"}'
# Returns: {"run_id": "RUN-XXXXXXXX", "status": "pending"}

# Approve the remediation plan (after the run pauses)
curl -X POST http://127.0.0.1:8004/api/incident/RUN-XXXXXXXX/resume \
  -H "Content-Type: application/json" \
  -d '{"approval": {"status": "approved", "judge_name": "Admin", "comments": "Proceed with failover."}}'
```

---

## Running Tests

```bash
uv run pytest tests/ -v
```

The test suite covers:
- `tests/test_api.py` — FastAPI endpoint unit tests
- `tests/test_production.py` — Production mode integration tests (auth, persistence)

---

## Docker Deployment

### Build and run

```bash
docker build -t aegisops .
docker run -p 8004:8004 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  aegisops
```

The `-v` flag mounts the `data/` directory so your SQLite run history and incident memory persist between container restarts.

### Production checklist

Before going to production, verify these settings:

- [ ] `OPENROUTER_API_KEY` set via secrets manager (not hardcoded)
- [ ] `INCIDENT_API_KEY` set to a strong random string
- [ ] `ALLOW_CLIENT_API_KEYS=false` (keys stay server-side)
- [ ] `data/` mounted as a persistent volume
- [ ] Reverse proxy (nginx / Caddy) with TLS in front of port 8004
- [ ] Browser Agent has ≥2GB RAM available (Playwright requirement)

---

## Key Features

- **Autonomous Swarm**: 8 specialized agents collaborating in a stateful LangGraph DAG.
- **Self-Healing**: Automatic recovery from tool timeouts or LLM rate limits via the Self-Heal Agent.
- **RAG-Accelerated RCA**: Instant root cause analysis for recurring issues using historical incident memory (ChromaDB + JSON fallback).
- **Multi-Source Verification**: Simultaneous status page scraping (Playwright/Stagehand) and social media search (Tavily/DuckDuckGo).
- **Human-in-the-Loop**: Built-in approval gate before any remediation action executes.
- **Real-time Observability**: 3D topology graph and live agent activity feed via Server-Sent Events (SSE).
- **Cost Tracking**: Per-agent token usage and USD cost reported live in the UI.
- **Persistent Memory**: SQLite checkpoints allow paused runs to survive server restarts.
- **Secure API Key Management**: Keys are stored in `localStorage` only. The API Keys tab shows blank fields (never pre-fills) with a `✓ Saved` badge when a key exists. A **Save Keys** button persists changes without requiring a launch. **Clear Cache** wipes all stored keys and settings.

---

## The Agent Swarm

| # | Agent | Role |
|---|---|---|
| 1 | **Triage Agent** | Parses raw logs/metrics, identifies the suspected vendor and severity (Sev1–Sev4), sends initial Slack alert |
| 2 | **RAG Cache** | Searches historical incident memory for known patterns; if confidence ≥ 0.85, skips directly to remediation |
| 3 | **RCA Agent** | Generates hypotheses, determines routing (browser / web search / human escalation) |
| 4 | **Browser Agent** | Uses Playwright to scrape the vendor's official status page for live incident details |
| 5 | **Web Search Agent** | Queries Tavily or DuckDuckGo for community/social confirmation of the outage |
| 6 | **Remediation Agent** | Proposes containment steps; pauses for human approval before executing |
| 7 | **Reporter Agent** | Writes a professional Markdown postmortem (summary, timeline, impact, RCA, resolution) |
| 8 | **Self-Heal Agent** | Intercepts any node failure, retries (up to 3×), and reroutes around broken tools |

---

## Codebase Map

```
vendor_outage_investigator/
├── backend/
│   ├── agents/           # One file per agent (triage, rca, browser, web_search, remediation, reporter, self_heal)
│   ├── api/
│   │   ├── app.py        # FastAPI app — all HTTP routes + lifespan startup
│   │   ├── auth.py       # Optional API key authentication middleware
│   │   ├── persistence.py # SQLite run metadata (runs.db)
│   │   ├── secrets.py    # Resolves LLM credentials (server-side vs client-provided)
│   │   └── streaming.py  # SSE event helpers
│   ├── graph/
│   │   └── incident_graph.py  # LangGraph DAG — node wiring and conditional routing
│   ├── guardrails/
│   │   └── safety_guardrails.py
│   ├── memory/
│   │   └── incident_rag.py  # ChromaDB + JSON RAG implementation
│   ├── models/
│   │   └── incident_state.py  # IncidentState TypedDict + Pydantic models
│   ├── simulators/
│   │   └── payment_outage.py  # Built-in test scenarios (Stripe, AWS, Twilio, etc.)
│   ├── tools/
│   │   ├── llm_config.py       # get_llm() factory and agent_rules loader
│   │   ├── slack_tool.py       # Slack webhook tool (LangChain @tool)
│   │   ├── vendor_status_tool.py # Playwright status page scraper
│   │   └── web_search_tool.py  # Tavily / DuckDuckGo search tool
│   ├── utils/
│   │   ├── config.py           # Pydantic settings (reads .env)
│   │   └── cost_tracker.py     # Per-agent token and cost tracking
│   └── main.py                 # CLI entry point
├── frontend/
│   └── src/
│       ├── components/         # React UI components (AgentFeed, ApprovalCard, TopologyGraph, etc.)
│       ├── pages/              # home.tsx (landing), run.tsx (live investigation)
│       ├── stores/             # Zustand state store
│       ├── hooks/              # use-sse.ts — SSE connection hook
│       └── lib/api.ts          # Typed API client
├── data/                       # SQLite databases (git-ignored)
├── incident_memory_db/         # JSON RAG knowledge base files
├── docs/                       # Architecture, API, and operations documentation
├── tests/                      # pytest test suite
├── Dockerfile
├── setup.sh / setup.ps1   # First-time setup (installs deps, checks ports)
├── start.sh               # One-command launcher (backend + frontend)
├── fix.sh                 # Auto-repair script (ports, venv, Playwright)
├── pyproject.toml
└── .env.example
```

---

## Documentation

| Document | Contents |
|---|---|
| [Workflow & Architecture](./docs/WORKFLOW.md) | Node-by-node agent descriptions, data flow diagram, Stripe example walkthrough |
| [Operations Guide](./docs/OPERATIONS.md) | Detailed installation, configuration, deployment |
| [API Reference](./docs/API.md) | All HTTP endpoints with request/response examples |
| [Code Summary](./docs/CODE_SUMMARY.md) | Comprehensive module-level codebase documentation |
| [Developer Handoff](./docs/CLAUDE_HANDOFF.md) | Quick context file for AI-assisted development sessions |
| [AegisOps Documentation](./aegisops_docs.html) ([Rendered View](https://htmlpreview.github.io/?https://github.com/ashishranade89/AegisOps/blob/main/aegisops_docs.html)) | Comprehensive visual architecture and agent guide |
| [Interactive Guide](./docs/INTERACTIVE_GUIDE.html) | Visual browser-based architecture tour |

---

## Troubleshooting

Run the automated repair script first:

```bash
./fix.sh        # macOS / Linux
```

It checks and auto-repairs:
- Missing Python venv or dependencies
- Missing `.env` or placeholder API keys
- Port conflicts on 8004 and 5176
- Missing Playwright Chromium browser
- Unwritable `data/` directory

### Common errors

| Error | Cause | Fix |
|---|---|---|
| `Connectivity Alert: API server is offline` | Backend not running | `./start.sh` or `uv run uvicorn backend.api.app:app --port 8004 --reload` |
| `Telemetry Cockpit Locked` | No OpenRouter key entered | Enter key in **API Keys** tab → click **Save Keys**, or set in `.env` |
| API Keys tab shows blank fields | By design — fields never pre-fill for security | The `✓ Saved` badge confirms a key is stored; type a new value and click **Save Keys** to update |
| Clear Cache didn't remove my key settings | Older behavior | **Clear Cache** now wipes all keys and LLM settings from `localStorage` |
| `Document Blocked` on file upload | Non-JSON file uploaded | Only `.json` files with `raw_logs` or `raw_metrics` keys are accepted |
| Electron window is blank | Vite not ready yet | Wait 3 seconds and press `Ctrl+R` |
| `openai_api_key` validation error | Python / LangChain version mismatch | `uv sync` then restart the backend |
| Port 8004 already in use | Another process using the port | `./start.sh` / `.\start.ps1` auto-clear it, or `lsof -i :8004` then `kill <PID>` |
| `RuntimeError: LangGraph not initialized` | Backend started without lifespan | Use `uvicorn` (not `python -m`), the lifespan handles init |

---

*Built for the AI Accelerator Hackathon 2026.*
