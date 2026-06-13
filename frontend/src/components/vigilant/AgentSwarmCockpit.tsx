import { useState, useEffect, useRef } from 'react'
import { Play, Zap, Globe, Cpu, AlertTriangle, ShieldCheck, Eye, EyeOff, FlaskConical, Bell, ChevronDown, ChevronUp, Upload, CheckCircle2, XCircle } from 'lucide-react'
import { ScenarioInfo } from '@/lib/api'
import { IncidentState } from '@/types/vigilant'
import { useIncidentStore, RunStatus } from '@/stores/incident-store'
import RootCauseGraph from './RootCauseGraph'
import { IntegrationAccordion } from './IntegrationAccordion'
import { testSlack, testJira } from '../../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export type StepState = 'idle' | 'active' | 'done'
export type TelemetryMode = 'standard' | 'preset' | 'upload' | 'manual'

export interface AgentSwarmCockpitProps {
  scenarios: ScenarioInfo[]
  selectedScenarioType: string
  onScenarioChange: (type: string) => void
  telemetryMode: TelemetryMode
  onTelemetryModeChange: (mode: TelemetryMode) => void
  onLaunch: () => void
  onUploadData: (data: any) => void
  manualDescription: string
  setManualDescription: (v: string) => void
  loading: boolean
  loadingAnalysis: boolean
  cockpitLocked: boolean
  previewIncident: IncidentState
  onApplyMitigation: () => void
  isMitigating: boolean
  openrouterKey: string
  setOpenrouterKey: (val: string) => void
  tavilyKey: string
  setTavilyKey: (val: string) => void
  llmModel: string
  setLlmModel: (val: string) => void
}

// ─── CSS variable palette ─────────────────────────────────────────────────────
const C = {
  bg:       'var(--bg)',
  surface:  'var(--surface)',
  surface2: 'var(--surface-2)',
  line:     'var(--line)',
  lineStr:  'var(--line-strong)',
  ink:      'var(--ink)',
  ink2:     'var(--ink-2)',
  ink3:     'var(--ink-3)',
  ink4:     'var(--ink-4)',
  accent:   'var(--primary-accent)',
  pos:      'var(--positive)',
  posTint:  'var(--positive-tint)',
  neg:      'var(--negative)',
  negTint:  'var(--negative-tint)',
  warn:     'var(--warn)',
  warnTint: 'var(--warn-tint)',
  info:     'var(--info)',
  infoTint: 'var(--info-tint)',
} as const

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = [
  { num: 1, title: 'Select Scenario', subtitle: 'Choose incident type & mode' },
  { num: 2, title: 'Launch Swarm',   subtitle: 'Start agent cluster' },
  { num: 3, title: 'Agent Analysis', subtitle: 'Triage · Correlate' },
  { num: 4, title: 'RCA Report',     subtitle: 'Root cause summary' },
  { num: 5, title: 'Mitigation',     subtitle: 'Apply patch' },
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
  browser:     'Browser Scraper Agent',
  remediation: 'Remediation Agent',
  reporter:    'Incident Reporter',
}

const MODES: { value: TelemetryMode; label: string; desc: string }[] = [
  { value: 'standard', label: 'Standard',    desc: 'Pick from preset scenarios' },
  { value: 'preset',   label: 'Preset Data', desc: 'Use bundled telemetry' },
  { value: 'upload',   label: 'Upload JSON', desc: 'Custom telemetry file' },
  { value: 'manual',   label: 'Describe',    desc: 'Type incident details' },
]

// ─── Derived helpers ──────────────────────────────────────────────────────────

function deriveConfidence(completedNodes: string[]): number | null {
  if (completedNodes.length >= 4) return 94
  if (completedNodes.length >= 2) return 72
  return null
}

function deriveActiveStep(status: RunStatus, loadingAnalysis: boolean, report: string, isMitigating: boolean): number {
  if (isMitigating) return 5
  // After a run finishes (completed or failed), reset to step 1 so the user can launch a new investigation
  if (status === 'completed' || status === 'failed') return 1
  if (report) return 4
  if (status === 'running' || status === 'paused') return 3
  if (loadingAnalysis || status === 'pending') return 2
  return 1
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      {icon}
      <span style={{ fontSize: 13, fontWeight: 800, color: C.ink, letterSpacing: '.04em', textTransform: 'uppercase' }}>
        {children}
      </span>
    </div>
  )
}

// ─── StepItem ─────────────────────────────────────────────────────────────────

