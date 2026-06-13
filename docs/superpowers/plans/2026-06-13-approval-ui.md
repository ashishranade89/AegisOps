# Approval UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inline approval card to the run page so reviewers can approve or reject the remediation step from the browser without using curl.

**Architecture:** One new component (`ApprovalCard`) renders in `run.tsx` only when `status === 'paused'`. It calls the already-existing `resumeIncident()` from `api.ts`, then sets `status = 'running'` in the Zustand store; SSE drives the rest. No backend changes, no store changes beyond reading `setStatus`.

**Tech Stack:** React 18, TypeScript, Zustand, Vite (`tsc -b` for type-checking), lucide-react for icons, existing CSS variables.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/components/approval-card.tsx` | Self-contained approval UI: textarea, Approve/Reject buttons, loading + error states |
| Modify | `frontend/src/pages/run.tsx` | Import + render `<ApprovalCard>`, fix status label for `'paused'` |

---

## Task 1: Create `ApprovalCard` component

**Files:**
- Create: `frontend/src/components/approval-card.tsx`

- [ ] **Step 1: Create the component file**

Create `frontend/src/components/approval-card.tsx` with this exact content:

```tsx
import { useState } from 'react'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { resumeIncident } from '@/lib/api'
import { useIncidentStore } from '@/stores/incident-store'

interface ApprovalCardProps {
  runId: string
}

export function ApprovalCard({ runId }: ApprovalCardProps) {
  const [submitting, setSubmitting] = useState(false)
  const [submittingAction, setSubmittingAction] = useState<'approved' | 'rejected' | null>(null)
  const [comments, setComments] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { setStatus } = useIncidentStore()

  async function handleDecision(decision: 'approved' | 'rejected') {
    setSubmitting(true)
    setSubmittingAction(decision)
    setError(null)
    try {
      await resumeIncident(runId, { status: decision, comments: comments || undefined })
      setStatus('running')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit decision')
      setSubmitting(false)
      setSubmittingAction(null)
    }
  }

  return (
    <div
      className="card"
      style={{
        border: '1px solid rgba(245,158,11,0.4)',
        background: 'var(--surface)',
        overflow: 'hidden',
        boxShadow: '0 0 20px rgba(245,158,11,0.06)',
        padding: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'rgba(245,158,11,0.07)',
          borderBottom: '1px solid rgba(245,158,11,0.2)',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--warn)',
            boxShadow: '0 0 8px var(--warn)',
            animation: 'pulse 1.5s ease-in-out infinite',
            flexShrink: 0,
          }}
        />
        <div>
          <div style={{ color: 'var(--warn)', fontWeight: 600, fontSize: 12, letterSpacing: '0.04em' }}>
            PAUSED — HUMAN APPROVAL REQUIRED
          </div>
          <div style={{ color: 'var(--ink-3)', fontSize: 11.5, marginTop: 2 }}>
            RCA complete. Review findings in the activity stream, then decide.
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '14px 18px' }}>
        {/* Comments */}
        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              display: 'block',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 5,
            }}
          >
            Comments (optional)
          </label>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            disabled={submitting}
            placeholder="Add context for the audit log..."
            rows={2}
            style={{
              width: '100%',
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              borderRadius: 6,
              padding: '8px 10px',
              fontSize: 12,
              color: 'var(--ink)',
              fontFamily: 'var(--font-ui)',
              resize: 'vertical',
              outline: 'none',
              opacity: submitting ? 0.5 : 1,
            }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => handleDecision('approved')}
            disabled={submitting}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              background: 'var(--positive-tint)',
              border: '1px solid var(--positive)',
              borderRadius: 8,
              padding: '9px 0',
              color: 'var(--positive)',
              fontWeight: 600,
              fontSize: 12,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting && submittingAction !== 'approved' ? 0.5 : 1,
            }}
          >
            {submitting && submittingAction === 'approved' ? (
              <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
            ) : (
              <CheckCircle size={13} />
            )}
            Approve Remediation
          </button>

          <button
            type="button"
            onClick={() => handleDecision('rejected')}
            disabled={submitting}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              background: 'var(--negative-tint)',
              border: '1px solid var(--negative)',
              borderRadius: 8,
              padding: '9px 0',
              color: 'var(--negative)',
              fontWeight: 600,
              fontSize: 12,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting && submittingAction !== 'rejected' ? 0.5 : 1,
            }}
          >
            {submitting && submittingAction === 'rejected' ? (
              <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
            ) : (
              <XCircle size={13} />
            )}
            Reject
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              marginTop: 10,
              background: 'var(--negative-tint)',
              border: '1px solid rgba(158,58,55,0.3)',
              borderRadius: 6,
              padding: '8px 10px',
              fontSize: 11.5,
              color: 'var(--negative)',
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc -b --noEmit
```

Expected: no errors. If you see `Cannot find module '@/lib/api'` — that alias is configured in `tsconfig.json` and works at runtime; the build step below will confirm it.

---

## Task 2: Integrate `ApprovalCard` into `run.tsx`

**Files:**
- Modify: `frontend/src/pages/run.tsx`

- [ ] **Step 1: Add the import**

In `frontend/src/pages/run.tsx`, add this import after the existing component imports (after the `TopologyGraph` import line):

```tsx
import { ApprovalCard } from '@/components/approval-card'
```

The existing imports block looks like:
```tsx
import { AgentFeed } from '@/components/agent-feed'
import { PhaseBar } from '@/components/phase-bar'
import { TopologyGraph } from '@/components/topology-graph'
import { useSSE } from '@/hooks/use-sse'
```

Add `ApprovalCard` after `TopologyGraph`:
```tsx
import { AgentFeed } from '@/components/agent-feed'
import { PhaseBar } from '@/components/phase-bar'
import { TopologyGraph } from '@/components/topology-graph'
import { ApprovalCard } from '@/components/approval-card'
import { useSSE } from '@/hooks/use-sse'
```

- [ ] **Step 2: Render `ApprovalCard` when paused**

In `run.tsx`, find the `<TopologyGraph ... />` line (around line 116):

```tsx
{/* Topology Graph */}
<TopologyGraph activeAgent={activeAgent} completedNodes={completedNodes} />
```

Add the `ApprovalCard` immediately after it:

```tsx
{/* Topology Graph */}
<TopologyGraph activeAgent={activeAgent} completedNodes={completedNodes} />

