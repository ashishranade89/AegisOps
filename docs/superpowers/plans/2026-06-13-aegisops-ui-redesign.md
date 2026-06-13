# AegisOps UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Agent Swarm cockpit as a Split-Brain layout, enforce typography rules across the landing page, and unify the theming system so dark/light mode works consistently across all views.

**Architecture:** Extract the Agent Swarm tab from `home.tsx` into a new `AgentSwarmCockpit.tsx` component using a 220px left rail (stepper + vendor health) / flex-1 main area / 44px bottom strip grid. Simultaneously migrate `home.tsx` from inline Tailwind dark-mode conditionals to CSS variables, eliminating the dual-theme bug. `RootCauseGraph` loses its `isDarkMode` prop and responds to the `data-theme` attribute instead.

**Tech Stack:** React 18, TypeScript, Vite, TailwindCSS v4, Lucide React, Zustand (`useIncidentStore`), CSS custom properties

**Spec:** `docs/superpowers/specs/2026-06-13-aegisops-ui-redesign.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `frontend/src/index.css` | Update dark `--bg` from `#0B1726` to `#02040a` |
| Create | `frontend/src/components/vigilant/AgentSwarmCockpit.tsx` | Full Split-Brain cockpit (left rail, main area, bottom strip, sub-components) |
| Modify | `frontend/src/components/vigilant/RootCauseGraph.tsx` | Remove `isDarkMode` prop, use CSS variables; add glow/ring animation on error origin node |
| Modify | `frontend/src/pages/home.tsx` | (a) Replace `isDarkMode ? "cls1" : "cls2"` with CSS variable classes; (b) swap Agent Swarm tab content for `<AgentSwarmCockpit />`; (c) remove `font-mono` from vendor strip / CTAs / eyebrows |

