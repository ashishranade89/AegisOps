import React from 'react'
import { Play } from 'lucide-react'
import { ScenarioInfo } from '@/lib/api'
import { IncidentState } from '@/types/vigilant'
import { useIncidentStore, RunStatus } from '@/stores/incident-store'
import RootCauseGraph from './RootCauseGraph'

// ─── Types ────────────────────────────────────────────────────────────────────

export type StepState = 'idle' | 'active' | 'done'
export type TelemetryMode = 'standard' | 'preset' | 'upload'

export interface AgentSwarmCockpitProps {
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
  onApplyMitigation: () => void
  isMitigating: boolean
}

// ─── Module-level constants ────────────────────────────────────────────────────

const STEPS = [
  { num: 1, title: 'Select Scenario', subtitle: 'Choose incident type & telemetry mode' },
  { num: 2, title: 'Launch Swarm', subtitle: 'Start autonomous agent cluster' },
  { num: 3, title: 'Agent Analysis', subtitle: 'Triage · Correlate · Root Cause' },
  { num: 4, title: 'RCA Report', subtitle: 'Root cause summary & confidence' },
  { num: 5, title: 'Mitigation', subtitle: 'Apply remediation patch' },
]

const SWARM_AGENTS = [
  { key: 'triage',      label: 'Triage Agent' },
  { key: 'rag_search',  label: 'RAG Cache Lookup' },
  { key: 'rca',         label: 'Root Cause Analyzer' },
  { key: 'browser',     label: 'Browser Scraper Agent' },
  { key: 'remediation', label: 'Remediation Agent' },
  { key: 'reporter',    label: 'Incident Reporter' },
]

const NODE_TO_AGENT: Record<string, string> = {
  triage:      'Triage Agent',
  rag_search:  'RAG Cache Lookup',
  rca:         'Root Cause Analyzer',
  browser:     'Browser Scraper Agent',   // was 'Browser Scraper'
  remediation: 'Remediation Agent',
  reporter:    'Incident Reporter',
}

const MODES: { value: TelemetryMode; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'preset', label: 'Preset' },
  { value: 'upload', label: 'Upload JSON' },
]

// ─── StepItem style lookup tables ─────────────────────────────────────────────

const STEP_NUM_STYLES: Record<StepState, React.CSSProperties> = {
  done:   { background: 'rgba(16,185,129,.15)', color: '#10b981' },
  active: { background: 'rgba(59,130,246,.18)', color: '#60a5fa' },
  idle:   { background: '#0f172a',              color: '#334155' },
}
const STEP_TITLE_COLOR: Record<StepState, string> = {
  done:   '#10b981',
  active: '#93c5fd',
  idle:   '#334155',
}
const STEP_ITEM_STYLE: Record<StepState, React.CSSProperties> = {
  done:   { background: 'rgba(16,185,129,.04)' },
  active: { background: 'rgba(59,130,246,.07)', border: '1px solid rgba(59,130,246,.12)' },
  idle:   {},
}

// ─── VendorRow lookup tables ───────────────────────────────────────────────────

const VENDOR_STATUS_COLOR: Record<'operational' | 'degraded' | 'outage', string> = {
  operational: '#34d399',
  degraded:    '#fbbf24',
  outage:      '#f87171',
}
const VENDOR_STATUS_LABEL: Record<'operational' | 'degraded' | 'outage', string> = {
  operational: 'OK',
  degraded:    'Degraded',
  outage:      'Outage',
}

// ─── AgentBadge styles ────────────────────────────────────────────────────────

const AGENT_BADGE_STYLES: Record<'idle' | 'active' | 'done', React.CSSProperties> = {
  idle:   { background: 'rgba(255,255,255,.03)', color: '#334155', border: '1px solid #0f172a' },
  done:   { background: 'rgba(16,185,129,.08)',  color: '#34d399', border: '1px solid rgba(16,185,129,.15)' },
  active: { background: 'rgba(245,158,11,.08)',  color: '#fbbf24', border: '1px solid rgba(245,158,11,.15)' },
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

function deriveConfidence(completedNodes: string[]): number | null {
  if (completedNodes.length >= 4) return 94
  if (completedNodes.length >= 2) return 72
  return null
}

// ─── Step derivation ──────────────────────────────────────────────────────────

function deriveActiveStep(
  status: RunStatus,
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

// ─── StepItem ─────────────────────────────────────────────────────────────────

interface StepItemProps {
  num: number
  title: string
  subtitle: string
  state: StepState
  isLast?: boolean
}

function StepItem({ num, title, subtitle, state, isLast }: StepItemProps) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 8px', borderRadius: 6, ...STEP_ITEM_STYLE[state] }}>
        <div style={{ width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, flexShrink: 0, marginTop: 1, ...STEP_NUM_STYLES[state] }}>
          {state === 'done' ? '✓' : num}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: STEP_TITLE_COLOR[state], lineHeight: 1.2 }}>{title}</div>
          <div style={{ fontSize: 8, color: '#475569', marginTop: 1, lineHeight: 1.3 }}>{subtitle}</div>
        </div>
      </div>
      {!isLast && (
        <div style={{ width: 1, height: 8, background: state === 'done' ? 'rgba(16,185,129,.2)' : '#0f172a', marginLeft: 19 }} />
      )}
    </>
  )
}

