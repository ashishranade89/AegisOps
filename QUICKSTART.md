# AegisOps — Quick Start Guide

Autonomous AI swarm that triages vendor outages, scrapes status pages, searches the web, and generates postmortem reports in under 60 seconds.

---

## Prerequisites

| Requirement | macOS | Windows |
|---|---|---|
| Python 3.12+ | `brew install python@3.13` | [python.org/downloads](https://python.org/downloads) |
| Node.js 18+ | `brew install node` | [nodejs.org](https://nodejs.org/en/download) |
| OpenRouter key | Required — [openrouter.ai/keys](https://openrouter.ai/keys) | Same |
| Tavily key | Optional — [tavily.com](https://tavily.com) | Same |

---

## First-time Setup (60 seconds)

```bash
# AegisOps setup
./setup.sh
```

The script will:
- Install Python deps via `uv`
- Install frontend npm deps
- Copy `.env.example` → `.env` and prompt for your API key
- Install Playwright Chromium (for browser scraper)

---

## Launch

**Option A — Electron desktop app (one command):**
```bash
cd frontend && npm run electron:dev
```

**Option B — Browser tab (two terminals):**
```bash
# Terminal 1 — FastAPI backend
uv run uvicorn api.app:app --host 127.0.0.1 --port 8004 --reload

# Terminal 2 — Vite frontend
cd frontend && npm run dev
# Open http://localhost:5176
```

On Windows, `.\start.ps1` performs the same listener cleanup before launch and falls back to the next free backend port if `8004` is blocked.

---

## Architecture

```
User uploads telemetry (logs + metrics)
         │
         ▼
┌─────────────────┐
│  Triage Agent   │  Classifies severity, identifies vendor
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  RAG Cache      │  Searches historical incident memory (ChromaDB / JSON)
└────────┬────────┘
    confidence ≥ 0.85 → skip to Remediation
         │
         ▼
┌─────────────────┐
│  RCA Agent      │  Routes: needs browser? web search? human escalation?
└──┬───────┬──────┘
   │       │
   ▼       ▼
Browser  Web Search   (fall back to mock data if Stagehand / Tavily unavailable)
   └───────┘
         │
         ▼
┌─────────────────┐
│ Remediation     │  Generates containment action plan + Slack alert
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Reporter Agent  │  Writes full Markdown postmortem
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ RAG Storage     │  Saves resolved incident to vector memory for future runs
└─────────────────┘

Self-Heal Agent intercepts failures at any node and reroutes automatically.
```

---

## Cost per run (approximate)

| Model | Cost / run | Best for |
|---|---|---|
| `google/gemini-2.5-flash` | ~$0.004 | Default — hackathon demos |
| `openai/gpt-4o-mini` | ~$0.01 | Better reasoning, still cheap |
| `deepseek/deepseek-chat` | ~$0.006 | Strong reasoning, very cheap |
| `openai/gpt-4o` | ~$0.08 | Production quality, expensive |
| `anthropic/claude-3.5-sonnet` | ~$0.12 | Best output quality |

Change the model in the UI dropdown or set `OPENROUTER_MODEL` in `.env`.

---

## Production mode

For deployment, configure server-side secrets in `.env` (see `.env.example`):

```env
OPENROUTER_API_KEY=sk-or-...
INCIDENT_API_KEY=your-secure-random-token
ALLOW_CLIENT_API_KEYS=false
```

Run with Docker:

```bash
docker build -t aegisops .
docker run -p 8004:8004 --env-file .env -v $(pwd)/data:/app/data aegisops
```

Run tests: `uv run pytest tests/ -q`

**Continuing development in a new AI chat?** Read [`docs/CLAUDE_HANDOFF.md`](docs/CLAUDE_HANDOFF.md) first.

---

## Something broke? Run the fixer

```bash
./fix.sh          # AegisOps repair tool
```

It checks and auto-repairs:
- Missing Python venv / deps
- Missing `.env` or placeholder API keys
- Port conflicts on 8004 / 5176
- Missing Playwright Chromium
- Unwritable database directory

---

## Common errors

| Error | Cause | Fix |
|---|---|---|
| `Connectivity Alert: AegisOps API server is offline` | Backend not running | `uv run uvicorn api.app:app --port 8004 --reload` |
| `Telemetry Cockpit Locked` | OpenRouter key not entered | Enter key in the right panel of the UI |
| `Document Blocked` on file upload | Uploaded a non-JSON file | Only `.json` files with `raw_logs` or `raw_metrics` keys are accepted |
| Electron window is blank | Vite not ready yet | Wait 3 seconds and press `Ctrl+R` |
| `openai_api_key` validation error | Python / LangChain version mismatch | `uv sync` then restart the backend |
| Port 8004 already in use | Another process using the port | `lsof -i :8004` then `kill <PID>` or run `.\start.ps1` on Windows |

---

## Addressing the operator

All agent postmortem reports are addressed to **Admin** as per `agent_rules.md`.

---

*Built for the AI Accelerator Hackathon 2026.*