Dev server: `cd frontend && npm run dev` (runs on http://localhost:5173 by default)
Type check: `cd frontend && npx tsc --noEmit`

---

## Task 1: Patch dark mode base color in index.css

**Files:**
- Modify: `frontend/src/index.css:46-67`

- [ ] **Step 1.1: Change `--bg` dark value**

In `frontend/src/index.css`, inside the `[data-theme="dark"]` block (line ~47), change:

```css
/* Before */
[data-theme="dark"] {
  --bg: #0B1726;           /* deep navy/black */
  --surface: #11243A;      /* slate surface */
  --surface-2: #0E1E32;
  --line: #1F3450;
  --line-strong: #2B466A;
```

```css
/* After */
[data-theme="dark"] {
  --bg: #02040a;           /* midnight — matches AegisOps brand */
  --surface: #060810;      /* dark rail surface */
  --surface-2: #0d1117;
  --line: #0f172a;
  --line-strong: #1e293b;
```

- [ ] **Step 1.2: Verify in browser**

Run `cd frontend && npm run dev`. Open http://localhost:5173. Toggle to dark mode — page background should be `#02040a` (near-black, not navy-tinted). Toggle back to light — warm off-white `#F6F4EF` unchanged.

- [ ] **Step 1.3: Commit**

```bash
cd frontend && git add src/index.css
git commit -m "style: update dark mode base bg to #02040a"
```

---

## Task 2: Create AgentSwarmCockpit.tsx — grid skeleton + types

**Files:**
- Create: `frontend/src/components/vigilant/AgentSwarmCockpit.tsx`

This task creates the file with the outer grid, types, and empty slot placeholders. Subsequent tasks fill each slot.

- [ ] **Step 2.1: Create the file**

Create `frontend/src/components/vigilant/AgentSwarmCockpit.tsx` with this content:

```tsx
import { ScenarioInfo } from '@/lib/api'
import { IncidentState } from '@/types/vigilant'
import { useIncidentStore } from '@/stores/incident-store'

// ─── Types ────────────────────────────────────────────────────────────────────

export type StepState = 'idle' | 'active' | 'done'
export type TelemetryMode = 'standard' | 'preset' | 'upload'

export interface AgentSwarmCockpitProps {
  // Scenario selection
  scenarios: ScenarioInfo[]
  selectedScenarioType: string
  onScenarioChange: (type: string) => void
  telemetryMode: TelemetryMode
  onTelemetryModeChange: (mode: TelemetryMode) => void
  // Launch
  onLaunch: () => void
  loading: boolean
  loadingAnalysis: boolean
  cockpitLocked: boolean
  error: string | null
  // Preview incident data (pre-launch mock; post-launch ignored — store takes over)
  previewIncident: IncidentState
  // Mitigation
  onApplyMitigation: () => void
  isMitigating: boolean
  mitigationLog: string[]
  // Confidence popover
  showConfidenceDetail: boolean
  onToggleConfidenceDetail: () => void
  // Copy state for remediation code
  copyState: boolean
  onCopyCode: () => void
}

// ─── Step derivation ──────────────────────────────────────────────────────────

function deriveActiveStep(
  status: string,
  loadingAnalysis: boolean,
  report: string,
  isMitigating: boolean,
): number {
  if (isMitigating) return 5
  if (report) return 4
  if (status === 'running' || status === 'paused') return 3
  if (loadingAnalysis || status === 'pending') return 2
  return 1
}

// ─── Cockpit ─────────────────────────────────────────────────────────────────

export function AgentSwarmCockpit(props: AgentSwarmCockpitProps) {
  const { status, report } = useIncidentStore()

  const activeStep = deriveActiveStep(
    status,
    props.loadingAnalysis,
    report,
    props.isMitigating,
  )

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '220px 1fr',
        gridTemplateRows: '1fr 44px',
        height: 'calc(100vh - 48px)', // full height minus topnav
        background: 'var(--bg)',
        overflow: 'hidden',
      }}
    >
      {/* Left Rail — spans both rows */}
      <div style={{ gridRow: '1 / 3' }}>
        {/* TODO Task 3 */}
      </div>

      {/* Main Content Area */}
      <div style={{ overflow: 'hidden', position: 'relative' }}>
        {/* TODO Task 4 (pre-launch) / Task 5 overlay (analysis) */}
      </div>

      {/* Bottom Strip */}
      <div>
        {/* TODO Task 6 */}
      </div>
    </div>
  )
}
```

- [ ] **Step 2.2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors (file compiles; TODO slots are empty divs).

- [ ] **Step 2.3: Commit**

```bash
git add frontend/src/components/vigilant/AgentSwarmCockpit.tsx
git commit -m "feat: scaffold AgentSwarmCockpit grid skeleton"
```

---

## Task 3: Implement Left Rail — StepItem and VendorRow

**Files:**
- Modify: `frontend/src/components/vigilant/AgentSwarmCockpit.tsx`

- [ ] **Step 3.1: Add StepItem and VendorRow components + LeftRail**

Add the following above the `AgentSwarmCockpit` function (after the imports):

```tsx
// ─── Sub-components ───────────────────────────────────────────────────────────

interface StepItemProps {
  num: number
  title: string
  subtitle: string
  state: StepState
  isLast?: boolean
}

function StepItem({ num, title, subtitle, state, isLast }: StepItemProps) {
  const numStyles: Record<StepState, React.CSSProperties> = {
    done: { background: 'rgba(16,185,129,.15)', color: '#10b981' },
    active: { background: 'rgba(59,130,246,.18)', color: '#60a5fa' },
    idle: { background: '#0f172a', color: '#334155' },
  }
  const titleColor: Record<StepState, string> = {
    done: '#10b981',
    active: '#93c5fd',
    idle: '#334155',
  }
  const itemBg: Record<StepState, React.CSSProperties> = {
    done: { background: 'rgba(16,185,129,.04)' },
    active: { background: 'rgba(59,130,246,.07)', border: '1px solid rgba(59,130,246,.12)' },
    idle: {},
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          padding: '7px 8px',
          borderRadius: 6,
          ...itemBg[state],
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 8,
            fontWeight: 700,
            flexShrink: 0,
            marginTop: 1,
            ...numStyles[state],
          }}
        >
          {state === 'done' ? '✓' : num}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: titleColor[state], lineHeight: 1.2 }}>
            {title}
          </div>
          <div style={{ fontSize: 8, color: '#475569', marginTop: 1, lineHeight: 1.3 }}>
            {subtitle}
          </div>
        </div>
      </div>
      {!isLast && (
        <div
          style={{
            width: 1,
            height: 8,
            background: state === 'done' ? 'rgba(16,185,129,.2)' : '#0f172a',
            marginLeft: 19,
          }}
        />
      )}
    </>
  )
}

interface VendorRowProps {
  name: string
  status: 'operational' | 'degraded' | 'outage'
}

function VendorRow({ name, status }: VendorRowProps) {
  const statusColor = { operational: '#34d399', degraded: '#fbbf24', outage: '#f87171' }
  const statusLabel = { operational: 'OK', degraded: 'Degraded', outage: 'Outage' }
  const col = statusColor[status]
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px' }}>
      <span style={{ fontSize: 9.5, fontWeight: 600, color: '#64748b' }}>{name}</span>
      <span style={{ fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3, color: col }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: col, display: 'inline-block' }} />
        {statusLabel[status]}
      </span>
    </div>
  )
}

interface LeftRailProps {
  activeStep: number
  vendorHealth: IncidentState['vendorHealth']
}

const STEPS = [
  { num: 1, title: 'Select Scenario', subtitle: 'Choose incident type & telemetry mode' },
  { num: 2, title: 'Launch Swarm', subtitle: 'Start autonomous agent cluster' },
  { num: 3, title: 'Agent Analysis', subtitle: 'Triage · Correlate · Root Cause' },
  { num: 4, title: 'RCA Report', subtitle: 'Root cause summary & confidence' },
  { num: 5, title: 'Mitigation', subtitle: 'Apply remediation patch' },
]

function LeftRail({ activeStep, vendorHealth }: LeftRailProps) {
  return (
    <div
      style={{
        background: '#060810',
        borderRight: '1px solid #0f172a',
        padding: '16px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div style={{ fontSize: 8.5, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6, padding: '0 4px' }}>
        Investigation Steps
      </div>
      {STEPS.map((s, i) => {
        const state: StepState =
          s.num < activeStep ? 'done' : s.num === activeStep ? 'active' : 'idle'
        return <StepItem key={s.num} {...s} state={state} isLast={i === STEPS.length - 1} />
      })}

      {/* Vendor health pushed to bottom */}
      <div style={{ marginTop: 'auto', borderTop: '1px solid #0f172a', paddingTop: 10 }}>
        <div style={{ fontSize: 8.5, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6, padding: '0 4px' }}>
          Vendor Health
        </div>
        {vendorHealth.map((v) => (
          <VendorRow key={v.name} name={v.name} status={v.status} />
        ))}
      </div>
    </div>
  )
}
```

Then replace the `{/* TODO Task 3 */}` placeholder in `AgentSwarmCockpit` with:

```tsx
<LeftRail activeStep={activeStep} vendorHealth={props.previewIncident.vendorHealth} />
```

- [ ] **Step 3.2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3.3: Commit**

```bash
git add frontend/src/components/vigilant/AgentSwarmCockpit.tsx
git commit -m "feat: add LeftRail with StepItem and VendorRow to AgentSwarmCockpit"
```

---

## Task 4: Implement ScenarioPicker (pre-launch main area)

**Files:**
- Modify: `frontend/src/components/vigilant/AgentSwarmCockpit.tsx`

This task adds the top-half scenario picker and the bottom-half preview graph for Steps 1–2.

- [ ] **Step 4.1: Add ScenarioPicker component**

Add this component above `AgentSwarmCockpit`:

```tsx
import { Play } from 'lucide-react'
import RootCauseGraph from './RootCauseGraph'

interface ScenarioPickerProps {
  scenarios: ScenarioInfo[]
  selectedScenarioType: string
  onScenarioChange: (type: string) => void
  telemetryMode: TelemetryMode
  onTelemetryModeChange: (mode: TelemetryMode) => void
  onLaunch: () => void
  loading: boolean
  loadingAnalysis: boolean
  cockpitLocked: boolean
  previewIncident: IncidentState
}

function ScenarioPicker({
  scenarios,
  selectedScenarioType,
  onScenarioChange,
  telemetryMode,
  onTelemetryModeChange,
  onLaunch,
  loading,
  loadingAnalysis,
  cockpitLocked,
  previewIncident,
}: ScenarioPickerProps) {
  const MODES: { value: TelemetryMode; label: string }[] = [
    { value: 'standard', label: 'Standard' },
    { value: 'preset', label: 'Preset' },
    { value: 'upload', label: 'Upload JSON' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', height: '100%', gap: 10, padding: 16, background: 'var(--bg)' }}>
      {/* Top: scenario picker */}
      <div
        style={{
          background: '#060810',
          border: '1px solid #0f172a',
          borderRadius: 8,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Select Incident Scenario
        </div>

        {/* Scenario cards */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          {scenarios.map((s) => {
            const isSelected = s.scenario_type === selectedScenarioType
            return (
              <button
                key={s.scenario_type}
                onClick={() => onScenarioChange(s.scenario_type)}
                style={{
                  flex: '1 0 120px',
                  background: isSelected ? 'rgba(29,78,216,.06)' : '#02040a',
                  border: `1px solid ${isSelected ? '#1d4ed8' : '#1e293b'}`,
                  borderRadius: 6,
                  padding: '8px 10px',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: '#cbd5e1' }}>{s.name}</div>
                <div style={{ fontSize: 8, color: '#475569', marginTop: 1 }}>{s.description.slice(0, 48)}</div>
              </button>
            )
          })}
        </div>

        {/* Footer: telemetry mode + launch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 9, color: '#475569' }}>Telemetry Mode:</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => onTelemetryModeChange(m.value)}
                style={{
                  fontSize: 8.5,
                  padding: '2px 8px',
                  borderRadius: 10,
                  border: `1px solid ${telemetryMode === m.value ? 'rgba(29,78,216,.25)' : '#1e293b'}`,
                  background: telemetryMode === m.value ? 'rgba(29,78,216,.1)' : 'transparent',
                  color: telemetryMode === m.value ? '#60a5fa' : '#64748b',
                  cursor: 'pointer',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            onClick={onLaunch}
            disabled={loading || loadingAnalysis || cockpitLocked}
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 16px',
              borderRadius: 6,
              background: cockpitLocked ? '#0f172a' : '#1d4ed8',
              color: cockpitLocked ? '#334155' : '#fff',
              fontSize: 10,
              fontWeight: 700,
              border: 'none',
              cursor: cockpitLocked ? 'not-allowed' : 'pointer',
            }}
          >
            <Play size={10} />
            {loading || loadingAnalysis ? 'Launching…' : 'Launch Swarm'}
          </button>
        </div>
      </div>

      {/* Bottom: preview graph */}
      <div style={{ position: 'relative', background: '#030509', border: '1px solid #0f172a', borderRadius: 8, overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 10,
            zIndex: 10,
            fontSize: 8,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 10,
            background: 'rgba(245,158,11,.1)',
            color: '#fbbf24',
            border: '1px solid rgba(245,158,11,.2)',
            textTransform: 'uppercase',
            letterSpacing: '.06em',
          }}
        >
          Preview — Mock Topology
        </div>
        <RootCauseGraph nodes={previewIncident.graphNodes} links={previewIncident.graphLinks} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4.2: Wire ScenarioPicker into main area (Steps 1–2)**

Replace the `{/* TODO Task 4 ... */}` placeholder in `AgentSwarmCockpit`'s main area div with:

```tsx
{activeStep <= 2 && (
  <ScenarioPicker
    scenarios={props.scenarios}
    selectedScenarioType={props.selectedScenarioType}
    onScenarioChange={props.onScenarioChange}
    telemetryMode={props.telemetryMode}
    onTelemetryModeChange={props.onTelemetryModeChange}
    onLaunch={props.onLaunch}
    loading={props.loading}
    loadingAnalysis={props.loadingAnalysis}
    cockpitLocked={props.cockpitLocked}
    previewIncident={props.previewIncident}
  />
)}
{activeStep >= 3 && (
  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
    <RootCauseGraph nodes={props.previewIncident.graphNodes} links={props.previewIncident.graphLinks} />
    {/* TODO Task 5: SwarmOverlay */}
  </div>
)}
```

- [ ] **Step 4.3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4.4: Commit**

```bash
git add frontend/src/components/vigilant/AgentSwarmCockpit.tsx
git commit -m "feat: add ScenarioPicker pre-launch main area to AgentSwarmCockpit"
```

---

## Task 5: Implement SwarmOverlay panel

**Files:**
- Modify: `frontend/src/components/vigilant/AgentSwarmCockpit.tsx`

- [ ] **Step 5.1: Add SwarmOverlay component**

Add above `AgentSwarmCockpit`:

```tsx
import { useIncidentStore } from '@/stores/incident-store'

// Agent display names mapped from store's activeAgent / completedNodes keys
const SWARM_AGENTS = [
  { key: 'triage',     label: 'Triage Agent' },
  { key: 'rag_search', label: 'RAG Cache Lookup' },
  { key: 'rca',        label: 'Root Cause Analyzer' },
  { key: 'browser',    label: 'Browser Scraper' },
  { key: 'remediation',label: 'Remediation Agent' },
  { key: 'reporter',   label: 'Incident Reporter' },
]

function SwarmOverlay() {
  const { activeAgent, completedNodes, totalCostUsd, events } = useIncidentStore()

  // Derive elapsed seconds per completed agent from events
  const agentTimes: Record<string, number> = {}
  const starts: Record<string, number> = {}
  events.forEach((e) => {
    if (e.type === 'agent_start' && e.agent_name) starts[e.agent_name] = e.timestamp
    if (e.type === 'agent_end' && e.agent_name && starts[e.agent_name]) {
      agentTimes[e.agent_name] = Math.round((e.timestamp - starts[e.agent_name]) / 1000)
    }
  })

  // Map node key back to display name for activeAgent comparison
  const NODE_TO_AGENT: Record<string, string> = {
    triage: 'Triage Agent',
    rag_search: 'RAG Cache Lookup',
    rca: 'Root Cause Analyzer',
    browser: 'Browser Scraper',
    remediation: 'Remediation Agent',
    reporter: 'Incident Reporter',
  }

  // Confidence from last cost_update event (approximation: use completedNodes count)
  const confidence = completedNodes.length >= 4 ? 94 : completedNodes.length >= 2 ? 72 : null

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        width: 200,
        background: 'rgba(6,8,16,.92)',
        border: '1px solid #1e293b',
        borderRadius: 8,
        padding: '10px 12px',
        backdropFilter: 'blur(8px)',
        zIndex: 20,
      }}
    >
      <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
        AI Swarm Reasoning
      </div>

      {SWARM_AGENTS.map((a) => {
        const isDone = completedNodes.includes(a.key)
        const isActive = activeAgent === NODE_TO_AGENT[a.key] || activeAgent === a.label
        const elapsed = agentTimes[a.label] ?? agentTimes[NODE_TO_AGENT[a.key]]

        return (
          <div
            key={a.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '4px 0',
              borderBottom: '1px solid rgba(255,255,255,.03)',
            }}
          >
            {/* Status icon */}
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 8,
                flexShrink: 0,
                background: isDone
                  ? 'rgba(16,185,129,.15)'
                  : isActive
                    ? 'rgba(245,158,11,.12)'
                    : '#0f172a',
                color: isDone ? '#10b981' : isActive ? '#f59e0b' : '#334155',
              }}
            >
              {isDone ? '✓' : isActive ? (
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    border: '1.5px solid rgba(245,158,11,.3)',
                    borderTopColor: '#f59e0b',
                    borderRadius: '50%',
                    animation: 'spin .8s linear infinite',
                  }}
                />
              ) : '○'}
            </div>

            {/* Name */}
            <div style={{ fontSize: 9.5, fontWeight: 600, flex: 1, color: isDone ? '#94a3b8' : isActive ? '#e2e8f0' : '#334155' }}>
              {a.label}
            </div>

            {/* Time */}
            <div style={{ fontSize: 7.5, color: isDone ? '#475569' : isActive ? '#f59e0b' : '#334155', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
              {isDone && elapsed != null ? `${elapsed}s` : isActive ? '…' : '—'}
            </div>
          </div>
        )
      })}

      {/* Confidence */}
      <div style={{ borderTop: '1px solid #0f172a', marginTop: 8, paddingTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 8, color: '#475569' }}>Confidence</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#10b981', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
            {confidence != null ? `${confidence}%` : '—'}
          </span>
        </div>
        {totalCostUsd > 0 && (
          <div style={{ fontSize: 7.5, color: '#334155', marginTop: 2, fontFamily: 'monospace' }}>
            ${totalCostUsd.toFixed(4)} used
          </div>
        )}
      </div>

      {/* CSS for spin animation */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
```

- [ ] **Step 5.2: Wire SwarmOverlay into the analysis state (Steps 3+)**

Replace the `{/* TODO Task 5: SwarmOverlay */}` comment with:

```tsx
<SwarmOverlay />
```

- [ ] **Step 5.3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5.4: Commit**

```bash
git add frontend/src/components/vigilant/AgentSwarmCockpit.tsx
git commit -m "feat: add SwarmOverlay panel with live agent status to AgentSwarmCockpit"
```

---

## Task 6: Implement Bottom Strip

**Files:**
- Modify: `frontend/src/components/vigilant/AgentSwarmCockpit.tsx`

- [ ] **Step 6.1: Add BottomStrip component**

Add above `AgentSwarmCockpit`:

```tsx
interface BottomStripProps {
  activeStep: number
  onApplyMitigation: () => void
  isMitigating: boolean
  mitigationLog: string[]
  showConfidenceDetail: boolean
  onToggleConfidenceDetail: () => void
  onCopyCode: () => void
  copyState: boolean
  previewIncident: IncidentState
}

function AgentBadge({ label, state }: { label: string; state: 'idle' | 'active' | 'done' }) {
  const styles = {
    idle: { background: 'rgba(255,255,255,.03)', color: '#334155', border: '1px solid #0f172a' },
    done: { background: 'rgba(16,185,129,.08)', color: '#34d399', border: '1px solid rgba(16,185,129,.15)' },
    active: { background: 'rgba(245,158,11,.08)', color: '#fbbf24', border: '1px solid rgba(245,158,11,.15)' },
  }
  return (
    <div
      style={{
        fontSize: 8.5,
        padding: '2px 8px',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        ...styles[state],
      }}
    >
      {state === 'done' ? '✓ ' : state === 'active' ? '⟳ ' : '○ '}
      {label}
    </div>
  )
}

function BottomStrip({
  activeStep,
  onApplyMitigation,
  isMitigating,
  previewIncident,
}: BottomStripProps) {
  const { activeAgent, completedNodes, report } = useIncidentStore()

  const agentBadgeState = (key: string): 'idle' | 'active' | 'done' => {
    if (completedNodes.includes(key)) return 'done'
    if (activeAgent && activeAgent.toLowerCase().includes(key.replace('_', ' '))) return 'active'
    return 'idle'
  }

  const canApply = !!report && !isMitigating
  const confidence = completedNodes.length >= 4 ? 94 : null

  return (
    <div
      style={{
        background: '#060810',
        borderTop: '1px solid #0f172a',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 6,
        overflow: 'hidden',
      }}
    >
      <AgentBadge label="Triage" state={agentBadgeState('triage')} />
      <AgentBadge label="RAG Lookup" state={agentBadgeState('rag_search')} />
      <AgentBadge label="Root Cause" state={agentBadgeState('rca')} />
      <AgentBadge label="Remediation" state={agentBadgeState('remediation')} />

      <div style={{ flex: 1 }} />

      {confidence != null && (
        <div
          style={{
            fontSize: 8.5,
            color: '#10b981',
            padding: '2px 8px',
            border: '1px solid rgba(16,185,129,.15)',
            borderRadius: 10,
            background: 'rgba(16,185,129,.06)',
            fontVariantNumeric: 'tabular-nums',
            fontFamily: 'monospace',
          }}
        >
          {confidence}% confidence
        </div>
      )}

      <button
        onClick={onApplyMitigation}
        disabled={!canApply}
        style={{
          fontSize: 9,
          fontWeight: 700,
          padding: '5px 14px',
          borderRadius: 5,
          background: canApply ? '#1d4ed8' : '#0f172a',
          color: canApply ? '#fff' : '#334155',
          border: `1px solid ${canApply ? '#1d4ed8' : '#1e293b'}`,
          cursor: canApply ? 'pointer' : 'not-allowed',
        }}
      >
        {isMitigating ? 'Applying…' : 'Apply Mitigation'}
      </button>
    </div>
  )
}
```

- [ ] **Step 6.2: Wire BottomStrip into cockpit**

Replace the Bottom Strip `{/* TODO Task 6 */}` placeholder with:

```tsx
<BottomStrip
  activeStep={activeStep}
  onApplyMitigation={props.onApplyMitigation}
  isMitigating={props.isMitigating}
  mitigationLog={props.mitigationLog}
  showConfidenceDetail={props.showConfidenceDetail}
  onToggleConfidenceDetail={props.onToggleConfidenceDetail}
  onCopyCode={props.onCopyCode}
  copyState={props.copyState}
  previewIncident={props.previewIncident}
/>
```

- [ ] **Step 6.3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 6.4: Commit**

```bash
git add frontend/src/components/vigilant/AgentSwarmCockpit.tsx
git commit -m "feat: add BottomStrip with AgentBadge pills and Apply Mitigation CTA"
```

---

## Task 7: Update RootCauseGraph — remove isDarkMode, add glow animation

**Files:**
- Modify: `frontend/src/components/vigilant/RootCauseGraph.tsx`

The graph currently takes an `isDarkMode` prop. After theme unification, it should respond to `data-theme` via CSS variables. This task also adds the red glow ring animation on error-origin nodes.

- [ ] **Step 7.1: Remove isDarkMode prop, replace with CSS variable classes**

In `frontend/src/components/vigilant/RootCauseGraph.tsx`:

**Change the interface and function signature** (lines 5–11):

```tsx
// Before
interface RootCauseGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
  isDarkMode?: boolean;
}