// ─── VendorRow ────────────────────────────────────────────────────────────────

function VendorRow({ name, status }: { name: string; status: 'operational' | 'degraded' | 'outage' }) {
  const col = VENDOR_STATUS_COLOR[status]
  const label = VENDOR_STATUS_LABEL[status]
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px' }}>
      <span style={{ fontSize: 9.5, fontWeight: 600, color: '#64748b' }}>{name}</span>
      <span style={{ fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3, color: col }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: col, display: 'inline-block' }} />
        {label}
      </span>
    </div>
  )
}

// ─── LeftRail ─────────────────────────────────────────────────────────────────

function LeftRail({ activeStep, vendorHealth }: { activeStep: number; vendorHealth: IncidentState['vendorHealth'] }) {
  return (
    <div style={{ background: '#060810', borderRight: '1px solid #0f172a', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 3, height: '100%', overflow: 'hidden' }}>
      <div style={{ fontSize: 8.5, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6, padding: '0 4px' }}>
        Investigation Steps
      </div>
      {STEPS.map((s, i) => {
        const state: StepState = s.num < activeStep ? 'done' : s.num === activeStep ? 'active' : 'idle'
        return <StepItem key={s.num} {...s} state={state} isLast={i === STEPS.length - 1} />
      })}
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

// ─── ScenarioPicker ───────────────────────────────────────────────────────────

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

function ScenarioPicker({ scenarios, selectedScenarioType, onScenarioChange, telemetryMode, onTelemetryModeChange, onLaunch, loading, loadingAnalysis, cockpitLocked, previewIncident }: ScenarioPickerProps) {
  return (
    <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', height: '100%', gap: 10, padding: 16, background: 'var(--bg)' }}>
      {/* Top: scenario picker card */}
      <div style={{ background: '#060810', border: '1px solid #0f172a', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Select Incident Scenario
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          {scenarios.map((s) => {
            const isSelected = s.scenario_type === selectedScenarioType
            return (
              <button
                key={s.scenario_type}
                onClick={() => onScenarioChange(s.scenario_type)}
                style={{ flex: '1 0 120px', background: isSelected ? 'rgba(29,78,216,.06)' : '#02040a', border: `1px solid ${isSelected ? '#1d4ed8' : '#1e293b'}`, borderRadius: 6, padding: '8px 10px', textAlign: 'left', cursor: 'pointer' }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: '#cbd5e1' }}>{s.name}</div>
                <div style={{ fontSize: 8, color: '#475569', marginTop: 1 }}>{s.description.slice(0, 48) /* Truncate for card preview */}</div>
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 9, color: '#475569' }}>Telemetry Mode:</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => onTelemetryModeChange(m.value)}
                style={{ fontSize: 8.5, padding: '2px 8px', borderRadius: 10, border: `1px solid ${telemetryMode === m.value ? 'rgba(29,78,216,.25)' : '#1e293b'}`, background: telemetryMode === m.value ? 'rgba(29,78,216,.1)' : 'transparent', color: telemetryMode === m.value ? '#60a5fa' : '#64748b', cursor: 'pointer' }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            onClick={onLaunch}
            disabled={loading || loadingAnalysis || cockpitLocked}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 6, background: cockpitLocked ? '#0f172a' : '#1d4ed8', color: cockpitLocked ? '#334155' : '#fff', fontSize: 10, fontWeight: 700, border: 'none', cursor: cockpitLocked ? 'not-allowed' : 'pointer' }}
          >
            <Play size={10} />
            {loading || loadingAnalysis ? 'Launching…' : 'Launch Swarm'}
          </button>
        </div>
      </div>

      {/* Bottom: preview graph */}
      <div style={{ position: 'relative', background: '#030509', border: '1px solid #0f172a', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 8, left: 10, zIndex: 10, fontSize: 8, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(245,158,11,.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,.2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Preview — Mock Topology
        </div>
        <RootCauseGraph nodes={previewIncident.graphNodes} links={previewIncident.graphLinks} />
      </div>
    </div>
  )
}

// ─── SwarmOverlay ─────────────────────────────────────────────────────────────

function SwarmOverlay() {
  const { activeAgent, completedNodes, totalCostUsd, events } = useIncidentStore()

  const agentTimes: Record<string, number> = {}
  const starts: Record<string, number> = {}
  events.forEach((e) => {
    if (e.type === 'agent_start' && e.agent_name) starts[e.agent_name] = e.timestamp
    if (e.type === 'agent_end' && e.agent_name && starts[e.agent_name]) {
      agentTimes[e.agent_name] = Math.round((e.timestamp - starts[e.agent_name]) / 1000)
    }
  })

  const confidence = deriveConfidence(completedNodes)

  return (
    <div style={{ position: 'absolute', top: 12, right: 12, width: 200, background: 'rgba(6,8,16,.92)', border: '1px solid #1e293b', borderRadius: 8, padding: '10px 12px', backdropFilter: 'blur(8px)', zIndex: 20 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
        AI Swarm Reasoning
      </div>
      {SWARM_AGENTS.map((a) => {
        const isDone = completedNodes.includes(a.key)
        const isActive = activeAgent === NODE_TO_AGENT[a.key] || activeAgent === a.label
        const elapsed = agentTimes[a.label] ?? agentTimes[NODE_TO_AGENT[a.key]]
        return (
          <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,.03)' }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, flexShrink: 0, background: isDone ? 'rgba(16,185,129,.15)' : isActive ? 'rgba(245,158,11,.12)' : '#0f172a', color: isDone ? '#10b981' : isActive ? '#f59e0b' : '#334155' }}>
              {isDone ? '✓' : isActive ? (
                <span style={{ display: 'inline-block', width: 8, height: 8, border: '1.5px solid rgba(245,158,11,.3)', borderTopColor: '#f59e0b', borderRadius: '50%', animation: 'cockpit-spin .8s linear infinite' }} />
              ) : '○'}
            </div>
            <div style={{ fontSize: 9.5, fontWeight: 600, flex: 1, color: isDone ? '#94a3b8' : isActive ? '#e2e8f0' : '#334155' }}>
              {a.label}
            </div>
            <div style={{ fontSize: 7.5, color: isDone ? '#475569' : isActive ? '#f59e0b' : '#334155', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
              {isDone && elapsed != null ? `${elapsed}s` : isActive ? '…' : '—'}
            </div>
          </div>
        )
      })}
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
    </div>
  )
}

// ─── AgentBadge ───────────────────────────────────────────────────────────────

function AgentBadge({ label, state }: { label: string; state: 'idle' | 'active' | 'done' }) {
  const prefix = state === 'done' ? '✓ ' : state === 'active' ? '⟳ ' : '○ '
  return (
    <div style={{ fontSize: 8.5, padding: '2px 8px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 4, ...AGENT_BADGE_STYLES[state] }}>
      {prefix}{label}
    </div>
  )
}

// ─── BottomStrip ──────────────────────────────────────────────────────────────

interface BottomStripProps {
  onApplyMitigation: () => void
  isMitigating: boolean
}

function BottomStrip({ onApplyMitigation, isMitigating }: BottomStripProps) {
  const { activeAgent, completedNodes, report } = useIncidentStore()

  const agentBadgeState = (key: string): 'idle' | 'active' | 'done' => {
    if (completedNodes.includes(key)) return 'done'
    if (activeAgent && NODE_TO_AGENT[key] === activeAgent) return 'active'
    return 'idle'
  }

  const canApply = !!report && !isMitigating
  const confidence = deriveConfidence(completedNodes)

  return (
    <div style={{ background: '#060810', borderTop: '1px solid #0f172a', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 6, overflow: 'hidden' }}>
      <AgentBadge label="Triage" state={agentBadgeState('triage')} />
      <AgentBadge label="RAG Lookup" state={agentBadgeState('rag_search')} />
      <AgentBadge label="Root Cause" state={agentBadgeState('rca')} />
      <AgentBadge label="Remediation" state={agentBadgeState('remediation')} />
      <div style={{ flex: 1 }} />
      {confidence != null && (
        <div style={{ fontSize: 8.5, color: '#10b981', padding: '2px 8px', border: '1px solid rgba(16,185,129,.15)', borderRadius: 10, background: 'rgba(16,185,129,.06)', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
          {confidence}% confidence
        </div>
      )}
      <button
        onClick={onApplyMitigation}
        disabled={!canApply}
        style={{ fontSize: 9, fontWeight: 700, padding: '5px 14px', borderRadius: 5, background: canApply ? '#1d4ed8' : '#0f172a', color: canApply ? '#fff' : '#334155', border: `1px solid ${canApply ? '#1d4ed8' : '#1e293b'}`, cursor: canApply ? 'pointer' : 'not-allowed' }}
      >
        {isMitigating ? 'Applying…' : 'Apply Mitigation'}
      </button>
    </div>
  )
}

// ─── AgentSwarmCockpit ────────────────────────────────────────────────────────

export function AgentSwarmCockpit(props: AgentSwarmCockpitProps) {
  const { status, report } = useIncidentStore()

  const activeStep = deriveActiveStep(status, props.loadingAnalysis, report, props.isMitigating)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gridTemplateRows: '1fr 44px', height: 'calc(100vh - 48px)', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Left Rail */}
      <div style={{ gridRow: '1 / 3' }}>
        <LeftRail activeStep={activeStep} vendorHealth={props.previewIncident.vendorHealth} />
      </div>

      {/* Main Content */}
      <div style={{ overflow: 'hidden', position: 'relative' }}>
        {activeStep <= 2 ? (
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
        ) : (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <RootCauseGraph nodes={props.previewIncident.graphNodes} links={props.previewIncident.graphLinks} />
            <SwarmOverlay />
          </div>
        )}
      </div>

      {/* Bottom Strip */}
      <BottomStrip
        onApplyMitigation={props.onApplyMitigation}
        isMitigating={props.isMitigating}
      />
    </div>
  )
}
