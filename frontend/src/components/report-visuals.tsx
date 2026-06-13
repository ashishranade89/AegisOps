import type { ApprovalContext, BrowserResult } from '@/stores/incident-store'

/* ── Hypothesis confidence bar chart ───────────────────────────────────── */

interface HypothesisChartProps {
  hypotheses: Array<{ label: string; confidence: number; rationale: string[] }>
}

const LABEL_COLORS: Record<string, string> = {
  vendor:        'var(--negative)',
  application:   'var(--warn)',
  infrastructure:'var(--info)',
  network:       'var(--primary-accent)',
  configuration: 'var(--positive)',
  unknown:       'var(--ink-4)',
}

export function HypothesisChart({ hypotheses }: HypothesisChartProps) {
  if (!hypotheses || hypotheses.length === 0) return null
  const sorted = [...hypotheses].sort((a, b) => b.confidence - a.confidence)

  const BAR_HEIGHT = 26
  const GAP = 10
  const LABEL_W = 110
  const BAR_MAX = 220
  const svgH = sorted.length * (BAR_HEIGHT + GAP) + 20

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--ink-4)', textTransform: 'uppercase', marginBottom: 10 }}>
        Root Cause Hypotheses
      </div>
      <svg viewBox={`0 0 ${LABEL_W + BAR_MAX + 60} ${svgH}`} style={{ width: '100%', maxWidth: 440, display: 'block', overflow: 'visible' }}>
        {sorted.map((h, i) => {
          const y = i * (BAR_HEIGHT + GAP) + 10
          const barW = Math.round(h.confidence * BAR_MAX)
          const pct = Math.round(h.confidence * 100)
          const color = LABEL_COLORS[h.label] ?? 'var(--ink-3)'
          return (
            <g key={h.label}>
              {/* Label */}
              <text x={LABEL_W - 6} y={y + BAR_HEIGHT / 2 + 4}
                textAnchor="end"
                fill="var(--ink-2)"
                style={{ fontSize: 11, fontFamily: 'var(--font-ui)', fontWeight: 500 }}
              >
                {h.label}
              </text>
              {/* Track */}
              <rect x={LABEL_W} y={y} width={BAR_MAX} height={BAR_HEIGHT} rx={4}
                fill="var(--surface-2)" stroke="var(--line)" strokeWidth={1}
              />
              {/* Fill */}
              <rect x={LABEL_W} y={y} width={barW} height={BAR_HEIGHT} rx={4}
                fill={color} opacity={0.85}
                style={{ transition: 'width 600ms ease' }}
              />
              {/* Percent label */}
              <text x={LABEL_W + barW + 6} y={y + BAR_HEIGHT / 2 + 4}
                fill="var(--ink-3)"
                style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', fontWeight: 600 }}
              >
                {pct}%
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}


/* ── Investigation Mind Map ─────────────────────────────────────────────── */

interface MindMapProps {
  context: ApprovalContext
  browserResult?: BrowserResult | null
  runId?: string | null
  scenario?: string
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) {
      if (cur) lines.push(cur)
      cur = w
    } else {
      cur = cur ? cur + ' ' + w : w
    }
  }
  if (cur) lines.push(cur)
  return lines
}

function nodeBox(
  x: number, y: number, lines: string[], color: string, isCenter = false
) {
  const lineH = 14
  const padX = isCenter ? 14 : 10
  const padY = isCenter ? 10 : 7
  const boxW = isCenter ? 130 : 120
  const boxH = lines.length * lineH + padY * 2
  return { x, y, lines, color, isCenter, padX, padY, boxW, boxH, lineH }
}

type Box = ReturnType<typeof nodeBox>

function BoxEl({ b }: { b: Box }) {
  return (
    <g>
      <rect
        x={b.x - b.boxW / 2} y={b.y - b.boxH / 2}
        width={b.boxW} height={b.boxH}
        rx={b.isCenter ? 10 : 6}
        fill={`color-mix(in oklab, ${b.color} 12%, var(--surface))`}
        stroke={b.color} strokeWidth={b.isCenter ? 2 : 1.5}
      />
      {b.lines.map((line, i) => (
        <text
          key={i}
          x={b.x}
          y={b.y - ((b.lines.length - 1) * b.lineH) / 2 + i * b.lineH + 4}
          textAnchor="middle"
          fill={b.isCenter ? b.color : 'var(--ink)'}
          style={{
            fontSize: b.isCenter ? 12 : 10.5,
            fontWeight: b.isCenter ? 700 : 500,
            fontFamily: 'var(--font-ui)',
          }}
        >
          {line}
        </text>
      ))}
    </g>
  )
}

function EdgeLine({ from, to, color }: { from: Box; to: Box; color: string }) {
  const x1 = from.x
  const y1 = from.y
  const x2 = to.x
  const y2 = to.y
  const mx = (x1 + x2) / 2
  const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
  return <path d={d} fill="none" stroke={color} strokeWidth={1.5} opacity={0.6} />
}

export function InvestigationMindMap({ context, browserResult, runId, scenario }: MindMapProps) {
  const vendor = context.suspected_vendor || 'Unknown'
  const severity = context.severity || 'Unknown'
  const rootCause = context.root_cause
    ? truncate(context.root_cause, 45)
    : 'Investigating...'

  const W = 700
  const H = 380
  const cx = W / 2
  const cy = H / 2

  // Center node
  const center = nodeBox(cx, cy, ['Incident', scenario ? truncate(scenario.replace(/_/g, ' '), 16) : (runId ? `#${runId.slice(-8)}` : 'Investigation')], 'var(--primary-accent)', true)

  // Branch nodes (arranged around center)
  const vendorNode    = nodeBox(cx - 240, cy - 90, ['Vendor', vendor], 'var(--negative)')
  const severityNode  = nodeBox(cx - 240, cy + 90, ['Severity', severity], 'var(--warn)')
  const rcaNode       = nodeBox(cx + 240, cy - 90, ['Root Cause', ...wrapText(rootCause, 16)], 'var(--info)')
  const evidenceNode  = nodeBox(cx, cy - 150, ['Evidence', browserResult?.source === 'stagehand_browser' ? 'AI Browser' : browserResult ? 'Status API' : 'Analysis'], 'var(--positive)')
  const remNode       = nodeBox(cx + 240, cy + 90, ['Resolution', 'Remediation Plan'], 'var(--positive)')

  // Sub-nodes
  const top1 = context.hypotheses?.[0]
    ? nodeBox(cx + 240, cy - 180, [context.hypotheses[0].label, `${Math.round(context.hypotheses[0].confidence * 100)}% conf.`], 'var(--info)')
    : null
  const vendorSub = browserResult?.data.has_active_incident
    ? nodeBox(cx - 240, cy - 180, ['Status', 'Active Incident'], 'var(--negative)')
    : null

  const allNodes: Box[] = [center, vendorNode, severityNode, rcaNode, evidenceNode, remNode, ...(top1 ? [top1] : []), ...(vendorSub ? [vendorSub] : [])]
  const edges: Array<{ from: Box; to: Box; color: string }> = [
    { from: center, to: vendorNode,   color: 'var(--negative)' },
    { from: center, to: severityNode, color: 'var(--warn)' },
    { from: center, to: rcaNode,      color: 'var(--info)' },
    { from: center, to: evidenceNode, color: 'var(--positive)' },
    { from: center, to: remNode,      color: 'var(--positive)' },
    ...(top1 ? [{ from: rcaNode, to: top1, color: 'var(--info)' }] : []),
    ...(vendorSub ? [{ from: vendorNode, to: vendorSub, color: 'var(--negative)' }] : []),
  ]

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--ink-4)', textTransform: 'uppercase', marginBottom: 10 }}>
        Investigation Mind Map
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', maxWidth: W, display: 'block', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--line)' }}
      >
        {edges.map((e, i) => <EdgeLine key={i} {...e} />)}
        {allNodes.map((n, i) => <BoxEl key={i} b={n} />)}
      </svg>
    </div>
  )
}