export default function RootCauseGraph({ nodes, links, isDarkMode = true }: RootCauseGraphProps) {
```

```tsx
// After
interface RootCauseGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
}

export default function RootCauseGraph({ nodes, links }: RootCauseGraphProps) {
```

**Replace the outer div className** (line ~49):

```tsx
// Before
<div className={`relative w-full h-[320px] md:h-[400px] rounded-xl overflow-hidden flex flex-col justify-between transition-colors ${
  isDarkMode 
    ? "bg-slate-950/20 border border-white/5" 
    : "bg-[#f8fafc] border border-slate-200 shadow-inner"
}`}>
```

```tsx
// After
<div className="relative w-full h-full rounded-xl overflow-hidden flex flex-col justify-between transition-colors bg-[var(--surface-2)] border border-[var(--line)]">
```

**Remove the isDarkMode ambient light block** (lines ~55–62 — the `{isDarkMode && (...)}` div). Replace with a CSS-variable version:

```tsx
// Remove the isDarkMode conditional entirely and replace with:
<div className="absolute inset-0 pointer-events-none z-0">
  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-500/10 blur-[90px] animate-pulse rounded-full" />
  {nodes.some((n) => n.status === "error") && (
    <div className="absolute top-1/3 left-1/3 w-32 h-32 bg-red-500/10 blur-[80px] animate-pulse rounded-full" />
  )}
</div>
```

**Update the arrow marker color** (line ~73) — remove isDarkMode conditional:

```tsx
// Before
<path d="M 0 0 L 10 5 L 0 10 z" fill={isDarkMode ? "rgba(255,255,255,0.15)" : "rgba(100,116,139,0.3)"} />
```

```tsx
// After
<path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,255,255,0.15)" />
```

**Update node statusColor logic** — remove isDarkMode branches. Replace the whole `let statusColor` block (lines ~133–152):

```tsx
let statusColor = "border-sky-500/40 text-sky-400 bg-[var(--surface-2)] hover:border-sky-400"
let ringColor = ""

