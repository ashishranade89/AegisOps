# Slack Bot + Jira Integration Design

**Date:** 2026-06-14  
**Project:** Vendor Outage Investigator (AegisOps)  
**Scope:** Add automatic Jira ticket creation and rich Slack Bot notifications with interactive approval to the LangGraph incident pipeline.

---

## 1. Goals

- **Jira:** Automatically create a Jira incident ticket after the triage agent completes, capturing severity, suspected vendor, and initial findings.
- **Slack:** Send a rich Block Kit message at the approval gate (with Approve/Reject buttons) and a threaded summary when the final report is generated. Approvals can be actioned from Slack OR the web UI — both paths resume the same pipeline.

---

## 2. Architecture Overview

New nodes are inserted into the existing LangGraph pipeline:

```
[triage_node] → [jira_node] → [rag_search_node] → [rca_node] → [browser_node?]
    → [web_search_node?] → [remediation_node] → [approval gate]
                                                       ↓
                                           [slack_approval_node]
                                                       ↓
                               (user clicks in Slack OR web UI approves)
                                                       ↓
                                   POST /api/slack/action  (new endpoint)
                                                       ↓
                                           [reporter_node] → [slack_report_node]
```

### New files

| File | Purpose |
|------|---------|
| `backend/tools/jira_tool.py` | Jira REST API client — create issue, transition status, add comment |
| `backend/tools/slack_bot_tool.py` | Slack Bot API client — post Block Kit messages, update messages, reply in thread |
| `backend/agents/jira_agent.py` | LangGraph node wrapping the Jira tool |
| `backend/agents/slack_agent.py` | LangGraph nodes: `slack_approval_node` and `slack_report_node` |

### Modified files

| File | Change |
|------|--------|
| `backend/graph/incident_graph.py` | Insert `jira_node` after triage; insert `slack_approval_node` at approval gate; insert `slack_report_node` after reporter |
| `backend/models/incident_state.py` | Add 3 new optional fields to `IncidentState` |
| `backend/api/app.py` | Add `POST /api/slack/action` endpoint |
| `.env.example` | Document all new env vars |

---

## 3. Configuration

All credentials are environment variables. The system degrades gracefully if any are missing.

```bash
# Jira (all required together; if any missing, jira_node skips silently)
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=you@company.com
JIRA_API_TOKEN=...
JIRA_PROJECT_KEY=OPS

# Slack Bot (SLACK_BOT_TOKEN required for rich bot; falls back to SLACK_WEBHOOK_URL if absent)
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNEL_ID=C0123456789
SLACK_SIGNING_SECRET=...    # used to verify Slack's POST to /api/slack/action
```

---

## 4. State Changes

Three new optional fields added to `IncidentState` (TypedDict):

```python
jira_ticket_url: Optional[str]    # e.g. "https://company.atlassian.net/browse/OPS-42"
jira_ticket_id: Optional[str]     # e.g. "OPS-42"
slack_approval_ts: Optional[str]  # Slack message timestamp for threading + updates
```

---

## 5. Component Details

### 5.1 `jira_tool.py`

Three functions (wrapped as LangChain `@tool`):

- `create_jira_incident(incident_id, severity, suspected_vendor, internal_findings, run_url)` → returns `{ticket_id, ticket_url}`
- `update_jira_status(ticket_id, status)` → transitions ticket ("In Progress" on approval, "Done" on report, "Closed" on rejection)
- `add_jira_comment(ticket_id, comment)` → appends text comment

Severity → Jira priority mapping: `P1/sev1 → Critical`, `P2/sev2 → High`, `P3/sev3 → Medium`, `P4/sev4 → Low`.

Dry-run mode (`JIRA_DRY_RUN=true`): returns mock response without hitting the API.

### 5.2 `slack_bot_tool.py`

Three functions:

- `post_approval_message(channel, run_id, root_cause, severity, suspected_vendor, remediation_steps, jira_url)` → posts Block Kit message with Approve/Reject buttons; returns `message_ts`
- `update_approval_message(channel, ts, decision, decided_by)` → replaces buttons with "✅ Approved by X" or "❌ Rejected by X"
- `post_report_thread(channel, ts, final_report, jira_ticket_id)` → replies in thread with report summary and Jira link

Falls back to the existing `post_slack_notification` (webhook) if `SLACK_BOT_TOKEN` is not set.

### 5.3 `jira_agent.py` (Graph Node)

```
Input state fields:  severity, suspected_vendor, internal_findings, incident_id
Output state fields: jira_ticket_url, jira_ticket_id
SSE events emitted:  agent_start, tool_start, tool_end, agent_end
Error behaviour:     catches all exceptions, logs, returns state unchanged
```

### 5.4 `slack_agent.py` (Two Graph Nodes)

**`slack_approval_node`** (fires when graph pauses for approval):
- Posts Block Kit approval message
- Writes `slack_approval_ts` to state

**`slack_report_node`** (fires after `reporter_node`):
- Posts threaded report summary
- Calls `update_jira_status(ticket_id, "Done")` + `add_jira_comment(ticket_id, final_report[:2000])`

### 5.5 `POST /api/slack/action`

1. Verifies Slack signing secret via HMAC-SHA256 (`X-Slack-Signature` header)
2. Parses `payload` form field (JSON): extracts `run_id` from `actions[0].value`, `approved/rejected` from `actions[0].action_id`, and `user.name`
3. Calls `update_approval_message(...)` to update the Slack message immediately (prevents double-clicks)
4. Calls existing `run_graph_task(run_id, resume_state={approval: {status, judge_name}})` — identical resume path as the web UI
5. Returns HTTP 200 with empty body (Slack requires this within 3 seconds)

---

## 6. Notification Triggers

| Event | Slack | Jira |
|-------|-------|------|
| Triage complete | — | Create ticket |
| Approval gate reached | Post Block Kit approval message | — |
| Approved (Slack) | Update message → ✅ | Transition → In Progress |
| Approved (web UI) | Update message → ✅ (if ts known) | Transition → In Progress |
| Rejected (either) | Update message → ❌ | Transition → Closed + comment |
| Final report ready | Thread reply with summary | Transition → Done + comment |

---

## 7. Error Handling

- **Missing config:** `jira_node` and both slack nodes check for required env vars at node entry. If absent, they emit a warning SSE event and return state unchanged — the pipeline continues.
- **API failure:** All tool calls are wrapped in try/except. Errors are logged and surfaced via SSE `agent_end` event with the error detail. Pipeline continues.
- **Slack signing secret mismatch:** `/api/slack/action` returns HTTP 403 and logs the IP. No pipeline effect.
- **Double approval:** The endpoint checks `state.status != "paused"` (existing guard in `/api/incident/{run_id}/resume`) before resuming. Slack message is updated immediately on first action to disable buttons visually.

---

## 8. Testing

- `jira_tool.py` and `slack_bot_tool.py` support `dry_run=True` mode (set via `JIRA_DRY_RUN=true` / `SLACK_DRY_RUN=true` env vars) — returns mock responses, no real API calls.
- `/api/slack/action` can be exercised via curl with a pre-computed HMAC-SHA256 signature.
- Existing test structure in `tests/` can be extended with unit tests for the two new tool modules.
