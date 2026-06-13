# System Architecture & Workflow

This document provides a detailed look into how AegisOps operates, the roles of various agents, and the flow of data through the system.

## Changelog Maintenance

- `changelog.md` is generated from `git log` and should be refreshed whenever commits change.
- Run `scripts/update-changelog.ps1` to rebuild it manually.
- For automatic refreshes on commit and merge, point git at `.githooks` with `git config core.hooksPath .githooks`.

## 🏗️ Architectural Overview

The system is built on a **Stateful Agent Swarm** architecture using **LangGraph**. Unlike traditional linear pipelines, this allows for dynamic routing, retries, and self-healing.

### Key Components

-   **Backend (Python/FastAPI)**: Serves as the orchestration layer and API provider.
-   **Agent Swarm (LangGraph)**: The core intelligence that handles the investigation.
-   **Frontend (React/Vite)**: A real-time dashboard for monitoring the investigation and approving actions.
-   **Vector Database (RAG)**: Stores historical incidents to provide "instant-on" root cause analysis for recurring issues.

---

## 🔄 Detailed Node-by-Node Workflow

The system is a stateful directed acyclic graph (DAG) where each node represents a specialized agent or processing step.

### 1. Triage Agent (`triage`)
-   **Purpose**: Initial log and metric analysis.
-   **Input**: `raw_logs`, `raw_metrics`.
-   **Logic**:
    -   Truncates logs to the most recent 50 entries.
    -   Extracts structured events (timestamp, service, level, message).
    -   Identifies the **suspected vendor** and **severity** level (Sev1–Sev4).
-   **Tools**: `post_slack_notification` (sends a "New Incident Triaged" alert).
-   **Output**: `suspected_vendor`, `severity`, `internal_findings`, `events`.

### 2. RAG Cache Lookup (`rag_search`)
-   **Purpose**: Historical memory retrieval.
-   **Input**: `internal_findings`, `suspected_vendor`.
-   **Logic**: Searches ChromaDB/JSON files for past incidents with similar symptoms.
-   **Decision Point**:
    -   **Confidence ≥ 0.85**: Jump directly to `remediation` (it's a known issue).
    -   **Confidence < 0.85**: Proceed to `rca` for deeper investigation.
-   **Output**: `rag_result`, `rag_confidence`.

### 3. Root Cause Analyzer (`rca`)
-   **Purpose**: Investigation strategy and hypothesis generation.
-   **Input**: Triage findings + RAG results.
-   **Logic**:
    -   Formulates multiple **hypotheses** (e.g., "Vendor API Outage", "Network Latency").
    -   Determines routing: `needs_browser` (for status pages), `needs_web_search` (for social/news), or `needs_human_escalation`.
-   **Output**: `hypotheses`, `confidence_score`, `needs_browser`, `needs_web_search`.

### 4. Browser Scraper Agent (`browser`)
-   **Purpose**: Official vendor status verification.
-   **Input**: `suspected_vendor`.
-   **Logic**:
    -   Uses **Stagehand/Playwright** to navigate to the vendor's status page.
    -   Extracts specific outage details (affected services, current status).
-   **Tools**: `check_vendor_status_page`.
-   **Output**: `browser_result`, updated `root_cause`.

### 5. Web Search Agent (`web_search`)
-   **Purpose**: External community/news verification.
-   **Input**: `suspected_vendor`, `internal_findings`.
-   **Logic**: Queries search engines for independent confirmation from sources like DownDetector or Twitter.
-   **Tools**: `search_vendor_outage_online` (Tavily/DuckDuckGo).
-   **Output**: `web_search_result`, updated `root_cause`.

### 6. Remediation Agent (`remediation`)
-   **Purpose**: Mitigation planning and execution.
-   **Input**: Confirmed `root_cause` and investigation findings.
-   **Logic**:
    -   **Human-in-the-Loop**: Can pause here for manual approval via the UI.
    -   Generates a list of **remediation_steps** and a **containment plan**.
    -   Drafts long-term **recommendations**.
-   **Tools**: `post_slack_notification` (sends "Remediation Action Planned").
-   **Output**: `remediation_steps`, `recommendations`.

### 7. Reporter Agent (`reporter`)
-   **Purpose**: Postmortem documentation.
-   **Input**: Full state (findings, RCA, remediation).
-   **Logic**: Synthesizes all data into a professional Markdown report following industry standards (summary, timeline, impact, RCA, resolution).
-   **Output**: `final_report`.

### 8. Self-Heal Agent (`self_heal`)
-   **Purpose**: Resilience and error recovery.
-   **Input**: `failed_node`, `last_error`.
-   **Logic**:
    -   Intercepts failures (e.g., scraping timeouts or LLM rate limits).
    -   Implements **retry logic** (up to 3 attempts).
    -   **Reroutes** around failures (e.g., if scraping fails, try web search; if both fail, escalate to human).
-   **Output**: Updated routing flags, incremented `retry_count`.

### 9. RAG Storage (`store_incident`)
-   **Purpose**: System learning.
-   **Input**: Resolved incident details.
-   **Logic**: Appends the current incident's findings and resolution to the vector database for future use.
-   **Output**: Updated knowledge base.

---

## 🏃 Step-by-Step Example: Stripe API Outage

To help you visualize the flow, here is how the system handles a typical Stripe outage:

1.  **Triage**: Logs show `StripeConnectionError` and `timeout` in the checkout service. The Triage Agent identifies **Stripe** as the suspected vendor and sets **Severity: Sev1**. A Slack alert is sent.
2.  **RAG**: The system checks if this happened before. If a similar Stripe timeout was resolved yesterday, it suggests the same fix. If not, it moves on.
3.  **RCA**: The RCA agent sees "Stripe" and "Connection Timeout". It sets `needs_browser = true` to check `status.stripe.com`.
4.  **Browser**: The Browser Agent navigates to Stripe's status page. It finds a "Major Outage" notification affecting "API Requests" in the US.
5.  **Web Search**: Simultaneously, the Web Search Agent finds 10+ tweets from the last 5 minutes complaining about Stripe being down.
6.  **Remediation**: The system proposes switching the payment gateway to the backup (e.g., Adyen or PayPal) and alerts the team on Slack.
7.  **Reporter**: A full Markdown report is generated with the Stripe status page screenshot link and a timeline of the failure.
8.  **Storage**: The details are saved so next time a Stripe timeout occurs, the AegisOps RAG node can catch it instantly.

---

## 📊 Data Flow Diagram

```mermaid
graph TD
    A[Telemetry Upload] --> B[Triage Agent]
    B --> C{RAG Search}
    C -- High Confidence --> G[Remediation Agent]
    C -- Low Confidence --> D[RCA Agent]
    D --> E[Browser Agent]
    D --> F[Web Search Agent]
    E --> G
    F --> G
    G --> H[Reporter Agent]
    H --> I[RAG Storage]
    
    subgraph "Self-Healing Layer"
    J[Self-Heal Agent] -.-> B
    J -.-> D
    J -.-> G
    end
```