if (isError) {
  statusColor = "border-red-500/80 text-rose-400 bg-[var(--surface-2)] shadow-[0_0_15px_rgba(239,68,68,0.2)] hover:border-red-400"
  ringColor = "animate-ping absolute inset-0 rounded-lg bg-red-500/20 pointer-events-none"
} else if (isActive) {
  statusColor = "border-amber-500/80 text-amber-400 bg-[var(--surface-2)] hover:border-amber-400"
  ringColor = "animate-pulse absolute inset-0 rounded-lg bg-amber-500/25 pointer-events-none"
} else if (isStandby) {
  statusColor = "border-[var(--line-strong)] text-[var(--ink-3)] bg-[var(--surface-2)] hover:border-[var(--ink-3)]"
}
```

**Add the pulsing ring SVG overlay for the error origin node** — this goes inside the SVG `<defs>` section, just before the links map:

```tsx
{/* Rotating ring on error origin node */}
{nodes
  .filter((n) => n.status === 'error')
  .slice(0, 1)
  .map((n) => {
    const pos = nodePositions[n.id]
    if (!pos) return null
    return (
      <g key={`ring-${n.id}`}>
        <circle
          cx={`${pos.x}%`}
          cy={`${pos.y}%`}
          r="32"
          fill="none"
          stroke="#ef4444"
          strokeWidth="1"
          strokeDasharray="5,4"
          opacity=".25"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`0 ${pos.x * 4} ${pos.y * 4}`}
            to={`360 ${pos.x * 4} ${pos.y * 4}`}
            dur="6s"
            repeatCount="indefinite"
          />
        </circle>
      </g>
    )
  })}
