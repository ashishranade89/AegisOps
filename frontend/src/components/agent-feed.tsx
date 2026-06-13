import { useState } from 'react'
import type { TimelineEvent, AgentCost } from '@/stores/incident-store'
import { ChevronDown, ChevronRight } from 'lucide-react'

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
  // Collect all meaningful content fields
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

function TraceItemRow({ event, agentCost }: { event: TimelineEvent; agentCost?: AgentCost }) {
  // Auto-expand agent_end, phase_change, handoff, error events that have detail
  const autoOpen = (event.type === 'agent_end' || event.type === 'phase_change' || event.type === 'handoff' || event.type === 'error') && !!event.detail
  const [open, setOpen] = useState(autoOpen)
  const ts = typeStyle(event.type)
  const body = detailBody(event)
  const isExpandable = !!body && body.trim().length > 0

  const summaryText = summary(event)
  const TRUNCATE = 80
  const isTruncated = summaryText.length > TRUNCATE

  return (
    <div className="trace-item fade-in" style={{ cursor: isExpandable ? 'pointer' : 'default' }}
      onClick={() => isExpandable && setOpen(o => !o)}
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
          {isExpandable && (
            open
              ? <ChevronDown size={11} style={{ color: 'var(--ink-4)' }} />
              : <ChevronRight size={11} style={{ color: 'var(--ink-4)' }} />
          )}
        </div>
      </div>

      {/* Expanded body */}
      {isExpandable && open && (
        <pre
          className="trace-body mono"
          style={{
            marginTop: 6,
            fontSize: 11,
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
      </div>
    )
  }

  return (
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
          />
        )
      })}
    </div>
  )
}
