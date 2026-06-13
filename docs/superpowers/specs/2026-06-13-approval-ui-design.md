# Approval UI — Frontend Design Spec

**Date:** 2026-06-13  
**Status:** Approved  

---

## Problem

The HITL (human-in-the-loop) approval gate exists in the backend — the LangGraph graph pauses before the `remediation` node and waits for a `POST /api/incident/{run_id}/resume` call. The frontend has no UI for this; reviewers must use `curl`. This makes the feature invisible during a live demo.

---

## Goal

Add an inline approval card to the run page that appears when the graph is paused, lets the reviewer approve or reject with an optional comment, and resumes the pipeline on submit.

---

## Scope

**In scope:**
- New `ApprovalCard` component rendered in `run.tsx`
- Approve and Reject actions (two buttons)
- Optional comments textarea
- Loading state during API call
- Inline error display on failure

**Out of scope:**
- `needs_changes` status (not needed for hackathon demo)
- Judge name field
- Approval history / audit log UI
- Postgres checkpointer or any backend changes

---

## Architecture

### Files changed

| File | Change |
|------|--------|
| `frontend/src/components/approval-card.tsx` | **New.** Self-contained approval component. |
| `frontend/src/pages/run.tsx` | **Modified.** Render `<ApprovalCard>` when paused. |

No store changes. No backend changes.

### Data flow

```
status === 'paused'
  → <ApprovalCard> renders
  → user fills optional comment, clicks Approve or Reject
  → resumeIncident(runId, { status: 'approved'|'rejected', comments })  [api.ts — already exists]
  → on success: setStatus('running')  [card disappears]
  → SSE drives remaining state: remediation → reporting → completed
  → on error: inline error message shown
```

---

## Component: `ApprovalCard`

**Props:**
```ts
interface ApprovalCardProps {
  runId: string
}
```

**Local state:**
- `submitting: boolean` — true while API call is in-flight
- `comments: string` — textarea value
- `error: string | null` — shown below buttons on failure

**Reads from store:** `setStatus` (to set `'running'` on success)

**Visual structure:**
- Amber-tinted card header with pulsing dot: "PAUSED — HUMAN APPROVAL REQUIRED"
- Subtext: "RCA complete. Review findings in the activity stream, then decide."
- Optional comments textarea (placeholder: "Add context for the audit log...")
- Two full-width buttons side by side:
  - **Approve Remediation** — green, calls `resumeIncident` with `status: 'approved'`
  - **Reject** — red, calls `resumeIncident` with `status: 'rejected'`
- The clicked button shows a spinner and is disabled; the other button is also disabled (no spinner)
- Error box (red tint, below buttons) shown when `error !== null`

**Styling:** Uses existing CSS variables (`--warn`, `--warn-tint`, `--positive`, `--positive-tint`, `--negative`, `--negative-tint`, `--line`, `--surface-2`, etc.) and the `.card` class pattern from the run page.

---

## Integration in `run.tsx`

Add `status` to the destructured store values (already present). Insert between `<TopologyGraph>` and the report section:

```tsx
{status === 'paused' && runId && (
  <ApprovalCard runId={runId} />
)}
```

The existing status display line (`"Agents working..." / "Completed" / "Failed / Halted"`) must handle `status === 'paused'` — add an amber "Awaiting approval..." branch before the failed/halted fallback.

**Note on PhaseBar:** `paused_for_approval` is not in the `PHASES` array in `phase-bar.tsx`, so `currentIndex` resolves to -1 and no phase pill lights up while paused. This is acceptable — the amber status label and the ApprovalCard together make the pause state clear. Do not modify `PhaseBar` as part of this feature.

---

## Error handling

- Network / non-2xx response from `/resume`: catch the error, set `error` state, re-enable buttons.
- No retry logic — reviewer can simply click again.
- No timeout — the graph waits indefinitely for the resume call.

---

## Testing

Manual E2E:
1. Start a run, wait for `paused_for_approval` phase in the activity stream.
2. Approval card appears below topology graph.
3. Enter a comment, click Approve — card disappears, pipeline continues to remediation.
4. Repeat with Reject — pipeline halts.
5. Simulate network error (DevTools offline) — error message appears, buttons re-enable.