```

Note: the `from`/`to` values use raw pixel coords. Since the SVG uses `width="100%" height="100%"` without a fixed viewBox, use a fallback `viewBox="0 0 400 320"`. Add `viewBox="0 0 400 320"` to the `<svg>` element and change the ring's `cx`/`cy` to use percentage-based values with `calcMode`:

```tsx
// Simpler approach: use a fixed viewBox on the SVG
// In the SVG element add: viewBox="0 0 400 320" preserveAspectRatio="none"
// And for the ring, compute from percentages:
<circle
  cx={`${pos.x * 4}`}   // pos.x is 0–100, viewBox is 400 wide
  cy={`${pos.y * 3.2}`} // pos.y is 0–100, viewBox is 320 tall
  r="18"
  fill="none"
  stroke="#ef4444"
  strokeWidth="1.5"
  strokeDasharray="5,4"
  opacity=".3"
>
  <animateTransform
    attributeName="transform"
    type="rotate"
    from={`0 ${pos.x * 4} ${pos.y * 3.2}`}
    to={`360 ${pos.x * 4} ${pos.y * 3.2}`}
    dur="6s"
    repeatCount="indefinite"
  />
</circle>
```

**Update the HUD overlay and tooltip** — replace remaining `isDarkMode` ternaries with CSS variable equivalents:

```tsx
// Graph Status HUD (line ~189)
// Before: isDarkMode ? "bg-gradient-to-b from-slate-950/60..." : "bg-slate-100/70..."
// After:
className="p-3 w-full flex justify-between items-center z-30 pointer-events-none select-none border-b bg-[var(--surface-2)]/60 border-[var(--line)] transition-colors"

