import { useEffect, useState } from 'react'
import { BarChart3, RefreshCw, DollarSign, Clock, Activity, AlertTriangle } from 'lucide-react'
import {
  getAnalyticsTrends,
  getAnalyticsCost,
  type TrendsResponse,
  type CostReportResponse,
} from '@/lib/api'

// ─── formatting helpers ───────────────────────────────────────────────────────

function fmtDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

function fmtUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`
  if (n >= 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(6)}`
}

const COLORS = ['#2563EB', '#F43F5E', '#a855f7', '#f59e0b', '#10b981', '#06b6d4', '#ec4899']

// ─── primitives ───────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px',
      padding: '1.25rem', ...style,
    }}>
      {children}
    </div>
  )
}

function SectionTitle({ icon: Icon, children }: { icon: typeof BarChart3; children: React.ReactNode }) {
  return (
    <h2 style={{ margin: '0 0 1rem', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>
      <Icon size={14} /> {children}
    </h2>
  )
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '0.35rem', color: color ?? 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.2rem' }}>{sub}</div>}
    </Card>
  )
}

/** Horizontal bar list — label left, proportional bar, value right. */
function BarList({ rows, color }: { rows: Array<{ label: string; value: number; display: string }>; color?: (i: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {rows.map((r, i) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '30%', minWidth: 0, fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</div>
          <div style={{ flex: 1, background: 'var(--bg)', borderRadius: '6px', height: '1.1rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{
              width: `${Math.max((r.value / max) * 100, 2)}%`, height: '100%',
              background: color ? color(i) : 'var(--primary-accent, #2563EB)', borderRadius: '6px', transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ width: '70px', textAlign: 'right', fontSize: '0.78rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{r.display}</div>
        </div>
      ))}
    </div>
  )
}

/** 24-bucket time-of-day histogram as inline SVG. */
function HourHistogram({ data }: { data: number[] }) {
  const max = Math.max(...data, 1)
  const W = 100, H = 36, barW = W / 24
  return (
    <svg viewBox={`0 0 ${W} ${H + 8}`} style={{ width: '100%', height: 'auto' }} preserveAspectRatio="none">
      {data.map((v, h) => {
        const bh = (v / max) * H
        return (
          <rect key={h} x={h * barW + 0.4} y={H - bh} width={barW - 0.8} height={bh}
            fill="var(--primary-accent, #2563EB)" rx={0.6}>
            <title>{`${h}:00 — ${v} incident${v === 1 ? '' : 's'}`}</title>
          </rect>
        )
      })}
      {[0, 6, 12, 18].map((h) => (
        <text key={h} x={h * barW} y={H + 6} fontSize={3} fill="var(--muted)">{h}h</text>
      ))}
    </svg>
  )
}

/** Daily cost trend as inline SVG area/line. */
function CostTrend({ data }: { data: Array<{ date: string; cost_usd: number }> }) {
  if (data.length === 0) return <Empty text="No cost data in this window" />
  const max = Math.max(...data.map((d) => d.cost_usd), 0.000001)
  const W = 100, H = 40
  const step = data.length > 1 ? W / (data.length - 1) : 0
  const pts = data.map((d, i) => `${i * step},${H - (d.cost_usd / max) * H}`)
  const linePath = `M ${pts.join(' L ')}`
  const areaPath = `${linePath} L ${W},${H} L 0,${H} Z`
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '120px' }} preserveAspectRatio="none">
        <path d={areaPath} fill="color-mix(in srgb, var(--primary-accent, #2563EB) 18%, transparent)" />
        <path d={linePath} fill="none" stroke="var(--primary-accent, #2563EB)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
        <span>{data[0].date}</span>
        <span>peak {fmtUsd(max)}/day</span>
        <span>{data[data.length - 1].date}</span>
      </div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', padding: '1.5rem 0' }}>{text}</p>
}

// ─── page ─────────────────────────────────────────────────────────────────────

const WINDOWS = [7, 30, 90]

export function AnalyticsPage() {
  const [trends, setTrends] = useState<TrendsResponse | null>(null)
  const [cost, setCost] = useState<CostReportResponse | null>(null)
  const [windowDays, setWindowDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load(win = windowDays) {
    setLoading(true)
    setError(null)
    try {
      const [t, c] = await Promise.all([getAnalyticsTrends(), getAnalyticsCost(win)])
      setTrends(t)
      setCost(c)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function changeWindow(win: number) {
    setWindowDays(win)
    load(win)
  }

  const noData = !loading && trends?.total_runs === 0

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Analytics</h1>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
            Incident trends and LLM cost reporting across all past runs
          </p>
        </div>
        <button className="icon-btn" onClick={() => load()} title="Refresh" disabled={loading}>
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
        </button>
      </div>

      {error && (
        <div style={{ background: 'color-mix(in srgb, var(--negative) 12%, transparent)', border: '1px solid var(--negative)', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--negative)' }}>
          {error}
        </div>
      )}

      {noData && !error && (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '1px dashed var(--border)', borderRadius: '12px' }}>
          <BarChart3 size={32} style={{ color: 'var(--muted)', marginBottom: '0.75rem' }} />
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>No analytics yet</p>
          <p style={{ margin: '0.3rem 0 0', color: 'var(--muted)', fontSize: '0.78rem' }}>
            Run a few incidents — vendor trends and cost reports will populate here automatically.
          </p>
        </div>
      )}

      {!noData && (
        <>
          {/* ── Cost reporting ── */}
          <SectionTitle icon={DollarSign}>Cost Reporting</SectionTitle>

          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <StatCard label="Total Spend" value={cost ? fmtUsd(cost.total_cost_usd) : '—'} sub={`${cost?.run_count ?? 0} runs`} color="#10b981" />
            <StatCard label="Avg / Run" value={cost ? fmtUsd(cost.avg_cost_per_run) : '—'} />
            <StatCard label="Top Agent" value={cost?.most_expensive_agent ?? '—'} sub="most expensive" color="#F43F5E" />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <Card style={{ flex: '1 1 320px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Cost over time</span>
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  {WINDOWS.map((w) => (
                    <button key={w} onClick={() => changeWindow(w)}
                      style={{
                        padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer',
                        border: '1px solid var(--border)',
                        background: windowDays === w ? 'var(--primary-accent)' : 'var(--bg)',
                        color: windowDays === w ? '#fff' : 'var(--muted)',
                      }}>{w}d</button>
                  ))}
                </div>
              </div>
              <CostTrend data={cost?.cost_over_time ?? []} />
            </Card>

            <Card style={{ flex: '1 1 320px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '1rem' }}>Cost by agent</span>
              {cost && cost.by_agent.length > 0 ? (
                <BarList
                  color={(i) => COLORS[i % COLORS.length]}
                  rows={cost.by_agent.map((a) => ({ label: a.agent, value: a.cost_usd, display: fmtUsd(a.cost_usd) }))}
                />
              ) : <Empty text="No agent cost data yet" />}
            </Card>
          </div>

          {/* ── Incident trends ── */}
          <SectionTitle icon={Activity}>Incident Trends</SectionTitle>

          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <StatCard label="Total Incidents" value={String(trends?.total_runs ?? 0)} />
            <StatCard label="Avg MTTR" value={fmtDuration(trends?.overall_mttr_seconds.mean ?? 0)} sub={`median ${fmtDuration(trends?.overall_mttr_seconds.median ?? 0)}`} color="#f59e0b" />
            <StatCard label="Top Vendor" value={trends?.vendor_frequency[0]?.vendor ?? '—'} sub={trends?.vendor_frequency[0] ? `${trends.vendor_frequency[0].count} incidents` : undefined} color="#a855f7" />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <Card style={{ flex: '1 1 320px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
                <AlertTriangle size={13} /> Incidents by vendor
              </span>
              {trends && trends.vendor_frequency.length > 0 ? (
                <BarList
                  color={(i) => COLORS[i % COLORS.length]}
                  rows={trends.vendor_frequency.map((v) => ({
                    label: v.vendor,
                    value: v.count,
                    display: v.failures > 0 ? `${v.count} (${Math.round(v.failure_rate * 100)}% fail)` : String(v.count),
                  }))}
                />
              ) : <Empty text="No vendor data yet" />}
            </Card>

            <Card style={{ flex: '1 1 320px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
                <Clock size={13} /> Mean time to resolve by vendor
              </span>
              {trends && trends.mttr_by_vendor.length > 0 ? (
                <BarList
                  color={() => '#f59e0b'}
                  rows={trends.mttr_by_vendor.map((v) => ({ label: v.vendor, value: v.mean_seconds, display: fmtDuration(v.mean_seconds) }))}
                />
              ) : <Empty text="No resolution-time data yet" />}
            </Card>
          </div>

          <Card>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '1rem' }}>Incidents by hour of day</span>
            {trends ? <HourHistogram data={trends.time_of_day} /> : <Empty text="No data" />}
          </Card>
        </>
      )}
    </div>
  )
}