function StepItem({ num, title, subtitle, state, isLast }: {
  num: number; title: string; subtitle: string; state: StepState; isLast?: boolean
}) {
  const isDone = state === 'done'
  const isActive = state === 'active'
  const numBg = isDone ? 'rgba(16,185,129,.18)' : isActive ? 'rgba(96,165,250,.18)' : C.line
  const numColor = isDone ? '#10b981' : isActive ? '#60a5fa' : C.ink4
  const titleColor = isDone ? '#10b981' : isActive ? '#93c5fd' : C.ink3
  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 8,
        background: isActive ? 'rgba(96,165,250,.06)' : 'transparent',
        border: isActive ? `1px solid rgba(96,165,250,.18)` : '1px solid transparent',
      }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0, background: numBg, color: numColor }}>
          {isDone ? '✓' : num}
        </div>
        <div style={{ paddingTop: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: titleColor, lineHeight: 1.3 }}>{title}</div>
          <div style={{ fontSize: 11, color: C.ink4, marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>
      {!isLast && <div style={{ width: 1, height: 6, background: isDone ? 'rgba(16,185,129,.3)' : C.line, marginLeft: 22 }} />}
    </>
  )
}

// ─── VendorRow ────────────────────────────────────────────────────────────────

function VendorRow({ name, status }: { name: string; status: 'operational' | 'degraded' | 'outage' }) {
  const col = { operational: '#34d399', degraded: '#fbbf24', outage: '#f87171' }[status]
  const label = { operational: 'OK', degraded: 'Degraded', outage: 'Outage' }[status]
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.ink2 }}>{name}</span>
      <span style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, color: col }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: col, display: 'inline-block' }} />
        {label}
      </span>
    </div>
  )
}

// ─── ApiKeyInput ─────────────────────────────────────────────────────────────