// "Topology Realtime Map" span — remove isDarkMode ternary:
className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-3)]"

// Tooltip container (line ~213)
className="p-3 w-full z-30 pointer-events-auto border-t transition-all min-h-[50px] flex items-center justify-between bg-[var(--surface-2)] border-[var(--line)] text-[var(--ink-3)]"

// Node label in tooltip — remove isDarkMode:
className={`font-sans font-bold text-[var(--ink)]`}

// Stat values in tooltip — keep font-mono (these are numeric stats):
className={`font-mono font-bold text-[var(--ink-2)]`}
```

- [ ] **Step 7.2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 7.3: Visually verify graph in browser**

Open http://localhost:5173, go to Agent Swarm tab. Preview graph should render. Dark mode: graph background uses `var(--surface-2)`. Light mode: same variable resolves to `#FBFAF6`. Error nodes should show a rotating dashed ring.

- [ ] **Step 7.4: Commit**

```bash
git add frontend/src/components/vigilant/RootCauseGraph.tsx
git commit -m "refactor: remove isDarkMode from RootCauseGraph, use CSS variables; add error origin ring animation"
```

---

## Task 8: Integrate AgentSwarmCockpit into home.tsx

**Files:**
- Modify: `frontend/src/pages/home.tsx`

The Agent Swarm tab content currently lives in `home.tsx` inside the `view === "app" && activeAppTab === "sandbox"` conditional. This task replaces that block with `<AgentSwarmCockpit />`.

- [ ] **Step 8.1: Add import**

At the top of `frontend/src/pages/home.tsx`, add:

```tsx
import { AgentSwarmCockpit } from '@/components/vigilant/AgentSwarmCockpit'
```

- [ ] **Step 8.2: Find the Agent Swarm tab content block**

Search for: `activeAppTab === "sandbox"` — this is the conditional wrapping the entire sandbox tab JSX. It looks like:

```tsx
{view === "app" && activeAppTab === "sandbox" && (
  <div ...>
    {/* stepper, agent reasoning, RootCauseGraph, VendorMonitor, etc. */}
  </div>
)}
```

- [ ] **Step 8.3: Replace with AgentSwarmCockpit**

Replace the entire `{view === "app" && activeAppTab === "sandbox" && (...)}` block with:

```tsx
{view === "app" && activeAppTab === "sandbox" && (
  <AgentSwarmCockpit
    scenarios={scenarios}
    selectedScenarioType={selectedScenarioType}
    onScenarioChange={handleScenarioChange}
    telemetryMode={telemetryMode}
    onTelemetryModeChange={(m) => setTelemetryMode(m)}
    onLaunch={handleStart}
    loading={loading}
    loadingAnalysis={loadingAnalysis}
    cockpitLocked={cockpitLocked}
    error={error}
    previewIncident={previewIncident}
    onApplyMitigation={handleApplyMitigation}
    isMitigating={isMitigating}
    mitigationLog={mitigationLog}
    showConfidenceDetail={showConfidenceDetail}
    onToggleConfidenceDetail={() => setShowConfidenceDetail((v) => !v)}
    copyState={copystate}
    onCopyCode={handleCopyCode}
  />
)}
```

- [ ] **Step 8.4: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 8.5: Smoke test in browser**

Open http://localhost:5173. Click "Agent Swarm" tab. You should see the Split-Brain cockpit: left rail with 5 steps, scenario picker in the top half, preview graph in the bottom half, bottom strip with idle agent badges.

