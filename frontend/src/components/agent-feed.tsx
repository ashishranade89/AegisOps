import { useState } from 'react'
import type { TimelineEvent, AgentCost } from '@/stores/incident-store'
import { ChevronDown, ChevronRight, Clock, Hash, Cpu, Zap, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react'

/* ── Colour coding per event type ───────────────────────── */
function typeStyle(type: string): { dot: string; label: string; badge?: string; badgeBg?: string } {
  if (type === 'phase_change')  return { dot: 'var(--primary-accent)', label: 'var(--primary-accent)', badge: 'PHASE',  badgeBg: 'color-mix(in oklab, var(--primary-accent) 12%, transparent)' }
  if (type === 'agent_start')   return { dot: 'var(--info)',           label: 'var(--ink)',             badge: 'START',  badgeBg: 'var(--info-tint)' }
  if (type === 'agent_end')     return { dot: 'var(--positive)',       label: 'var(--ink)',             badge: 'END',    badgeBg: 'var(--positive-tint)' }
  if (type === 'tool_start')    return { dot: 'var(--ink-4)',          label: 'var(--ink-2)',           badge: 'TOOL↑',  badgeBg: 'var(--surface-2)' }
  if (type === 'tool_end')      return { dot: 'var(--ink-3)',          label: 'var(--ink-2)',           badge: 'TOOL↓',  badgeBg: 'var(--surface-2)' }
  if (type === 'handoff')       return { dot: 'var(--warn)',           label: 'var(--ink)',             badge: 'HANDOFF',badgeBg: 'var(--warn-tint)' }
  if (type === 'error')         return { dot: 'var(--negative)',       label: 'var(--negative)',        badge: 'ERROR',  badgeBg: 'var(--negative-tint)' }
  if (type === 'done')          return { dot: 'var(--positive)',       label: 'var(--positive)',        badge: 'DONE',   badgeBg: 'var(--positive-tint)' }
  return                               { dot: 'var(--line-strong)',    label: 'var(--ink-3)' }
}

/* ── Build a human-readable summary line ────────────────── */
function summary(e: TimelineEvent): string {
  switch (e.type) {
    case 'agent_start':   return `${e.agent_name ?? 'Agent'} started`
    case 'agent_end':     return `${e.agent_name ?? 'Agent'} completed`
    case 'tool_start':    return `Invoking: ${e.detail ?? '—'}`
    case 'tool_end':      return `Output: ${e.detail ?? '—'}`
    case 'handoff':       return e.detail ?? 'Agent handoff'
    case 'phase_change':  return `Phase → ${e.phase ?? '—'}`
    case 'done':          return 'Investigation completed'
    case 'error':         return 'Pipeline error'
    default:              return e.type
  }
}

/* ── Full detail body ────────────────────────────────────── */
function detailBody(e: TimelineEvent): string | null {
  const parts: string[] = []
  if (e.agent_name && (e.type === 'agent_end' || e.type === 'agent_start'))
    parts.push(`Agent: ${e.agent_name}`)
  if (e.detail && e.type !== 'tool_start' && e.type !== 'tool_end')
    parts.push(e.detail)
  else if (e.detail)
    parts.push(e.detail)
  if (e.message)
    parts.push(e.message)
  return parts.length ? parts.join('\n\n') : null
}

/* ── Derive rich technical metadata from a timeline event ── */
function buildMetadata(e: TimelineEvent, agentCost?: AgentCost): Array<{ key: string; value: string; color?: string }> {
  const meta: Array<{ key: string; value: string; color?: string }> = []

  // Timestamp in ISO format
  meta.push({ key: 'Timestamp', value: new Date(e.timestamp).toISOString() })

  // Event type
  meta.push({ key: 'Event Type', value: e.type })

  // Agent info
  if (e.agent_name) {
    meta.push({ key: 'Agent Name', value: e.agent_name })
  }

  // Phase
  if (e.phase) {
    meta.push({ key: 'Pipeline Phase', value: e.phase.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) })
  }

  // Cost
  if (agentCost?.cost_usd) {
    meta.push({ key: 'Token Cost', value: `$${agentCost.cost_usd.toFixed(6)} USD`, color: 'var(--positive)' })
  }
  if (agentCost?.input_tokens) {
    meta.push({ key: 'Input Tokens', value: agentCost.input_tokens.toLocaleString() })
  }
  if (agentCost?.output_tokens) {
    meta.push({ key: 'Output Tokens', value: agentCost.output_tokens.toLocaleString() })
  }
  // Sequence number based on event array index — derived externally
  // Error flag
  if (e.type === 'error') {
    meta.push({ key: 'Severity', value: 'CRITICAL — Pipeline Halted', color: 'var(--negative)' })
  }

  // Done confirmation
  if (e.type === 'done') {
    meta.push({ key: 'Status', value: 'Investigation Successfully Completed', color: 'var(--positive)' })
  }

  if (e.type === 'tool_start') {
    meta.push({ key: 'Tool Invocation', value: e.detail ?? '—', color: 'var(--info)' })
  }
  if (e.type === 'tool_end') {
    meta.push({ key: 'Tool Result', value: (e.detail ?? '—').length > 200 ? (e.detail ?? '').slice(0, 200) + '…' : (e.detail ?? '—') })
  }

  if (e.type === 'handoff') {
    meta.push({ key: 'Handoff Target', value: e.detail ?? 'Next Agent in Pipeline' })
  }

  return meta
}

