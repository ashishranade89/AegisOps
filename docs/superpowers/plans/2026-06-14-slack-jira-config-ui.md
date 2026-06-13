# Slack & Jira Config UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Slack and Jira credential fields (collapsible accordions with per-integration Test buttons) to the ApiKeyGate setup screen and cockpit sidebar, backed by two new backend test endpoints.

**Architecture:** A shared `IntegrationAccordion` React component manages its own localStorage state and calls frontend API functions (`testSlack`, `testJira`). Two new FastAPI endpoints (`POST /api/test/slack`, `POST /api/test/jira`) make lightweight auth-check calls to Slack/Jira APIs using the provided credentials and return `{ok, message}`. No new dependencies are needed — `httpx` and `pydantic` are already in the stack.

**Tech Stack:** React (TSX), FastAPI, httpx (async), pydantic v2, localStorage, lucide-react icons, pytest-asyncio

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `backend/api/app.py` | Modify | Add `TestSlackRequest`, `TestJiraRequest`, `TestConnectionResponse` models + `_call_slack_auth_test` + `_call_jira_myself` helpers + two new endpoints |
| `tests/test_api.py` | Modify | Add tests for the two new endpoints |
| `frontend/src/lib/api.ts` | Modify | Add `TestResult` type + `testSlack()` + `testJira()` functions |
| `frontend/src/components/vigilant/IntegrationAccordion.tsx` | Create | Shared accordion component: expand/collapse, field inputs, Test button, badge |
| `frontend/src/components/vigilant/ApiKeyGate.tsx` | Modify | Import + render `IntegrationAccordion` for Slack and Jira after Tavily section |
| `frontend/src/components/vigilant/AgentSwarmCockpit.tsx` | Modify | Import + render the same two `IntegrationAccordion` components in the `keys` tab |

---

## Task 1: Backend — test connection endpoints

**Files:**
- Modify: `backend/api/app.py`
- Modify: `tests/test_api.py`

- [ ] **Step 1: Write failing tests**

Add these tests to `tests/test_api.py`:

```python
# At top of file, add:
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_test_slack_returns_ok_on_valid_token(client):
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"ok": True, "team": "Acme Corp"}

    with patch("backend.api.app._call_slack_auth_test", new=AsyncMock(return_value=mock_resp.json())):
        response = await client.post(
            "/api/test/slack",
            json={"slack_bot_token": "xoxb-valid", "slack_channel_id": "C123"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert "Acme Corp" in body["message"]


@pytest.mark.asyncio
async def test_test_slack_returns_error_on_invalid_token(client):
    with patch("backend.api.app._call_slack_auth_test", new=AsyncMock(return_value={"ok": False, "error": "invalid_auth"})):
        response = await client.post(
            "/api/test/slack",
            json={"slack_bot_token": "xoxb-bad", "slack_channel_id": "C123"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert "invalid_auth" in body["message"]


@pytest.mark.asyncio
async def test_test_slack_requires_both_fields(client):
    response = await client.post("/api/test/slack", json={"slack_bot_token": "xoxb-x"})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_test_jira_returns_ok_on_valid_creds(client):
    with patch(
        "backend.api.app._call_jira_myself",
        new=AsyncMock(return_value=(200, {"displayName": "Jane Doe"})),
    ):
        response = await client.post(
            "/api/test/jira",
            json={
                "jira_base_url": "https://acme.atlassian.net",
                "jira_email": "jane@acme.com",
                "jira_api_token": "token123",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert "Jane Doe" in body["message"]


@pytest.mark.asyncio
async def test_test_jira_returns_error_on_bad_creds(client):
    with patch(
        "backend.api.app._call_jira_myself",
        new=AsyncMock(return_value=(401, {})),
    ):
        response = await client.post(
            "/api/test/jira",
            json={
                "jira_base_url": "https://acme.atlassian.net",
                "jira_email": "jane@acme.com",
                "jira_api_token": "badtoken",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert "401" in body["message"]


@pytest.mark.asyncio
async def test_test_jira_requires_all_three_fields(client):
    response = await client.post(
        "/api/test/jira",
        json={"jira_base_url": "https://acme.atlassian.net", "jira_email": "x@x.com"},
    )
    assert response.status_code == 422
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "/Volumes/MyData/AI Acclerator program documents/Hackthon/vendor_outage_investigator"
python -m pytest tests/test_api.py::test_test_slack_returns_ok_on_valid_token tests/test_api.py::test_test_jira_returns_ok_on_valid_creds -v
```