function ApiKeyInput({ label, value, onChange, placeholder, hint, isSaved }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; hint?: string; isSaved?: boolean
}) {
  const [show, setShow] = useState(false)
  const hasBorder = isSaved !== undefined ? isSaved : value.trim().length > 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: C.ink2, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</label>
        {isSaved && <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,.14)', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(16,185,129,.28)' }}>✓ Saved</span>}
      </div>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ width: '100%', background: C.bg, border: `1px solid ${hasBorder ? 'rgba(16,185,129,.4)' : C.lineStr}`, borderRadius: 8, padding: '10px 40px 10px 12px', fontSize: 13, color: C.ink, outline: 'none', fontFamily: 'monospace', transition: 'border-color 150ms' }}
        />
        <button type="button" onClick={() => setShow(!show)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.ink3, padding: 0 }}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {hint && <div style={{ fontSize: 11.5, color: C.ink4, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  )
}

// ─── LeftRail ─────────────────────────────────────────────────────────────────

function LeftRail({ activeStep, vendorHealth, cockpitLocked, openrouterKey, setOpenrouterKey, tavilyKey, setTavilyKey, llmModel, setLlmModel }: {
  activeStep: number
  vendorHealth: IncidentState['vendorHealth']
  cockpitLocked: boolean
  openrouterKey: string; setOpenrouterKey: (v: string) => void
  tavilyKey: string; setTavilyKey: (v: string) => void
  llmModel: string; setLlmModel: (v: string) => void
}) {
  // Auto-jump to keys tab when no key is configured so user knows where to go
  const [tab, setTab] = useState<'steps' | 'keys' | 'engine'>(() => cockpitLocked ? 'keys' : 'steps')
  useEffect(() => {
    if (cockpitLocked) setTab('keys')
  }, [cockpitLocked])
  const [keysSaved, setKeysSaved] = useState(false)
  const [draftOrKey, setDraftOrKey] = useState('')
  const [draftTavilyKey, setDraftTavilyKey] = useState('')

  const handleSaveKeys = () => {
    const newOrKey = draftOrKey.trim() || openrouterKey
    const newTavilyKey = draftTavilyKey.trim() || tavilyKey
    if (draftOrKey.trim()) setOpenrouterKey(draftOrKey)
    if (draftTavilyKey.trim()) setTavilyKey(draftTavilyKey)
    localStorage.setItem('openrouter_key', newOrKey)
    localStorage.setItem('tavily_key', newTavilyKey)
    localStorage.setItem('llm_model', llmModel)
    setKeysSaved(true)
    setTimeout(() => setKeysSaved(false), 2000)
  }

  return (
    <div style={{ background: C.surface, borderRight: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
        {(['steps', 'keys', 'engine'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '12px 4px', fontSize: 11, fontWeight: tab === t ? 800 : 500,
            color: tab === t ? C.info : C.ink3, background: 'none', border: 'none',
            borderBottom: `2px solid ${tab === t ? C.info : 'transparent'}`,
            cursor: 'pointer', transition: 'all 150ms', textTransform: 'uppercase', letterSpacing: '.06em',
            marginBottom: -1,
          }}>
            {t === 'steps' ? 'Steps' : t === 'keys' ? 'API Keys' : 'Engine'}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }} className="custom-scrollbar">

        {tab === 'steps' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {STEPS.map((s, i) => {
              const state: StepState = s.num < activeStep ? 'done' : s.num === activeStep ? 'active' : 'idle'
              return <StepItem key={s.num} {...s} state={state} isLast={i === STEPS.length - 1} />
            })}
          </div>
        )}

        {tab === 'keys' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ApiKeyInput label="OpenRouter Key" value={draftOrKey} onChange={setDraftOrKey} placeholder="sk-or-v1-..." hint="Required for cloud LLM inference via OpenRouter" isSaved={openrouterKey.trim().length > 0} />
            <ApiKeyInput label="Tavily Search Key" value={draftTavilyKey} onChange={setDraftTavilyKey} placeholder="tvly-..." hint="Powers real-time vendor status page search" isSaved={tavilyKey.trim().length > 0} />

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

            <button
              onClick={handleSaveKeys}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: keysSaved ? 'rgba(16,185,129,.18)' : 'rgba(37,99,235,.18)',
                color: keysSaved ? '#10b981' : '#60a5fa',
                fontSize: 13, fontWeight: 800, transition: 'all 200ms',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: keysSaved ? '0 0 0 1px rgba(16,185,129,.35)' : '0 0 0 1px rgba(37,99,235,.35)',
              }}
            >
              {keysSaved ? <><ShieldCheck size={13} /> Keys Saved</> : <><ShieldCheck size={13} /> Save Keys</>}
            </button>
            <div style={{ padding: '10px 12px', borderRadius: 8, background: C.surface2, border: `1px solid ${C.line}` }}>
              <div style={{ fontSize: 11.5, color: C.ink3, lineHeight: 1.5 }}>Keys are stored locally in your browser and never sent to third parties.</div>
            </div>
          </div>
        )}

        {tab === 'engine' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.ink3, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Cpu size={12} style={{ color: '#f59e0b' }} /> LLM Model
              </div>
              <select value={llmModel} onChange={(e) => setLlmModel(e.target.value)} style={{ background: C.bg, border: `1px solid ${C.lineStr}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: C.ink, width: '100%', cursor: 'pointer', outline: 'none' }}>
                <option value="openai/gpt-4o-mini">GPT-4o Mini (Fast)</option>
                <option value="openai/gpt-4o">GPT-4o (Smart)</option>
                <option value="google/gemini-2.0-flash-001">Gemini 2.0 Flash</option>
                <option value="google/gemini-pro-1.5">Gemini 1.5 Pro</option>
                <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                <option value="deepseek/deepseek-chat">DeepSeek V3</option>
              </select>
            </div>

            <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid rgba(96,165,250,.2)` }}>
              <div style={{ background: 'rgba(96,165,250,.08)', padding: '10px 14px', fontSize: 12, fontWeight: 800, color: '#93c5fd', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={12} /> Current Config
              </div>
              {[
                { k: 'Model',      v: llmModel.split('/').pop() ?? llmModel, c: C.ink2 },
                { k: 'OR Key',     v: openrouterKey ? '✓ Set' : '✗ Missing', c: openrouterKey ? '#10b981' : '#f87171' },
                { k: 'Tavily',     v: tavilyKey ? '✓ Set' : '○ Optional',    c: tavilyKey ? '#10b981' : C.warn },
              ].map(({ k, v, c }) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderTop: `1px solid rgba(96,165,250,.1)` }}>
                  <span style={{ fontSize: 12, color: C.ink3 }}>{k}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: c, fontFamily: 'monospace', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Vendor health — pinned to bottom */}
      <div style={{ borderTop: `1px solid ${C.line}`, padding: '12px 14px', flexShrink: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: C.ink4, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Vendor Health</div>
        {vendorHealth.map((v) => <VendorRow key={v.name} name={v.name} status={v.status} />)}
      </div>
    </div>
  )
}

// ─── ScenarioPicker — vertical layout, fully scrollable ──────────────────────

function ScenarioPicker({ scenarios, selectedScenarioType, onScenarioChange, telemetryMode, onTelemetryModeChange, onLaunch, onFileUpload, manualDescription, setManualDescription, loading, loadingAnalysis, cockpitLocked, previewIncident }: {
  scenarios: ScenarioInfo[]
  selectedScenarioType: string
  onScenarioChange: (type: string) => void
  telemetryMode: TelemetryMode
  onTelemetryModeChange: (mode: TelemetryMode) => void
  onLaunch: () => void
  onFileUpload: (data: any) => void
  manualDescription: string
  setManualDescription: (v: string) => void
  loading: boolean
  loadingAnalysis: boolean
  cockpitLocked: boolean
  previewIncident: IncidentState
}) {
  const [manualTestResult, setManualTestResult] = useState<string | null>(null)
  const [manualTestLoading, setManualTestLoading] = useState(false)
  const [showManualTest, setShowManualTest] = useState(false)
  const [manualLatency, setManualLatency] = useState(2500)
  const [manualErrorRate, setManualErrorRate] = useState(18)
  const [uploadFileName, setUploadFileName] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadReady, setUploadReady] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFileName(file.name)
    setUploadError(null)
    setUploadReady(false)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (!data.raw_logs && !data.raw_metrics) {
          setUploadError('JSON must contain raw_logs or raw_metrics keys')
          return
        }
        onFileUpload(data)
        setUploadReady(true)
      } catch {
        setUploadError('Invalid JSON — could not parse file')
      }
    }
    reader.readAsText(file)
  }

  const runManualTest = async () => {
    setManualTestLoading(true)
    setManualTestResult(null)
    await new Promise((r) => setTimeout(r, 900))
    const lb = manualLatency > 2000
    const eb = manualErrorRate > 15
    setManualTestResult([
      `[TEST] Manual alert trigger fired at ${new Date().toLocaleTimeString()}`,
      `[TEST] Latency probe:    ${manualLatency}ms → ${lb ? '⚠ THRESHOLD BREACHED' : '✓ Within limits'}`,
      `[TEST] Error rate probe: ${manualErrorRate}% → ${eb ? '⚠ THRESHOLD BREACHED' : '✓ Within limits'}`,
      lb || eb
        ? '[TEST] 🔴 Alert condition met — agents would be triggered'
        : '[TEST] ✅ All metrics within range — no dispatch needed',
    ].join('\n'))
    setManualTestLoading(false)
  }

  const uploadPending = telemetryMode === 'upload' && !uploadReady
  const manualPending = telemetryMode === 'manual' && !manualDescription.trim()
  const isDisabled = loading || loadingAnalysis || cockpitLocked || uploadPending || manualPending
  const selectedScenario = scenarios.find((s) => s.scenario_type === selectedScenarioType)
  const telemetrySummary = telemetryMode === 'standard'
    ? {
        title: selectedScenario?.name || 'Standard scenario',
        detail: selectedScenario?.description || 'Choose a preset incident to drive the investigation.',
        note: 'The swarm will use the selected preset data and follow the normal investigation pipeline.',
      }
    : telemetryMode === 'preset'
      ? {
          title: 'Bundled telemetry',
          detail: 'Uses the built-in incident dataset bundled with the app for deterministic behavior.',
          note: `Current preview topic: ${previewIncident.topic}`,
        }
      : telemetryMode === 'upload'
        ? {
            title: 'Uploaded JSON',
            detail: 'Provide a JSON file containing `raw_logs` and/or `raw_metrics` to seed the run.',
            note: uploadReady && uploadFileName
              ? `Ready to launch with ${uploadFileName}.`
              : 'Choose a file before launching to keep the run grounded in your own telemetry.',
          }
        : {
            title: 'Manual description',
            detail: 'Type a concise incident summary so the triage agent can extract the key signals.',
            note: previewIncident.rootCause
              ? `Preview root cause: ${previewIncident.rootCause.origin} (${previewIncident.rootCause.confidence}% confidence).`
              : 'Keep the description short, specific, and focused on symptoms, timing, and impact.',
          }

  return (
    // Outer: full height scrollable column
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg }} className="custom-scrollbar">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 20px 32px' }}>

        {/* ① SCENARIO SELECTION ─────────────────────────────── */}
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: '18px 20px' }}>
          <SectionTitle icon={<Zap size={15} style={{ color: C.warn }} />}>Select Incident Scenario</SectionTitle>

          {/* Scenario cards — horizontal scroll */}
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }} className="custom-scrollbar">
            {scenarios.map((s) => {
              const sel = s.scenario_type === selectedScenarioType
              return (
                <button
                  key={s.scenario_type}
                  onClick={() => onScenarioChange(s.scenario_type)}
                  style={{
                    flex: '0 0 180px', borderRadius: 12, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', transition: 'all 150ms',
                    background: sel ? 'rgba(37,99,235,.14)' : C.surface2,
                    border: `2px solid ${sel ? '#3b82f6' : C.line}`,
                    boxShadow: sel ? '0 0 20px rgba(37,99,235,.2)' : 'none',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800, color: sel ? '#93c5fd' : C.ink, marginBottom: 6 }}>{s.name}</div>
                  <div style={{ fontSize: 11.5, color: sel ? '#7ab8ff' : C.ink3, lineHeight: 1.5 }}>
                    {s.description.length > 70 ? s.description.slice(0, 70) + '…' : s.description}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ② TELEMETRY MODE ─────────────────────────────────── */}
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: '18px 20px' }}>
          <SectionTitle icon={<Cpu size={15} style={{ color: C.info }} />}>Telemetry Mode</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {MODES.map((m) => {
              const active = telemetryMode === m.value
              return (
                <button
                  key={m.value}
                  onClick={() => onTelemetryModeChange(m.value)}
                  style={{
                    padding: '12px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: 'all 150ms',
                    background: active ? 'rgba(96,165,250,.12)' : C.surface2,
                    border: `2px solid ${active ? C.info : C.line}`,
                    boxShadow: active ? '0 0 14px rgba(96,165,250,.15)' : 'none',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 800, color: active ? '#93c5fd' : C.ink, marginBottom: 3 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: active ? '#7ab8ff' : C.ink3 }}>{m.desc}</div>
                </button>
              )
            })}
          </div>

          {/* Manual triage — visible when 'manual' mode selected */}
          {telemetryMode === 'manual' && (
            <div className="fade-in" style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.ink3, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Describe the incident
              </div>
              <textarea
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                placeholder={`e.g. "Stripe payments failing with 504 errors since 10 AM. Error rate jumped to 18%. Charge API calls timing out after 30s. Affects all EU customers."`}
                rows={5}
                style={{
                  width: '100%', background: C.bg, border: `1px solid ${manualDescription.trim() ? 'rgba(16,185,129,.4)' : C.lineStr}`,
                  borderRadius: 10, padding: '12px 14px', fontSize: 13, color: C.ink,
                  outline: 'none', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical',
                  transition: 'border-color 150ms', boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 11.5, color: C.ink4, marginTop: 6 }}>
                Include vendor name, error type, timing, and any metrics you have. The triage agent will extract structured data from your description.
              </div>
            </div>
          )}

          {/* Upload JSON file picker — only visible when upload mode selected */}
          {telemetryMode === 'upload' && (
            <div className="fade-in" style={{ marginTop: 14 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleFile}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  padding: '14px 20px', borderRadius: 10, cursor: 'pointer', transition: 'all 150ms',
                  background: uploadReady ? 'rgba(16,185,129,.1)' : 'rgba(96,165,250,.07)',
                  border: `2px dashed ${uploadReady ? 'rgba(16,185,129,.5)' : uploadError ? 'rgba(244,63,94,.5)' : 'rgba(96,165,250,.35)'}`,
                  color: uploadReady ? '#10b981' : uploadError ? '#f87171' : '#60a5fa',
                }}
              >
                {uploadReady
                  ? <><CheckCircle2 size={16} /><span style={{ fontSize: 13, fontWeight: 700 }}>{uploadFileName}</span></>
                  : uploadError
                    ? <><XCircle size={16} /><span style={{ fontSize: 13, fontWeight: 700 }}>{uploadError}</span></>
                    : <><Upload size={16} /><span style={{ fontSize: 13, fontWeight: 700 }}>Click to select JSON telemetry file</span></>
                }
              </button>
              <div style={{ fontSize: 11, color: C.ink4, marginTop: 6 }}>
                File must contain <code style={{ color: C.info, fontFamily: 'monospace' }}>raw_logs</code> or <code style={{ color: C.info, fontFamily: 'monospace' }}>raw_metrics</code> keys
              </div>
            </div>
          )}

          <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: 'rgba(96,165,250,.05)', border: `1px solid rgba(96,165,250,.16)` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                {telemetrySummary.title}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd' }}>
                {telemetryMode === 'standard' ? 'Preset flow' : telemetryMode === 'preset' ? 'Bundled data' : telemetryMode === 'upload' ? 'File-backed run' : 'Freeform intake'}
              </div>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.7, color: C.ink2 }}>
              {telemetrySummary.detail}
            </div>
            <div style={{ marginTop: 8, fontSize: 11.5, lineHeight: 1.7, color: C.ink4 }}>
              {telemetrySummary.note}
            </div>
          </div>
        </div>

        {/* ③ LAUNCH BUTTON ──────────────────────────────────── */}
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: '18px 20px' }}>
          {(cockpitLocked || uploadPending || manualPending) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 10, background: C.negTint, border: `1px solid rgba(244,63,94,.25)`, marginBottom: 14 }}>
              <AlertTriangle size={15} style={{ color: C.neg, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.neg }}>
                  {cockpitLocked ? 'API Keys Required' : uploadPending ? 'Upload a JSON File First' : 'Describe the Incident First'}
                </div>
                <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>
                  {cockpitLocked
                    ? 'Go to the API Keys tab in the left sidebar → enter your OpenRouter key → click Save Keys.'
                    : uploadPending
                      ? 'Select a telemetry JSON file using the file picker above before launching.'
                      : 'Type your incident description in the text box above before launching.'}
                </div>
              </div>
            </div>
          )}
          <button
            id="cockpit-launch-btn"
            onClick={onLaunch}
            disabled={isDisabled}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '16px 32px', borderRadius: 12,
              background: isDisabled ? C.surface2 : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: isDisabled ? C.ink4 : '#fff',
              fontSize: 15, fontWeight: 900,
              border: isDisabled ? `1px solid ${C.line}` : '1px solid rgba(255,255,255,.2)',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              boxShadow: isDisabled ? 'none' : '0 6px 28px rgba(37,99,235,.45), inset 0 1px 0 rgba(255,255,255,.15)',
              textTransform: 'uppercase', letterSpacing: '0.06em', transition: 'all 150ms',
              opacity: loading || loadingAnalysis ? 0.7 : 1,
            }}
          >
            <Play size={16} fill="currentColor" />
            {loading || loadingAnalysis ? 'Executing Investigation Swarm…' : 'Launch Investigation Swarm'}
          </button>
        </div>

        {/* ④ MANUAL ALERT TEST ──────────────────────────────── */}
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
          {/* Header — always shown */}
          <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: showManualTest ? `1px solid ${C.line}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FlaskConical size={15} style={{ color: '#a78bfa' }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: C.ink, textTransform: 'uppercase', letterSpacing: '.04em' }}>Manual Alert Test</span>
            </div>
            {/* Toggle button — looks like a real button */}
            <button
              onClick={() => setShowManualTest(!showManualTest)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, cursor: 'pointer', transition: 'all 150ms',
                background: showManualTest ? 'rgba(167,139,250,.15)' : C.surface2,
                border: `1px solid ${showManualTest ? 'rgba(167,139,250,.35)' : C.lineStr}`,
                color: showManualTest ? '#c4b5fd' : C.ink2,
                fontSize: 12, fontWeight: 700,
              }}
            >
              {showManualTest ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showManualTest ? 'Hide Test Panel' : 'Try Manually'}
            </button>
          </div>

          {showManualTest && (
            <div className="fade-in" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <p style={{ fontSize: 13, color: C.ink3, margin: 0, lineHeight: 1.6 }}>
                Simulate alert conditions to verify that threshold-based agent triggers fire correctly — without starting a full investigation run.
              </p>

              {/* Latency slider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: C.ink2 }}>Test Latency</label>
                  <span style={{ fontSize: 15, fontWeight: 900, color: manualLatency > 2000 ? '#f87171' : '#34d399', fontFamily: 'monospace' }}>{manualLatency} ms</span>
                </div>
                <input type="range" min={100} max={10000} step={100} value={manualLatency}
                  onChange={(e) => setManualLatency(Number(e.target.value))}
                  style={{ width: '100%', height: 6, cursor: 'pointer', accentColor: manualLatency > 2000 ? '#f87171' : '#10b981' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.ink4 }}>
                  <span>100ms</span>
                  <span style={{ color: manualLatency > 2000 ? '#f87171' : C.ink4 }}>⚠ Alert threshold: 2000ms</span>
                  <span>10s</span>
                </div>
              </div>

              {/* Error rate slider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: C.ink2 }}>Test Error Rate</label>
                  <span style={{ fontSize: 15, fontWeight: 900, color: manualErrorRate > 15 ? '#f87171' : '#34d399', fontFamily: 'monospace' }}>{manualErrorRate}%</span>
                </div>
                <input type="range" min={0} max={100} step={1} value={manualErrorRate}
                  onChange={(e) => setManualErrorRate(Number(e.target.value))}
                  style={{ width: '100%', height: 6, cursor: 'pointer', accentColor: manualErrorRate > 15 ? '#f87171' : '#10b981' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.ink4 }}>
                  <span>0%</span>
                  <span style={{ color: manualErrorRate > 15 ? '#f87171' : C.ink4 }}>⚠ Alert threshold: 15%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Status chips */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1, padding: '10px 14px', borderRadius: 10, background: manualLatency > 2000 ? C.negTint : C.posTint, border: `1px solid ${manualLatency > 2000 ? 'rgba(244,63,94,.3)' : 'rgba(16,185,129,.3)'}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: manualLatency > 2000 ? C.neg : C.pos }}>Latency</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: manualLatency > 2000 ? C.neg : C.pos, marginTop: 2 }}>
                    {manualLatency > 2000 ? '⚠ Breached' : '✓ OK'}
                  </div>
                </div>
                <div style={{ flex: 1, padding: '10px 14px', borderRadius: 10, background: manualErrorRate > 15 ? C.negTint : C.posTint, border: `1px solid ${manualErrorRate > 15 ? 'rgba(244,63,94,.3)' : 'rgba(16,185,129,.3)'}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: manualErrorRate > 15 ? C.neg : C.pos }}>Error Rate</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: manualErrorRate > 15 ? C.neg : C.pos, marginTop: 2 }}>
                    {manualErrorRate > 15 ? '⚠ Breached' : '✓ OK'}
                  </div>
                </div>
              </div>

              {/* Run test button */}
              <button
                id="manual-test-trigger-btn"
                onClick={runManualTest}
                disabled={manualTestLoading}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '13px 20px', borderRadius: 10,
                  background: manualTestLoading ? C.surface2 : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                  color: manualTestLoading ? C.ink4 : '#fff',
                  fontSize: 14, fontWeight: 800,
                  border: manualTestLoading ? `1px solid ${C.line}` : '1px solid rgba(255,255,255,.18)',
                  cursor: manualTestLoading ? 'not-allowed' : 'pointer',
                  boxShadow: manualTestLoading ? 'none' : '0 4px 20px rgba(124,58,237,.4), inset 0 1px 0 rgba(255,255,255,.12)',
                  textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 150ms',
                }}
              >
                <Bell size={15} />
                {manualTestLoading ? 'Running Alert Test…' : 'Run Manual Alert Test'}
              </button>

              {/* Result */}
              {manualTestResult && (
                <div className="fade-in" style={{ background: C.bg, border: `1px solid ${C.lineStr}`, borderRadius: 10, padding: '14px 16px', fontFamily: 'monospace', fontSize: 12.5, color: C.ink2, lineHeight: 1.8, whiteSpace: 'pre-line' }}>
                  {manualTestResult}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ⑤ NETWORK TOPOLOGY PREVIEW ───────────────────────── */}
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Globe size={15} style={{ color: C.info }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: C.ink, textTransform: 'uppercase', letterSpacing: '.04em' }}>Network Topology Preview</span>
            <div style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: 'rgba(16,185,129,.12)', color: '#34d399', border: '1px solid rgba(16,185,129,.22)' }}>
              User Instructions
            </div>
          </div>
          <div style={{ padding: '18px 18px 20px' }}>
            <div style={{ display: 'grid', gap: 12 }}>
              {[
                '1. Pick a scenario, then launch the investigation swarm so the topology can populate with live agent activity.',
                '2. Watch the steps on the left rail to see which agents are active, completed, or waiting for input.',
                '3. Use the incident timeline and main investigation view to inspect evidence, while this panel stays as a quick orientation guide.',
              ].map((line) => (
                <div
                  key={line}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'rgba(96,165,250,.05)',
                    border: `1px solid rgba(96,165,250,.12)`,
                  }}
                >
                  <div style={{ width: 22, height: 22, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'rgba(96,165,250,.15)', color: '#93c5fd', fontSize: 11, fontWeight: 800 }}>
                    i
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.65, color: C.ink2 }}>
                    {line}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.16)', color: C.ink3, fontSize: 12.5, lineHeight: 1.7 }}>
              This section is informational only. It does not change incident execution, data collection, or remediation behavior.
            </div>
          </div>
        </div>

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
    <div style={{ position: 'absolute', top: 14, right: 14, width: 250, background: 'rgba(8,12,20,.96)', border: `1px solid ${C.lineStr}`, borderRadius: 14, padding: '16px 18px', backdropFilter: 'blur(12px)', zIndex: 20, boxShadow: '0 8px 32px rgba(0,0,0,.5)' }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: C.ink2, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#60a5fa', boxShadow: '0 0 10px #60a5fa' }} />
        Agent Reasoning Active
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {SWARM_AGENTS.map((a) => {
          const isDone = completedNodes.includes(a.key)
          const isActive = activeAgent === NODE_TO_AGENT[a.key] || activeAgent === a.label
          const elapsed = agentTimes[a.label] ?? agentTimes[NODE_TO_AGENT[a.key]]
          return (
            <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.line}` }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0, background: isDone ? 'rgba(16,185,129,.2)' : isActive ? 'rgba(245,158,11,.2)' : C.surface2, color: isDone ? '#10b981' : isActive ? '#f59e0b' : C.ink4 }}>
                {isDone ? '✓' : isActive
                  ? <span style={{ display: 'inline-block', width: 11, height: 11, border: '2px solid rgba(245,158,11,.3)', borderTopColor: '#f59e0b', borderRadius: '50%', animation: 'cockpit-spin .8s linear infinite' }} />
                  : '○'}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, flex: 1, color: isDone ? C.ink4 : isActive ? C.ink : C.ink3 }}>{a.label}</div>
              <div style={{ fontSize: 11, color: isDone ? C.ink4 : isActive ? '#f59e0b' : C.ink4, fontFamily: 'monospace' }}>
                {isDone && elapsed != null ? `${elapsed}s` : isActive ? '…' : '—'}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ borderTop: `1px solid ${C.lineStr}`, marginTop: 14, paddingTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: C.ink3, fontWeight: 600 }}>Confidence</span>
          <span style={{ fontSize: 20, fontWeight: 900, color: '#10b981', fontFamily: 'monospace' }}>{confidence != null ? `${confidence}%` : '—'}</span>
        </div>
        {totalCostUsd > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 12, color: C.ink4 }}>Cost</span>
            <span style={{ fontSize: 12, color: '#10b981', fontFamily: 'monospace', fontWeight: 700 }}>${totalCostUsd.toFixed(4)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── BottomStrip ──────────────────────────────────────────────────────────────

function BottomStrip({ onApplyMitigation, isMitigating }: { onApplyMitigation: () => void; isMitigating: boolean }) {
  const { activeAgent, completedNodes, report } = useIncidentStore()
  const agentBadgeState = (key: string): 'idle' | 'active' | 'done' => {
    if (completedNodes.includes(key)) return 'done'
    if (activeAgent && NODE_TO_AGENT[key] === activeAgent) return 'active'
    return 'idle'
  }
  const canApply = !!report && !isMitigating
  const confidence = deriveConfidence(completedNodes)

  const BADGE_STYLES: Record<'idle' | 'active' | 'done', React.CSSProperties> = {
    idle:   { background: C.surface2, color: C.ink3, border: `1px solid ${C.line}` },
    done:   { background: 'rgba(16,185,129,.1)', color: '#34d399', border: '1px solid rgba(16,185,129,.2)' },
    active: { background: 'rgba(245,158,11,.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,.2)' },
  }

  return (
    <div style={{ background: C.surface, borderTop: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 10, overflow: 'hidden', flexShrink: 0 }}>
      {(['triage', 'rag_search', 'rca', 'remediation'] as const).map((key, i) => {
        const state = agentBadgeState(key)
        const labels = ['Triage', 'RAG Lookup', 'Root Cause', 'Remediation']
        const prefix = state === 'done' ? '✓ ' : state === 'active' ? '⟳ ' : '○ '
        return (
          <div key={key} style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 12px', borderRadius: 10, ...BADGE_STYLES[state] }}>
            {prefix}{labels[i]}
          </div>
        )
      })}

      <div style={{ flex: 1 }} />

      <div style={{ fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 10, fontFamily: 'monospace', border: `1px solid ${confidence != null ? 'rgba(16,185,129,.28)' : C.line}`, background: confidence != null ? 'rgba(16,185,129,.1)' : C.surface2, color: confidence != null ? '#10b981' : C.ink3 }}>
        {confidence != null ? `${confidence}% CONFIDENCE` : 'WAITING FOR DATA'}
      </div>

      <button
        id="apply-mitigation-btn"
        onClick={onApplyMitigation}
        disabled={!canApply}
        title={canApply ? 'Apply autonomous remediation patch' : 'Waiting for investigation report…'}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 13, fontWeight: 800, padding: '10px 22px', borderRadius: 10,
          background: canApply ? 'linear-gradient(135deg, #059669, #047857)' : C.surface2,
          color: canApply ? '#fff' : C.ink4,
          border: canApply ? '1px solid rgba(255,255,255,.18)' : `1px solid ${C.line}`,
          cursor: canApply ? 'pointer' : 'not-allowed',
          boxShadow: canApply ? '0 4px 20px rgba(5,150,105,.38), inset 0 1px 0 rgba(255,255,255,.12)' : 'none',
          textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 150ms',
        }}
      >
        <ShieldCheck size={14} />
        {isMitigating ? 'Executing…' : 'Apply Autonomous Mitigation'}
      </button>
    </div>
  )
}

