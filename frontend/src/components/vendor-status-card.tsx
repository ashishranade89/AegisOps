import { Globe, AlertTriangle, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react'
import type { BrowserResult } from '@/stores/incident-store'

interface VendorStatusCardProps {
  result: BrowserResult
}

function statusColor(current_status?: string): string {
  if (!current_status || current_status === 'none' || current_status === 'operational') return 'var(--positive)'
  if (current_status === 'minor') return 'var(--warn)'
  if (current_status === 'degraded_performance' || current_status === 'partial_outage') return 'var(--warn)'
  return 'var(--negative)'
}

function statusLabel(current_status?: string): string {
  if (!current_status || current_status === 'none') return 'Operational'
  if (current_status === 'operational') return 'Operational'
  if (current_status === 'degraded_performance') return 'Degraded Performance'
  if (current_status === 'partial_outage') return 'Partial Outage'
  if (current_status === 'major_outage') return 'Major Outage'
  if (current_status === 'minor') return 'Minor Issues'
  return current_status.replace(/_/g, ' ')
}

function sourceLabel(source: string): string {
  if (source === 'stagehand_browser') return 'AI Browser (Stagehand)'
  if (source === 'statuspage_api') return 'Live Statuspage API'
  return 'Simulated data'
}

export function VendorStatusCard({ result }: VendorStatusCardProps) {
  const d = result.data
  const color = statusColor(d.current_status)
  const isDown = d.has_active_incident
  const vendorName = result.vendor.charAt(0).toUpperCase() + result.vendor.slice(1)

  return (
    <div
      id="section-browser-result"
      className="card"
      style={{ padding: 0, overflow: 'hidden', border: `1px solid ${isDown ? 'rgba(239,68,68,0.25)' : 'var(--line)'}` }}
    >
      {/* Browser chrome bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        background: 'var(--surface-2)',
        borderBottom: '1px solid var(--line)',
      }}>
        <Globe size={13} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
        <div style={{
          flex: 1,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 4,
          padding: '3px 10px',
          fontSize: 11,
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-mono)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {result.url}
        </div>
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--ink-4)', flexShrink: 0 }}
          title="Open in browser"
        >
          <ExternalLink size={12} />
        </a>
        <span style={{
          fontSize: 9,
          fontWeight: 600,
          color: 'var(--ink-4)',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 3,
          padding: '2px 6px',
          flexShrink: 0,
          letterSpacing: '0.04em',
        }}>
          {sourceLabel(result.source)}
        </span>
      </div>

      {/* Status page content */}
      <div style={{ padding: '16px 18px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>
              {vendorName} Status Page
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: color,
                boxShadow: isDown ? `0 0 6px ${color}` : 'none',
                animation: isDown ? 'pulse 1.5s ease-in-out infinite' : 'none',
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, color }}>{statusLabel(d.current_status)}</span>
            </div>
          </div>
          {isDown ? (
            <AlertTriangle size={20} style={{ color: 'var(--negative)', flexShrink: 0 }} />
          ) : (
            <CheckCircle size={20} style={{ color: 'var(--positive)', flexShrink: 0 }} />
          )}
        </div>

        {/* Incident details */}
        {isDown && d.incident_title && (
          <div style={{
            background: 'var(--negative-tint)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 8,
            padding: '12px 14px',
            marginBottom: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <AlertCircle size={13} style={{ color: 'var(--negative)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--negative)' }}>Active Incident</span>
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
              {d.incident_title}
            </div>
            {d.incident_description && (
              <div style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                {d.incident_description}
              </div>
            )}
          </div>
        )}

        {/* Affected services */}
        {d.affected_services && d.affected_services.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--ink-4)', textTransform: 'uppercase', marginBottom: 6 }}>
              Affected Services
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {d.affected_services.map((svc, i) => (
                <span key={i} style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: 'var(--negative-tint)',
                  color: 'var(--negative)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  fontWeight: 500,
                }}>
                  {svc}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Status summary */}
        <div style={{
          fontSize: 11.5,
          color: 'var(--ink-3)',
          borderTop: '1px solid var(--line)',
          paddingTop: 10,
          fontStyle: 'italic',
        }}>
          {d.status_summary}
        </div>
      </div>
    </div>
  )
}