{/* Human approval gate — visible only when graph is paused */}
{status === 'paused' && runId && (
  <ApprovalCard runId={runId} />
)}
```

- [ ] **Step 3: Fix the status label for `'paused'`**

Find this block in `run.tsx` (around line 101–111):

```tsx
{isStreaming ? (
  <>
    <Loader2 style={{ color: 'var(--primary-accent)', width: 11, height: 11, animation: 'spin 0.8s linear infinite' }} />
    <span style={{ color: 'var(--primary-accent)', fontWeight: 500 }}>Agents working...</span>
  </>
) : status === 'completed' ? (
  <span style={{ color: 'var(--positive)', fontWeight: 500 }}>Completed</span>
) : (
  <span style={{ color: 'var(--negative)', fontWeight: 500 }}>Failed / Halted</span>
)}
```

Replace with:

```tsx
{isStreaming ? (
  <>
    <Loader2 style={{ color: 'var(--primary-accent)', width: 11, height: 11, animation: 'spin 0.8s linear infinite' }} />
    <span style={{ color: 'var(--primary-accent)', fontWeight: 500 }}>Agents working...</span>
  </>
) : status === 'completed' ? (
  <span style={{ color: 'var(--positive)', fontWeight: 500 }}>Completed</span>
) : status === 'paused' ? (
  <span style={{ color: 'var(--warn)', fontWeight: 500 }}>Awaiting approval...</span>
) : (
  <span style={{ color: 'var(--negative)', fontWeight: 500 }}>Failed / Halted</span>
)}
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npx tsc -b --noEmit
```

Expected: no errors.

---

## Task 3: Manual E2E verification + commit

- [ ] **Step 1: Start backend and frontend**

Terminal 1 (from project root):
```bash
uv run uvicorn api.app:app --host 127.0.0.1 --port 8004 --reload
```

Terminal 2:
```bash
cd frontend && npm run dev
```

Open http://localhost:5176

- [ ] **Step 2: Trigger a run and wait for the pause**

From the UI, start a `stripe_outage` scenario. Watch the Activity Stream panel.

When the run pauses you should see:
- Phase event `paused_for_approval` in the stream
- Status label changes to amber "Awaiting approval..." in the header
- `ApprovalCard` appears below the topology graph

- [ ] **Step 3: Test Approve flow**

Enter a comment like `"LGTM, proceed"`, click **Approve Remediation**.

Expected:
- Button shows spinner, both buttons disabled
- Card disappears
- Status label returns to "Agents working..."
- Activity stream continues with `Remediation Agent` events
- Run eventually completes with postmortem report

- [ ] **Step 4: Test Reject flow**

Start a new run. When it pauses, click **Reject** (no comment needed).

Expected:
- Card disappears
- Activity stream shows the run stopping (no remediation events)
- Status label shows "Failed / Halted"

- [ ] **Step 5: Test error handling**

Start a new run. When it pauses, open DevTools → Network → set to Offline. Click Approve.

Expected:
- Button shows spinner briefly
- Error message appears below the buttons: "Failed to fetch" (or similar network error)
- Both buttons re-enable

Set Network back to Online.

- [ ] **Step 6: Run backend tests to confirm no regressions**

```bash
uv run pytest tests/ -q
```

Expected: 7 passed.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/approval-card.tsx frontend/src/pages/run.tsx
git commit -m "feat: add frontend approval card for HITL pause gate

Shows Approve/Reject panel on run page when graph pauses before remediation.
Calls existing resumeIncident() API, local error/loading state, comments field.
Also fixes status label to show amber 'Awaiting approval...' when paused."
```