// ─── AgentSwarmCockpit ────────────────────────────────────────────────────────

export function AgentSwarmCockpit(props: AgentSwarmCockpitProps) {
  const { status, report, graphNodes, graphLinks } = useIncidentStore()
  const activeStep = deriveActiveStep(status, props.loadingAnalysis, report, props.isMitigating)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gridTemplateRows: '1fr 58px', height: 'calc(100vh - 64px)', background: C.bg, overflow: 'hidden' }}>
      {/* Left Rail — spans both rows */}
      <div style={{ gridRow: '1 / 3' }}>
        <LeftRail
          activeStep={activeStep}
          vendorHealth={props.previewIncident.vendorHealth}
          cockpitLocked={props.cockpitLocked}
          openrouterKey={props.openrouterKey} setOpenrouterKey={props.setOpenrouterKey}
          tavilyKey={props.tavilyKey} setTavilyKey={props.setTavilyKey}
          llmModel={props.llmModel} setLlmModel={props.setLlmModel}
        />
      </div>

      {/* Main content */}
      <div style={{ overflow: 'hidden', position: 'relative' }}>
        {activeStep <= 2 ? (
          <ScenarioPicker
            scenarios={props.scenarios}
            selectedScenarioType={props.selectedScenarioType}
            onScenarioChange={props.onScenarioChange}
            telemetryMode={props.telemetryMode}
            onTelemetryModeChange={props.onTelemetryModeChange}
            onLaunch={props.onLaunch}
            onFileUpload={props.onUploadData}
            manualDescription={props.manualDescription}
            setManualDescription={props.setManualDescription}
            loading={props.loading}
            loadingAnalysis={props.loadingAnalysis}
            cockpitLocked={props.cockpitLocked}
            previewIncident={props.previewIncident}
          />
        ) : (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <RootCauseGraph nodes={graphNodes} links={graphLinks} />
            <SwarmOverlay />
          </div>
        )}
      </div>

      {/* Bottom strip */}
      <BottomStrip onApplyMitigation={props.onApplyMitigation} isMitigating={props.isMitigating} />
    </div>
  )
}
