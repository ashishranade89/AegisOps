# Slack & Jira Config UI — Design Spec

**Date:** 2026-06-14
**Status:** Approved

---

## Overview

Add optional Slack and Jira credential fields to the `ApiKeyGate` setup screen and cockpit sidebar "API Keys" tab. Each integration gets a collapsible accordion panel with a per-integration **Test** button that calls a dedicated backend endpoint to verify credentials. Keys are stored in `localStorage`, consistent with the existing OpenRouter/Tavily pattern.

---

## Frontend Changes

### ApiKeyGate.tsx

Add an "Integrations" section below the existing Tavily field, separated by a subtle divider and label.

#### Slack Accordion Panel

- **Header:** `🔔 Slack` + status badge: `not configured` / `✓ connected` / `✗ error`
- **Collapsed by default**
- **Fields (shown when expanded):**
  - Slack Bot Token (`xoxb-...`) — password input with eye toggle
  - Slack Channel ID — plain text input
- **Test button:** inline beside the Bot Token field
  - Disabled until both Bot Token and Channel ID are non-empty
  - On click: calls `POST /api/test/slack` with `{ slack_bot_token, slack_channel_id }`
  - Shows spinner while pending
  - On success: green `✓ Connected to workspace "<name>"` inline below
  - On failure: red `✗ <error message from API>`

#### Jira Accordion Panel

- **Header:** `📋 Jira` + status badge: `not configured` / `✓ connected` / `✗ error`
- **Collapsed by default**
- **Fields (shown when expanded):**
  - Jira Base URL (`https://company.atlassian.net`) — plain text input
  - Jira Email — plain text input
  - Jira API Token — password input with eye toggle
  - Jira Project Key — plain text input, optional, placeholder `OPS`
- **Test button:** inline beside the API Token field
  - Disabled until Base URL + Email + API Token are all non-empty
  - On click: calls `POST /api/test/jira` with `{ jira_base_url, jira_email, jira_api_token }`
  - Shows spinner while pending
  - On success: green `✓ Authenticated as "<display_name>"`
  - On failure: red `✗ <error message from API>`

#### Skippable

Both integration panels are entirely optional. The **Launch Investigator** button remains enabled regardless of whether Slack/Jira are configured. If skipped, those integrations are simply inactive during the investigation.

#### localStorage Keys

All fields are persisted to and pre-filled from `localStorage`:

| Key | Field |
|-----|-------|
| `slack_bot_token` | Slack Bot Token |
| `slack_channel_id` | Slack Channel ID |
| `jira_base_url` | Jira Base URL |
| `jira_email` | Jira Email |
| `jira_api_token` | Jira API Token |
| `jira_project_key` | Jira Project Key |

### AgentSwarmCockpit.tsx — "API Keys" Tab

Mirror the same Slack and Jira accordion panels in the cockpit sidebar "API Keys" tab, so users can add or update credentials mid-session without restarting. Same behaviour: Test button, localStorage sync, status badges.

### src/lib/api.ts

Add two new functions:

```ts
testSlack(creds: { slack_bot_token: string; slack_channel_id: string }): Promise<TestResult>
testJira(creds: { jira_base_url: string; jira_email: string; jira_api_token: string }): Promise<TestResult>
```

Where `TestResult = { ok: boolean; message: string }`.

**Badge reset rule:** If the user edits any field in a panel after a test has run, the inline result message clears and the header badge reverts to `not configured` (avoiding stale state).

---

## Backend Changes

### POST /api/test/slack

**Request body:**
```json
{ "slack_bot_token": "xoxb-...", "slack_channel_id": "C01AB2CD3EF" }
```

**Behaviour:** Calls Slack API `auth.test` using the provided token.

**Response:**
```json
{ "ok": true, "message": "Connected to workspace \"Acme Corp\"" }
{ "ok": false, "message": "invalid_auth — check your Slack Bot Token" }
```

### POST /api/test/jira

**Request body:**
```json
{ "jira_base_url": "https://acme.atlassian.net", "jira_email": "user@acme.com", "jira_api_token": "..." }
```

**Behaviour:** Calls `GET /rest/api/2/myself` with HTTP Basic Auth (`email:api_token`).

**Response:**
```json
{ "ok": true, "message": "Authenticated as \"Jane Doe\"" }
{ "ok": false, "message": "401 Unauthorized — check your Jira email and API token" }
```

Both endpoints:
- Use client-supplied keys directly (no server env required)
- Return HTTP 200 regardless of credential validity (`ok: false` for bad creds, not HTTP 4xx) so the frontend can display the message without treating it as a fetch error
- Return HTTP 500 only on network/unexpected errors with a generic message

---

## UX Flow

1. User opens app → `ApiKeyGate` displays
2. Fills required OpenRouter key, optionally Tavily
3. Sees "Integrations" section — two collapsed accordion rows with "not configured" status
4. Clicks a panel to expand → enters credentials → clicks **Test**
5. Spinner → resolves to success or error message inline
6. Can skip both integrations and click **Launch** — investigations run without Slack/Jira
7. Inside cockpit, "API Keys" sidebar tab mirrors the same fields for mid-session updates

---

## Error States

| Scenario | UI Behaviour |
|----------|-------------|
| Required fields empty | Test button disabled (greyed out) |
| Invalid credentials | `✗ <message from API>` inline |
| Network / timeout | `✗ Could not reach [Slack/Jira] — check your network` |
| Server error | `✗ Unexpected error — try again` |

---

## Out of Scope

- **Client-supplied Slack/Jira keys used in live incidents:** The backend Slack/Jira tools currently read from env vars via `config.py`. Threading client-supplied keys through the LangGraph agents is a separate story.
- **Jira Project Key validation:** Not tested by the `/api/test/jira` endpoint (it only verifies auth).
- **Slack Signing Secret:** Not included in the UI — only needed server-side for webhook verification, already in env.