Expected: FAIL with `404` (endpoints don't exist yet).

- [ ] **Step 3: Add imports and models to `backend/api/app.py`**

Change the pydantic import line (currently `from pydantic import ValidationError`) to:

```python
from pydantic import BaseModel, ValidationError
```

Add at the top of the imports block, after the existing stdlib imports (`import hashlib` etc.):

```python
import base64
import httpx
```

After the existing imports block (around line 38, after the existing `from backend...` imports), add these Pydantic models:

```python
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
```

- [ ] **Step 4: Add helper functions and endpoints to `backend/api/app.py`**

Add the following directly after the `/health` endpoint (after line 724, before the comment `# Serve the compiled React frontend`):

```python
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
```

- [ ] **Step 5: Run all new tests to confirm they pass**

```bash
python -m pytest tests/test_api.py -k "test_test_slack or test_test_jira" -v
```

Expected output: 6 PASSED.

- [ ] **Step 6: Run full test suite to confirm no regressions**

```bash
python -m pytest tests/test_api.py -v
```

Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add backend/api/app.py tests/test_api.py
git commit -m "feat: add POST /api/test/slack and /api/test/jira endpoints"
```

---

## Task 2: Frontend API client — add testSlack and testJira

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add `TestResult` type and the two test functions**

At the end of `frontend/src/lib/api.ts`, append:

```typescript
export interface TestResult {
  ok: boolean
  message: string
}

export async function testSlack(creds: {
  slack_bot_token: string
  slack_channel_id: string
}): Promise<TestResult> {
  try {
    const res = await fetch('/api/test/slack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds),
    })
    if (!res.ok) return { ok: false, message: 'Could not reach server — try again' }
    return res.json()
  } catch {
    return { ok: false, message: 'Network error — check your connection' }
  }
}

export async function testJira(creds: {
  jira_base_url: string
  jira_email: string
  jira_api_token: string
}): Promise<TestResult> {
  try {
    const res = await fetch('/api/test/jira', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds),
    })
    if (!res.ok) return { ok: false, message: 'Could not reach server — try again' }
    return res.json()
  } catch {
    return { ok: false, message: 'Network error — check your connection' }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Volumes/MyData/AI Acclerator program documents/Hackthon/vendor_outage_investigator/frontend"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Volumes/MyData/AI Acclerator program documents/Hackthon/vendor_outage_investigator"
git add frontend/src/lib/api.ts
git commit -m "feat: add testSlack and testJira functions to API client"
```

---

## Task 3: Create IntegrationAccordion component

**Files:**
- Create: `frontend/src/components/vigilant/IntegrationAccordion.tsx`

- [ ] **Step 1: Create the file**

Create `frontend/src/components/vigilant/IntegrationAccordion.tsx` with this content:

```tsx
import { useState, useCallback } from 'react'
import { ChevronDown, ChevronRight, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react'
import type { TestResult } from '../../lib/api'

export interface FieldConfig {
  label: string
  storageKey: string
  placeholder: string
  type: 'password' | 'text'
  /** Field must be non-empty to enable the Test button */
  testRequired?: boolean
  /** Render the Test button inline with this field */
  showTestButton?: boolean
}

interface IntegrationAccordionProps {
  icon: string
  title: string
  fields: FieldConfig[]
  onTest?: (values: Record<string, string>) => Promise<TestResult>
}

type TestState = 'idle' | 'testing' | 'ok' | 'error'

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldConfig
  value: string
  onChange: (v: string) => void
}) {
  const [show, setShow] = useState(false)

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg)',
    border: '1px solid var(--line-strong)',
    borderRadius: 8,
    padding: field.type === 'password' ? '10px 40px 10px 12px' : '10px 12px',
    fontSize: 13,
    color: 'var(--ink)',
    outline: 'none',
    fontFamily: 'monospace',
    boxSizing: 'border-box',
    transition: 'border-color 150ms',
  }

  if (field.type === 'password') {
    return (
      <div style={{ position: 'relative', width: '100%' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          autoComplete="off"
          spellCheck={false}
          style={inputStyle}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--ink-3)', padding: 0, display: 'flex', alignItems: 'center',
          }}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    )
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      autoComplete="off"
      spellCheck={false}
      style={{ ...inputStyle, width: '100%' }}
    />
  )
}