- [ ] **Step 8.6: Commit**

```bash
git add frontend/src/pages/home.tsx
git commit -m "feat: replace home.tsx sandbox tab with AgentSwarmCockpit"
```

---

## Task 9: Remove isDarkMode inline conditionals from home.tsx

**Files:**
- Modify: `frontend/src/pages/home.tsx`

**Context:** `home.tsx` has hundreds of `isDarkMode ? "tailwind-dark" : "tailwind-light"` class strings. This task converts them to CSS-variable-aware classes. The `isDarkMode` *state* and the `useEffect` that calls `document.documentElement.setAttribute('data-theme', ...)` must be **kept** — they're the correct mechanism. Only the JSX class conditionals are replaced.

**Pattern:** `isDarkMode ? "bg-[#02040a]" : "bg-slate-50"` → `"bg-[var(--bg)]"`

- [ ] **Step 9.1: Replace the root wrapper class**

Find the outermost `<div>` in the `return` statement (around line 614):

```tsx
// Before
<div className={`w-full h-full overflow-y-auto font-sans transition-colors duration-300 ${
  isDarkMode ? "bg-[#02040a] text-slate-100" : "bg-slate-50 text-slate-900"
}`}>
```

```tsx
// After
<div className="w-full h-full overflow-y-auto font-sans transition-colors duration-300 bg-[var(--bg)] text-[var(--ink)]">
```

- [ ] **Step 9.2: Replace header/nav classes**

Find the sticky header (search for `sticky top-0 z-50`):

```tsx
// Before
className={`sticky top-0 z-50 border-b backdrop-blur-md transition-all ${
  isDarkMode ? "bg-[#02040a]/80 border-white/5" : "bg-white/80 border-slate-200"
}`}
```

```tsx
// After
className="sticky top-0 z-50 border-b backdrop-blur-md transition-all bg-[var(--bg)]/80 border-[var(--line)]"
```

Nav tab buttons (the 4 tab buttons in the header) — replace the active/inactive class ternaries:

```tsx
// Before (active state)
isDarkMode ? "bg-white/5 text-blue-400 border border-white/10" : "bg-slate-100 text-blue-600 border border-slate-200"
// Before (inactive state)
isDarkMode ? "text-slate-400 hover:text-slate-205" : "text-slate-650 hover:text-slate-900"
```

```tsx
// After (active state)
"bg-[var(--surface)] text-[var(--info)] border border-[var(--line-strong)]"
// After (inactive state)
"text-[var(--ink-3)] hover:text-[var(--ink)]"
```

- [ ] **Step 9.3: Replace landing hero classes**

Find the hero h2 (search for `text-3xl md:text-5xl font-extrabold`):

```tsx
// Before
isDarkMode 
  ? "bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent" 
  : "text-slate-900"
```

```tsx
// After — use CSS variable ink, no gradient needed (dark mode handles it via --ink)
"text-[var(--ink)]"
```

Find the tagline `<p>`:

```tsx
// Before
isDarkMode ? "text-slate-400" : "text-slate-600"
// After
"text-[var(--ink-3)]"
```

Find the secondary CTA button:

```tsx
// Before
isDarkMode 
  ? "bg-slate-900/60 hover:bg-slate-955 border-white/5 text-slate-300" 
  : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-3xs"
// After
"bg-[var(--surface)] hover:bg-[var(--surface-2)] border-[var(--line)] text-[var(--ink-2)]"
```

- [ ] **Step 9.4: Replace all remaining isDarkMode ternaries**

Do a global search in `home.tsx` for `isDarkMode ?`. For each remaining occurrence:

| Pattern | Replace with |
|---|---|
| `isDarkMode ? "border-white/5 ..." : "border-slate-200 ..."` | `"border-[var(--line)]"` |
| `isDarkMode ? "text-slate-400" : "text-slate-600"` | `"text-[var(--ink-3)]"` |
| `isDarkMode ? "text-slate-200" : "text-slate-800"` | `"text-[var(--ink)]"` |
| `isDarkMode ? "bg-slate-900/60" : "bg-white"` | `"bg-[var(--surface)]"` |
| `isDarkMode ? "bg-[#0d1117]" : "bg-[#f8fafc]"` | `"bg-[var(--surface-2)]"` |
| `isDarkMode ? "text-slate-100" : "text-slate-900"` | `"text-[var(--ink)]"` |
| Card borders: `isDarkMode ? "border-white/5" : "border-slate-200"` | `"border-[var(--line)]"` |

The `isDarkMode` state variable and the `useEffect(() => { document.documentElement.setAttribute... })` block must be kept as-is.

- [ ] **Step 9.5: Update isDarkMode toggle button icon (no class change needed)**

The icon toggle `{isDarkMode ? <Sun /> : <Moon />}` is correct — keep it. Only the button *wrapper* class needs updating:

```tsx
// Before
className={`p-2 rounded-lg border transition-all ${
  isDarkMode ? "border-white/5 text-slate-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-100"
}`}
```

```tsx
// After
className="p-2 rounded-lg border transition-all border-[var(--line)] text-[var(--ink-3)] hover:bg-[var(--surface)]"
```

- [ ] **Step 9.6: Update RootCauseGraph call sites in home.tsx**

Search for `<RootCauseGraph` in home.tsx. Remove any `isDarkMode={isDarkMode}` prop — the prop no longer exists:

```tsx
// Before
<RootCauseGraph nodes={...} links={...} isDarkMode={isDarkMode} />
// After
<RootCauseGraph nodes={...} links={...} />
```

- [ ] **Step 9.7: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 9.8: Visual smoke test — both themes**

Open http://localhost:5173. Toggle between dark and light mode on all 4 tabs (Overview, Agent Swarm, Investigations, Knowledge Base):
- Dark: background is `#02040a`, cards are `#060810`, text is near-white
- Light: background is `#F6F4EF`, cards are `#FFFFFF`, text is `#0E2238`
- No element should remain hardcoded black/white that doesn't switch

