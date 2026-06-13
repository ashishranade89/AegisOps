# Vendor Outage Investigator

Autonomous AI swarm that triages vendor outages, scrapes status pages, searches the web, and generates postmortem reports in under 60 seconds.

Built for the AI Accelerator Hackathon 2026, this tool helps SREs and Incident Response teams automate the tedious process of investigating third-party service failures.

---

## 🌟 Interactive Onboarding

**New to the project?** Open our [Interactive Guide](./docs/INTERACTIVE_GUIDE.html) in your browser for a visual deep dive into the architecture, workflow, and setup.

---

## 🚀 Quick Start

### Prerequisites
- Python 3.12+
- Node.js 18+
- OpenRouter API Key

### One-Command Setup
```bash
./setup.sh
```
This script installs all dependencies, sets up your `.env` file, and prepares the environment.

### Run the Application
**Desktop App (Electron):**
```bash
cd frontend && npm run electron:dev
```

**Web Interface:**
- Start Backend: `uv run uvicorn api.app:app --host 127.0.0.1 --port 8004 --reload`
- Start Frontend: `cd frontend && npm run dev`
- Open [http://localhost:5176](http://localhost:5176)

---

## ✨ Key Features

-   **Autonomous Swarm**: 8 specialized agents collaborating in a stateful LangGraph.
-   **Self-Healing**: Automatic recovery from tool timeouts or LLM rate limits via the Self-Heal Agent.
-   **RAG-Accelerated RCA**: Instant root cause analysis for recurring issues using historical incident memory.
-   **Multi-Source Verification**: Simultaneous status page scraping (Stagehand) and social media search (Tavily).
-   **Human-in-the-Loop**: Built-in approval gates for critical remediation actions.
-   **Real-time Observability**: 3D topology graph and live agent activity feed via SSE.

---

## 🧩 The Swarm

1.  **Triage Agent**: Analyzes telemetry to identify the suspected vendor.
2.  **RAG Cache**: Checks historical memory for similar past outages.
3.  **RCA Agent**: Formulates hypotheses and investigation strategy.
4.  **Browser Agent**: Scrapes vendor status pages using Stagehand.
5.  **Web Search Agent**: Finds external confirmation via social media/news.
6.  **Remediation Agent**: Generates containment plans (with Human-in-the-loop approval).
7.  **Reporter Agent**: Produces comprehensive Markdown postmortems.
8.  **Self-Heal Agent**: Recovers from failures and reroutes the investigation.

---

## 📂 Documentation

For deeper dives, check out:
- [Workflow & Architecture](./docs/WORKFLOW.md): How the agents collaborate.
- [Setup & Deployment Guide](./docs/OPERATIONS.md): Configuration and production.
- [API Reference](./docs/API.md): Endpoint documentation.

---

## 🗺️ Codebase Map

- **`backend/agents/`**: Core logic for each agent node.
- **`backend/graph/`**: Orchestration and routing logic (`incident_graph.py`).
- **`backend/api/`**: FastAPI server and real-time streaming.
- **`backend/tools/`**: Reusable toolkits (Slack, Browser, Web Search).
- **`frontend/src/components/`**: UI components and 3D visualizations.
- **`data/`**: SQLite databases (history and checkpoints).
- **`incident_memory_db/`**: JSON-based RAG knowledge base.
