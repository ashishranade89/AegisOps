# Claude / AI agent handoff — Vendor Outage Investigator
# Use this file when starting a NEW chat after context limit is exhausted.

## Project summary

**Autonomous Third-Party Vendor Outage Investigator** — LangGraph multi-agent pipeline that triages simulated (or uploaded) telemetry, searches RAG memory, performs RCA, scrapes vendor status pages, optionally web-searches via Tavily, pauses for human approval before remediation, then generates a postmortem and stores the incident in vector memory.

Built for AI Accelerator Hackathon 2026. Postmortems address **Admin** per `agent_rules.md`.

---

## Quick start

```bash
./setup.sh
cp .env.example .env   # set OPENROUTER_API_KEY (+ optional keys)

# Production-style (keys in .env, no client keys):
uv run uvicorn api.app:app --host 127.0.0.1 --port 8004 --reload

# Hackathon dev (allow browser to send keys):
# ALLOW_CLIENT_API_KEYS=true in .env

cd frontend && npm run dev   # http://localhost:5176
```

Health check: `GET /health` → `{ llm_configured, auth_required, client_keys_allowed }`

---

## Architecture

```
POST /api/incident → run_graph_task (background)
  → triage → rag_search → [rca → browser/web_search] → PAUSE (interrupt_before remediation)
  → POST /api/incident/{run_id}/resume { approval: {...} }
  → remediation → reporter → store_incident → END
```

**Graph file:** `graph/incident_graph.py`  
**API:** `api/app.py`  
**State model:** `models/incident_state.py` (includes `ApprovalDecision`)

### Key production changes (2026-06-13)

| Area | Implementation |
|------|----------------|
| Persistent checkpoints | SQLite via `AsyncSqliteSaver` → `data/checkpoints.db` |
| Run metadata | SQLite → `data/runs.db` (`api/persistence.py`) |
| API auth | Optional `INCIDENT_API_KEY` → Bearer or `X-API-Key` on `/api/incident/*` |
| Server-side secrets | `OPENROUTER_API_KEY` / `TAVILY_API_KEY` from `.env`; client keys only if `ALLOW_CLIENT_API_KEYS=true` |
| Approval enforcement | `agents/remediation_agent.py` blocks on `rejected` / `needs_changes` |
| Resume validation | Pydantic `ApprovalDecision`; rejects `status: pending` |
| Tests | `tests/test_api.py`, `tests/test_production.py` |
| Docker | `Dockerfile` (port 8004) |

---

## Environment variables

```env
OPENROUTER_API_KEY=sk-or-...          # Required unless local LLM
TAVILY_API_KEY=tvly-...               # Optional
INCIDENT_API_KEY=...                  # Production: protect API routes
ALLOW_CLIENT_API_KEYS=false           # true only for hackathon/dev
CHECKPOINT_DB_PATH=data/checkpoints.db
RUNS_DB_PATH=data/runs.db
OPENROUTER_MODEL=google/gemini-2.5-flash
SLACK_WEBHOOK_URL=...                 # Optional remediation alerts
```

---

## API reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Server status + config flags |
| GET | `/api/incident/scenarios` | Optional | List simulated scenarios |
| POST | `/api/incident` | Optional | Start run `{ scenario_type, llm_model?, custom_telemetry? }` |
| GET | `/api/incident/{run_id}` | Optional | Run status + report |
| GET | `/api/incident/{run_id}/stream` | Optional | SSE event stream |
| POST | `/api/incident/{run_id}/resume` | Optional | Resume paused run |
| GET | `/api/incident/{run_id}/cost` | Optional | Token/cost summary |

**Resume payload:**
```json
{
  "approval": {
    "status": "approved",
    "judge_name": "QA",
    "comments": "Looks good."
  }
}
```
Valid statuses: `approved`, `rejected`, `needs_changes` (not `pending`).

---

## Human-in-the-loop (verified working)

1. Graph compiled with `interrupt_before=["remediation"]` and `MemorySaver` replaced by **SQLite checkpointer**.
2. After first `ainvoke`, `get_state(config).next` is non-empty → API sets `status=paused`, SSE `phase_change: paused_for_approval`.
3. Resume: `update_state(config, {"approval": ...})` then `ainvoke(None, config)`.
4. Remediation checks `approval.status` before executing LLM/Slack steps.

---

## Known bugs fixed

- **Pydantic None on RAG tools:** `api_key` / `base_url` coerced to `""` in `rag_search_node` and `store_incident_node`.
- **Resume checkpointer:** explicit `update_state` before `ainvoke(None)` in `api/app.py`.

---

## File map (edit these most often)

```
api/app.py              FastAPI routes, run_graph_task, lifespan
api/auth.py             Bearer / X-API-Key middleware
api/secrets.py          resolve_llm_credentials()
api/persistence.py      SQLite run state
api/streaming.py        SSE helpers
graph/incident_graph.py LangGraph topology + get_compiled_graph()
agents/*.py             Agent nodes (triage, rca, browser, remediation, reporter, ...)
memory/incident_rag.py  ChromaDB + JSON fallback RAG
frontend/src/lib/api.ts API client (+ auth header from localStorage incident_api_key)
frontend/src/pages/home.tsx  Simulator UI
utils/config.py         All env config
tests/                  pytest suite
```

---

## Testing

```bash
uv run pytest tests/ -q
```

---

## Production deployment checklist

- [ ] Set `OPENROUTER_API_KEY`, `TAVILY_API_KEY` in secrets manager (not browser)
- [ ] Set `INCIDENT_API_KEY` and `ALLOW_CLIENT_API_KEYS=false`
- [ ] Mount persistent volume for `data/` (checkpoints + runs)
- [ ] `docker build -t outage-investigator . && docker run -p 8004:8004 --env-file .env`
- [ ] Put reverse proxy (nginx/ACA) with TLS in front
- [ ] Optional: swap SQLite for Postgres checkpointer (`langgraph-checkpoint-postgres`) at scale

---

## Still NOT done (future work)

- Job queue (Celery/Service Bus) for graph execution reliability
- Frontend approval UI on run page (resume via curl/API today)
- Structured LLM output with schema validation + retries
- Full integration tests mocking LLM calls
- Postgres checkpointer for multi-replica deployments
- Rate limiting / per-tenant cost caps

---

## Common commands

```bash
# CLI (no HITL pause handling — uses in-memory checkpointer)
uv run python main.py --scenario stripe_outage

# E2E manual test
curl -X POST http://127.0.0.1:8004/api/incident \
  -H "Content-Type: application/json" \
  -d '{"scenario_type":"stripe_outage","llm_model":"google/gemini-2.5-flash"}'

curl -X POST http://127.0.0.1:8004/api/incident/RUN-XXXXXXXX/resume \
  -H "Content-Type: application/json" \
  -d '{"approval":{"status":"approved","judge_name":"QA","comments":"OK"}}'
```

---

## Instructions for the next Claude session

1. Read this file first, then `api/app.py` and `graph/incident_graph.py`.
2. Run `uv run pytest tests/` before and after changes.
3. Do not commit unless the user asks.
4. Production secrets stay server-side; never log API keys.
5. If resuming HITL work, verify `interrupt_before=["remediation"]` and SQLite checkpointer init in `lifespan()`.

*Last updated: 2026-06-13 — production hardening pass.*