export function IntegrationAccordion({ icon, title, fields, onTest }: IntegrationAccordionProps) {
  const [expanded, setExpanded] = useState(false)
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    fields.forEach((f) => { init[f.storageKey] = localStorage.getItem(f.storageKey) || '' })
    return init
  })
  const [testState, setTestState] = useState<TestState>('idle')
  const [testMessage, setTestMessage] = useState('')

  const canTest =
    onTest != null &&
    fields.filter((f) => f.testRequired).every((f) => (values[f.storageKey] || '').trim().length > 0)

  const anyFilled = fields.some((f) => (values[f.storageKey] || '').trim().length > 0)

  const handleChange = useCallback((storageKey: string, val: string) => {
    setValues((prev) => ({ ...prev, [storageKey]: val }))
    localStorage.setItem(storageKey, val)
    // Reset test state whenever the user edits a field (spec: badge must not show stale state)
    setTestState('idle')
    setTestMessage('')
  }, [])

  const handleTest = async () => {
    if (!onTest || !canTest) return
    setTestState('testing')
    try {
      const result = await onTest(values)
      setTestState(result.ok ? 'ok' : 'error')
      setTestMessage(result.message)
    } catch {
      setTestState('error')
      setTestMessage('Unexpected error — try again')
    }
  }

  const badgeColor =
    testState === 'ok' ? '#10b981'
    : testState === 'error' ? '#ef4444'
    : anyFilled ? 'var(--ink-3)'
    : 'var(--ink-4)'

  const badgeText =
    testState === 'ok' ? '✓ connected'
    : testState === 'error' ? '✗ error'
    : anyFilled ? 'not tested'
    : 'not configured'

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: expanded ? 'var(--surface-2)' : 'var(--surface)',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--ink)',
          transition: 'background 150ms',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{title}</span>
          <span style={{
            fontSize: 11, fontWeight: 600,
            background: 'var(--surface-2)', color: 'var(--ink-3)',
            padding: '2px 8px', borderRadius: 6, border: '1px solid var(--line)',
          }}>Optional</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: badgeColor, fontWeight: 600 }}>{badgeText}</span>
          {expanded
            ? <ChevronDown size={14} style={{ color: 'var(--ink-3)' }} />
            : <ChevronRight size={14} style={{ color: 'var(--ink-3)' }} />}
        </div>
      </button>

      {/* Accordion body */}
      {expanded && (
        <div style={{
          padding: '14px 16px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          background: 'var(--bg)',
        }}>
          {fields.map((f) => (
            <div key={f.storageKey}>
              <label style={{
                fontSize: 12, fontWeight: 700, color: 'var(--ink-3)',
                display: 'block', marginBottom: 5,
              }}>
                {f.label}
              </label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <FieldInput
                    field={f}
                    value={values[f.storageKey] || ''}
                    onChange={(v) => handleChange(f.storageKey, v)}
                  />
                </div>
                {f.showTestButton && onTest && (
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={!canTest || testState === 'testing'}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: testState === 'ok'
                        ? '1px solid rgba(16,185,129,.4)'
                        : testState === 'error'
                        ? '1px solid rgba(239,68,68,.4)'
                        : '1px solid var(--line-strong)',
                      background: testState === 'ok'
                        ? 'rgba(16,185,129,.1)'
                        : testState === 'error'
                        ? 'rgba(239,68,68,.1)'
                        : 'var(--surface-2)',
                      color: testState === 'ok'
                        ? '#10b981'
                        : testState === 'error'
                        ? '#ef4444'
                        : canTest ? 'var(--ink-2)' : 'var(--ink-4)',
                      fontSize: 12, fontWeight: 700,
                      cursor: canTest && testState !== 'testing' ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', gap: 5,
                      whiteSpace: 'nowrap', flexShrink: 0,
                      transition: 'all 150ms',
                    }}
                  >
                    {testState === 'testing'
                      ? <><span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> Testing…</>
                      : 'Test'}
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Inline test result message */}
          {(testState === 'ok' || testState === 'error') && testMessage && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 10px', borderRadius: 7,
              background: testState === 'ok' ? 'rgba(16,185,129,.08)' : 'rgba(239,68,68,.08)',
              border: `1px solid ${testState === 'ok' ? 'rgba(16,185,129,.25)' : 'rgba(239,68,68,.25)'}`,
            }}>
              {testState === 'ok'
                ? <CheckCircle2 size={13} style={{ color: '#10b981', flexShrink: 0 }} />
                : <XCircle size={13} style={{ color: '#ef4444', flexShrink: 0 }} />}
              <span style={{
                fontSize: 12,
                color: testState === 'ok' ? '#10b981' : '#ef4444',
                fontWeight: 600,
              }}>{testMessage}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Volumes/MyData/AI Acclerator program documents/Hackthon/vendor_outage_investigator/frontend"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Volumes/MyData/AI Acclerator program documents/Hackthon/vendor_outage_investigator"
git add frontend/src/components/vigilant/IntegrationAccordion.tsx
git commit -m "feat: add IntegrationAccordion component for optional API integrations"
```

---

## Task 4: Add integration accordions to ApiKeyGate

**Files:**
- Modify: `frontend/src/components/vigilant/ApiKeyGate.tsx`

- [ ] **Step 1: Add imports at the top of `ApiKeyGate.tsx`**

After the existing import line:
```tsx
import { Key, Eye, EyeOff, ShieldCheck, ArrowRight, ExternalLink, Zap, Cpu, AlertCircle, CheckCircle2 } from 'lucide-react'
```

Add:
```tsx
import { IntegrationAccordion } from './IntegrationAccordion'
import { testSlack, testJira } from '../../lib/api'
```

- [ ] **Step 2: Add the integrations section to the JSX**

In `ApiKeyGate.tsx`, locate the Tavily section which ends with this closing div (line ~168):
```tsx
          </div>

          {/* LLM model selector */}
```

Between those two divs, insert the new "Integrations" section:

```tsx
          {/* Integrations — Slack & Jira (both optional) */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
              Integrations <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-4)' }}>— optional</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <IntegrationAccordion
                icon="🔔"
                title="Slack"
                fields={[
                  { label: 'Bot Token', storageKey: 'slack_bot_token', placeholder: 'xoxb-...', type: 'password', testRequired: true, showTestButton: true },
                  { label: 'Channel ID', storageKey: 'slack_channel_id', placeholder: 'C01AB2CD3EF', type: 'text', testRequired: true },
                ]}
                onTest={(values) => testSlack({ slack_bot_token: values.slack_bot_token, slack_channel_id: values.slack_channel_id })}
              />
              <IntegrationAccordion
                icon="📋"
                title="Jira"
                fields={[
                  { label: 'Base URL', storageKey: 'jira_base_url', placeholder: 'https://company.atlassian.net', type: 'text', testRequired: true },
                  { label: 'Email', storageKey: 'jira_email', placeholder: 'you@company.com', type: 'text', testRequired: true },
                  { label: 'API Token', storageKey: 'jira_api_token', placeholder: 'your-jira-api-token', type: 'password', testRequired: true, showTestButton: true },
                  { label: 'Project Key', storageKey: 'jira_project_key', placeholder: 'OPS', type: 'text' },
                ]}
                onTest={(values) => testJira({ jira_base_url: values.jira_base_url, jira_email: values.jira_email, jira_api_token: values.jira_api_token })}
              />
            </div>
          </div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Volumes/MyData/AI Acclerator program documents/Hackthon/vendor_outage_investigator/frontend"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Start the dev server and manually test**

```bash
cd "/Volumes/MyData/AI Acclerator program documents/Hackthon/vendor_outage_investigator/frontend"
npm run dev
```

Open the app and verify:
- The setup screen shows the "Integrations" section between Tavily and the LLM model selector
- Both Slack and Jira rows are collapsed with "not configured" badge
- Clicking a row expands it and shows the correct fields
- Test button is greyed out until required fields are filled
- Editing a field after a test resets the badge to "not configured"
- Closing and reopening the page pre-fills fields from localStorage

- [ ] **Step 5: Commit**

```bash
cd "/Volumes/MyData/AI Acclerator program documents/Hackthon/vendor_outage_investigator"
git add frontend/src/components/vigilant/ApiKeyGate.tsx
git commit -m "feat: add Slack & Jira accordion sections to ApiKeyGate setup screen"
```

---

## Task 5: Mirror integration accordions in cockpit sidebar

**Files:**
- Modify: `frontend/src/components/vigilant/AgentSwarmCockpit.tsx`

- [ ] **Step 1: Add imports to `AgentSwarmCockpit.tsx`**

Find the existing imports at the top of the file. Add:

```tsx
import { IntegrationAccordion } from './IntegrationAccordion'
import { testSlack, testJira } from '../../lib/api'
```

- [ ] **Step 2: Add the accordion panels in the `keys` tab**

In `AgentSwarmCockpit.tsx`, locate the `keys` tab content (around line 261):

```tsx
        {tab === 'keys' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ApiKeyInput label="OpenRouter Key" ... />
            <ApiKeyInput label="Tavily Search Key" ... />

            <button   {/* Save Keys button */}
```

Between the Tavily `ApiKeyInput` and the Save Keys button, insert:

```tsx
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: -4 }}>
              Integrations
            </div>
            <IntegrationAccordion
              icon="🔔"
              title="Slack"
              fields={[
                { label: 'Bot Token', storageKey: 'slack_bot_token', placeholder: 'xoxb-...', type: 'password', testRequired: true, showTestButton: true },
                { label: 'Channel ID', storageKey: 'slack_channel_id', placeholder: 'C01AB2CD3EF', type: 'text', testRequired: true },
              ]}
              onTest={(values) => testSlack({ slack_bot_token: values.slack_bot_token, slack_channel_id: values.slack_channel_id })}
            />
            <IntegrationAccordion
              icon="📋"
              title="Jira"
              fields={[
                { label: 'Base URL', storageKey: 'jira_base_url', placeholder: 'https://company.atlassian.net', type: 'text', testRequired: true },
                { label: 'Email', storageKey: 'jira_email', placeholder: 'you@company.com', type: 'text', testRequired: true },
                { label: 'API Token', storageKey: 'jira_api_token', placeholder: 'your-jira-api-token', type: 'password', testRequired: true, showTestButton: true },
                { label: 'Project Key', storageKey: 'jira_project_key', placeholder: 'OPS', type: 'text' },
              ]}
              onTest={(values) => testJira({ jira_base_url: values.jira_base_url, jira_email: values.jira_email, jira_api_token: values.jira_api_token })}
            />
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Volumes/MyData/AI Acclerator program documents/Hackthon/vendor_outage_investigator/frontend"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manually test the cockpit sidebar**

With the dev server running, launch an investigation and open the "API Keys" tab in the left sidebar. Verify:
- Slack and Jira accordion rows appear below Tavily
- Fields pre-fill from localStorage (values entered in setup screen carry over)
- Test button works (connect to running backend)
- Badge updates correctly after test
- Editing a field resets the badge

- [ ] **Step 5: Commit**

```bash
cd "/Volumes/MyData/AI Acclerator program documents/Hackthon/vendor_outage_investigator"
git add frontend/src/components/vigilant/AgentSwarmCockpit.tsx
git commit -m "feat: mirror Slack & Jira accordion panels in cockpit API Keys sidebar"
```

---

## Done

All five tasks complete. The feature is:
- Backend: `POST /api/test/slack` and `POST /api/test/jira` with 6 passing tests
- Frontend: shared `IntegrationAccordion` component used in both setup screen and cockpit sidebar
- UX: collapsible by default, Test button per integration, badge resets on field edit, all keys persisted to localStorage
