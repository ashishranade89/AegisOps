# API Reference

AegisOps provides a FastAPI-based REST API with real-time streaming capabilities.

---

## 🔐 Authentication

If `ALLOW_CLIENT_API_KEYS` is set to `false` in `.env`, all requests must include a `X-API-Key` header with the value matching your `INCIDENT_API_KEY`.

---

## 📡 Core Endpoints

### 1. Start Investigation
`POST /api/incident`

Trigger a new investigation swarm.
- **Payload**:
  ```json
  {
    "scenario_type": "stripe_outage",
    "custom_telemetry": { "raw_logs": [...], "raw_metrics": {...} }
  }
  ```
- **Response**: `{"run_id": "uuid-...", "status": "pending"}`

### 2. Stream Real-time Updates
`GET /api/incident/{run_id}/stream`

Server-Sent Events (SSE) stream for monitoring the swarm.
- **Events**:
    - `phase_change`: Current phase (triage, rca, etc.)
    - `agent_start` / `agent_end`: Status of specific agents.
    - `tool_start` / `tool_end`: Details on tool usage (Slack, Browser).
    - `report`: The final Markdown report.
    - `done`: Signal that the pipeline has completed.

### 3. Approve Remediation
`POST /api/incident/{run_id}/resume`

Resume a paused investigation by providing a human decision.
- **Payload**:
  ```json
  {
    "approval": {
      "status": "approved|rejected|needs_changes",
      "judge_name": "Admin",
      "comments": "Proceed with backup switch."
    }
  }
  ```

### 4. Chat with AegisOps Assistant
`POST /api/incident/{run_id}/chat`

Ask questions about a specific incident in plain language.
- **Payload**: `{"message": "What is the status of Stripe?", "history": [...]}`
- **Response**: `{"reply": "Stripe is currently experiencing a major outage affecting US regions..."}`

---

## 📊 Management Endpoints

-   **`GET /api/history`**: List past investigation runs.
-   **`GET /api/history/{run_id}/report`**: Retrieve the full report for a past run.
-   **`DELETE /api/history/{run_id}`**: Delete a run from history.
-   **`GET /api/rag/entries`**: View all historical incidents stored in the knowledge base.
-   **`GET /health`**: Check system status and LLM configuration.