function TraceItemRow({ event, agentCost, index }: { event: TimelineEvent; agentCost?: AgentCost; index: number }) {
  // Auto-expand agent_end, phase_change, handoff, error events that have detail
  const autoOpen = (event.type === 'agent_end' || event.type === 'phase_change' || event.type === 'handoff' || event.type === 'error') && !!event.detail
  const [open, setOpen] = useState(autoOpen)
  const [showRaw, setShowRaw] = useState(false)
  const ts = typeStyle(event.type)
  const body = detailBody(event)
  const isExpandable = true // Always expandable to show metadata
  const metadata = buildMetadata(event, agentCost)

  const summaryText = summary(event)
  const TRUNCATE = 80
  const isTruncated = summaryText.length > TRUNCATE

  return (
    <div className="trace-item fade-in" style={{ cursor: 'pointer' }}
      onClick={() => setOpen(o => !o)}
    >
      <span className="trace-dot" style={{ background: ts.dot, borderColor: ts.dot }} />

      <div className="trace-header" style={{ gap: 5 }}>
        {/* Badge */}
        {ts.badge && (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
            padding: '1px 5px', borderRadius: 3,
            color: ts.label, background: ts.badgeBg,
            flexShrink: 0,
          }}>
            {ts.badge}
          </span>
        )}

        {/* Sequence number */}
        <span style={{ fontSize: 8, fontWeight: 600, color: 'var(--ink-4)', fontFamily: 'monospace', flexShrink: 0, background: 'var(--surface-2)', padding: '1px 4px', borderRadius: 3 }}>
          #{index + 1}
        </span>

        {/* Summary label */}
        <span
          className="trace-title"
          style={{
            color: ts.label,
            flex: 1,
            overflow: 'hidden',
            textOverflow: open ? 'clip' : 'ellipsis',
            whiteSpace: open ? 'normal' : 'nowrap',
          }}
          title={isTruncated ? summaryText : undefined}
        >
          {summaryText}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          {agentCost && agentCost.cost_usd > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 600, color: 'var(--positive)',
              background: 'var(--positive-tint)', padding: '1px 5px',
              borderRadius: 3, border: '1px solid var(--positive)',
              fontFamily: 'var(--font-mono)',
            }}>
              ${agentCost.cost_usd < 0.0001 ? '<0.0001' : agentCost.cost_usd.toFixed(4)}
            </span>
          )}
          <span className="trace-time">
            {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          {open
            ? <ChevronDown size={11} style={{ color: 'var(--ink-4)' }} />
            : <ChevronRight size={11} style={{ color: 'var(--ink-4)' }} />
          }
        </div>
      </div>

      {/* Expanded metadata panel */}
      {open && (
        <div
          className="fade-in"
          style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}
          onClick={(ev) => ev.stopPropagation()}
        >
          {/* Technical Metadata Table */}
          <div style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--line)',
            borderRadius: 6,
            overflow: 'hidden',
          }}>
            {/* Metadata Header */}
            <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Hash size={10} style={{ color: 'var(--ink-4)' }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Diagnostic Metadata
              </span>
            </div>
            {/* Metadata rows */}
            <div style={{ padding: '4px 0' }}>
              {metadata.map((m) => (
                <div key={m.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 10px', borderBottom: '1px solid var(--line)' }}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--ink-4)', flexShrink: 0, width: 96, fontFamily: 'var(--font-mono)' }}>{m.key}</span>
                  <ArrowRight size={9} style={{ color: 'var(--ink-4)', marginTop: 1, flexShrink: 0 }} />
                  <span style={{ fontSize: 9, color: m.color ?? 'var(--ink-2)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all', lineHeight: 1.4 }}>{m.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Raw detail text — if exists */}
          {body && (
            <div>
              <button
                type="button"
                onClick={() => setShowRaw(!showRaw)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 600, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 4 }}
              >
                {showRaw ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                {showRaw ? 'Hide Raw Output' : 'Show Raw Output'}
              </button>
              {showRaw && (
                <pre
                  className="trace-body mono fade-in"
                  style={{
                    marginTop: 0,
                    fontSize: 10.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: 320,
                    overflowY: 'auto',
                    lineHeight: 1.5,
                    color: event.type === 'error' ? 'var(--negative)' : 'var(--ink-2)',
                    background: event.type === 'error' ? 'var(--negative-tint)' : 'var(--surface-2)',
                    borderColor: event.type === 'error' ? 'rgba(158,58,55,0.25)' : 'var(--line)',
                  }}
                >
                  {body}
                </pre>
              )}
            </div>
          )}

          {/* Diagnostic status pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {event.type === 'agent_end' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 600, color: 'var(--positive)', background: 'var(--positive-tint)', padding: '2px 8px', borderRadius: 10 }}>
                <CheckCircle2 size={9} /> Step completed successfully
              </span>
            )}
            {event.type === 'agent_start' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 600, color: 'var(--info)', background: 'var(--info-tint)', padding: '2px 8px', borderRadius: 10 }}>
                <Cpu size={9} /> Agent dispatched to pipeline
              </span>
            )}
            {event.type === 'tool_start' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 600, color: 'var(--warn)', background: 'var(--warn-tint)', padding: '2px 8px', borderRadius: 10 }}>
                <Zap size={9} /> Tool execution in progress
              </span>
            )}
            {event.type === 'error' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 600, color: 'var(--negative)', background: 'var(--negative-tint)', padding: '2px 8px', borderRadius: 10 }}>
                <AlertTriangle size={9} /> Pipeline error — manual review required
              </span>
            )}
            <span style={{ fontSize: 8, color: 'var(--ink-4)', fontFamily: 'monospace' }}>
              <Clock size={8} style={{ display: 'inline', marginRight: 3 }} />
              {new Date(event.timestamp).toISOString()}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

interface AgentFeedProps {
  events: TimelineEvent[]
  agentCosts?: Record<string, AgentCost>
}

export function AgentFeed({ events, agentCosts = {} }: AgentFeedProps) {
  if (events.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--ink-4)', padding: '40px 16px', fontSize: 12.5 }}>
        <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.4 }}>📡</div>
        Awaiting pipeline events...
        <div style={{ fontSize: 10, marginTop: 8, color: 'var(--ink-4)' }}>Click any event to expand technical metadata</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ padding: '8px 12px 4px', fontSize: 9, fontWeight: 600, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'flex', alignItems: 'center', gap: 5 }}>
        <Zap size={9} />
        {events.length} events — click any to expand metadata
      </div>
      <div className="trace-timeline">
        {events.map((event, i) => {
          const cost = event.type === 'agent_end' && event.agent_name
            ? agentCosts[event.agent_name]
            : undefined
          return (
            <TraceItemRow
              key={`${event.type}-${event.timestamp}-${i}`}
              event={event}
              agentCost={cost}
              index={i}
            />
          )
        })}
      </div>
    </div>
  )
}