- [ ] **Step 9.9: Commit**

```bash
git add frontend/src/pages/home.tsx
git commit -m "refactor: unify home.tsx theming to CSS variables, remove inline isDarkMode conditionals"
```

---

## Task 10: Typography enforcement in the landing section

**Files:**
- Modify: `frontend/src/pages/home.tsx`

All monospace that isn't logs, IDs, code, or raw stats gets removed.

- [ ] **Step 10.1: Fix vendor strip**

Search for the vendor strip section (search for `Supported Integrations`). The vendor names use `font-mono font-bold`. Remove `font-mono`:

```tsx
// Before
<div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-xs font-mono font-bold text-slate-400">
  <span>Stripe</span>
  ...
</div>
```

```tsx
// After — vendor names are UI labels, not code
<div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2">
  <span className="text-xs font-semibold text-[var(--ink-3)]">Stripe</span>
  <span className="text-xs font-semibold text-[var(--ink-3)]">AWS</span>
  <span className="text-xs font-semibold text-[var(--ink-3)]">Cloudflare</span>
  <span className="text-xs font-semibold text-[var(--ink-3)]">Twilio</span>
  <span className="text-xs font-semibold text-[var(--ink-3)]">Auth0</span>
  <span className="text-xs font-semibold text-[var(--ink-3)]">SendGrid</span>
  <span className="text-xs font-semibold text-[var(--ink-3)]">Datadog</span>
</div>
```

Also fix the section label above the strip (search for `Supported Integrations & Monitored Vendors`):

```tsx
// Before
<span className="text-[10px] uppercase tracking-wider text-slate-500 block mb-3 font-sans font-bold">
// After — already has font-sans, confirm no font-mono, good
```

- [ ] **Step 10.2: Fix CTA button text**

Find the primary CTA button (search for `Run Demo Incident`):

```tsx
// Before — has uppercase + font-mono/sans ambiguity
className="... font-bold text-xs font-sans uppercase ..."
```

```tsx
// After — drop uppercase, keep font-sans
className="px-6 py-3 bg-gradient-to-tr from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-lg shadow-xl shadow-blue-500/10 flex items-center gap-2 transform active:scale-95 transition-all cursor-pointer"
// Button text: "Run Demo Incident" (keep as-is — already mixed case)
```

Find the secondary CTA button (search for `Explore RCA Report`):

```tsx
// Before — has uppercase
// After — drop uppercase, change text to mixed-case "Explore RCA Report →"
className="px-6 py-3 border font-bold text-xs rounded-lg transition-all cursor-pointer bg-[var(--surface)] hover:bg-[var(--surface-2)] border-[var(--line)] text-[var(--ink-2)]"
```

- [ ] **Step 10.3: Fix agent card section eyebrow**

Search for `Autonomous Agents Stack` (the section eyebrow):

```tsx
// Before — check if font-mono is present
<h3 className="text-xs font-mono tracking-widest text-blue-500 uppercase font-bold">
```

```tsx
// After
<h3 className="text-xs font-sans tracking-widest text-blue-500 uppercase font-bold">
```

- [ ] **Step 10.4: Verify "Live Gateway Linked" pill keeps font-mono**

Search for `Live Gateway Linked`. This uses `font-mono` — it's a system status indicator. **Do not change it.** Verify it stays:

```tsx
<span className="... font-mono px-2 py-1 rounded ...">
  <span ...></span>
  Live Gateway Linked
</span>
```

- [ ] **Step 10.5: Final type-check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 10.6: Visual full regression pass**

Open http://localhost:5173. Walk through every tab:

**Overview (landing):**
- Vendor names: proportional sans-serif, not monospace
- CTA "Run Demo Incident": mixed-case, sans-serif
- "Autonomous Agents Stack" eyebrow: sans-serif
- "Live Gateway Linked" pill: still monospace ✓
- Status badge "ACTIVE INCIDENT DETECTOR": monospace ✓

**Agent Swarm (cockpit):**
- Left rail: step titles, vendor names — sans-serif ✓
- Bottom strip: agent badge labels — sans-serif ✓
- SwarmOverlay: elapsed time values — monospace tabular-nums ✓
- Confidence %: monospace ✓

**Both themes:** dark and light — no broken contrast areas.

- [ ] **Step 10.7: Commit**

```bash
git add frontend/src/pages/home.tsx
git commit -m "style: enforce typography rules — remove font-mono from vendor strip, CTAs, eyebrows"
```

---

## Self-Review Against Spec

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Split-Brain layout (220px rail / flex main / 44px strip) | Task 2 |
| StepItem with idle/active/done states | Task 3 |
| VendorRow with outage/degraded/ok | Task 3 |
| ScenarioPicker (step 1–2) + "Preview" badge on graph | Task 4 |
| SwarmOverlay floating panel with spinner, confidence | Task 5 |
| AgentBadge bottom strip, Apply Mitigation button | Task 6 |
| RootCauseGraph removes isDarkMode | Task 7 |
| Error origin node red glow ring animation | Task 7 |
| CSS variable monospace on link latency labels | Task 7 (node tooltip labels) |
| AgentSwarmCockpit wired into home.tsx | Task 8 |
| isDarkMode inline conditionals → CSS variables | Task 9 |
| RootCauseGraph isDarkMode prop removed from call sites | Task 9.6 |
| Dark `--bg` = `#02040a` | Task 1 |
| Vendor strip: font-mono → sans-serif | Task 10.1 |
| CTA buttons: mixed-case, sans-serif | Task 10.2 |
| Eyebrows: font-mono → sans-serif | Task 10.3 |
| Status badges keep font-mono | Task 10.4 |

**No TBDs, no placeholder steps, no forward-references to undefined types.** All prop names used in Task 8 match the interface defined in Task 2.
