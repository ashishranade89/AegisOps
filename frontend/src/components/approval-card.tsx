import { useState } from 'react'
import { Loader2, CheckCircle, XCircle, ShieldAlert, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { resumeIncident } from '@/lib/api'
import { useIncidentStore } from '@/stores/incident-store'

interface ApprovalCardProps {
  runId: string
}

function SeverityBadge({ severity }: { severity?: string }) {
  if (!severity) return null
  const isHigh = /p1|sev1/i.test(severity)
  const isMed = /p2|sev2/i.test(severity)
  const color = isHigh ? 'var(--negative)' : isMed ? 'var(--warn)' : 'var(--info)'
  const bg = isHigh ? 'var(--negative-tint)' : isMed ? 'var(--warn-tint)' : 'var(--info-tint)'
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
      padding: '2px 7px', borderRadius: 4,
      color, background: bg,
      border: `1px solid ${color}`,
      textTransform: 'uppercase',
    }}>
      {severity.toUpperCase()}
    </span>
  )
}

export function ApprovalCard({ runId }: ApprovalCardProps) {
  const [submitting, setSubmitting] = useState(false)
  const [submittingAction, setSubmittingAction] = useState<'approved' | 'rejected' | null>(null)
  const [comments, setComments] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [decided, setDecided] = useState(false)
  const [showHypotheses, setShowHypotheses] = useState(false)
  const { setPhase, setStatus, approvalContext } = useIncidentStore()

  const ctx = approvalContext

  async function handleDecision(decision: 'approved' | 'rejected') {
    if (decided) return
    setSubmitting(true)
    setSubmittingAction(decision)
    setError(null)
    try {
      await resumeIncident(runId, { status: decision, comments: comments || undefined })
      setDecided(true)
      setSubmitting(false)
      setSubmittingAction(null)
      if (decision === 'approved') {
        setPhase('remediation')
      } else {
        setStatus('failed')
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : ''
      setError(raw && raw.length < 200 && !raw.includes('<') ? raw : 'Failed to submit decision. Please try again.')
      setSubmitting(false)
      setSubmittingAction(null)
    }
  }

  return (
    <div
      id="section-approval"
      className="card"
      style={{
        border: '1px solid rgba(245,158,11,0.35)',
        background: 'var(--surface)',
        overflow: 'hidden',
        boxShadow: '0 0 20px rgba(245,158,11,0.06)',
        padding: 0,
      }}
    >
      {/* Header */}
      <div style={{
        background: 'rgba(245,158,11,0.07)',
        borderBottom: '1px solid rgba(245,158,11,0.2)',
        padding: '13px 18px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}>
        <ShieldAlert size={18} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ color: 'var(--warn)', fontWeight: 700, fontSize: 12.5, letterSpacing: '0.03em' }}>
              Human Approval Required
            </div>
            {ctx?.severity && <SeverityBadge severity={ctx.severity} />}
          </div>
          <div style={{ color: 'var(--ink-2)', fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
            The AI has finished investigating the incident and identified a fix. Before it takes action on your systems, it needs your go-ahead.
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* What happened — plain language summary */}
        {ctx && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Vendor & root cause */}
            <div style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: '12px 14px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--ink-4)', textTransform: 'uppercase', marginBottom: 8 }}>
                What Went Wrong
              </div>
              {ctx.suspected_vendor && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-3)', width: 90, flexShrink: 0 }}>Vendor</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink)' }}>{ctx.suspected_vendor}</span>
                </div>
              )}
              {ctx.root_cause && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-3)', width: 90, flexShrink: 0 }}>Root cause</span>
                  <span style={{ fontSize: 11.5, color: 'var(--ink)', lineHeight: 1.55 }}>{ctx.root_cause}</span>
                </div>
              )}
              {!ctx.root_cause && ctx.internal_findings && (
                <div style={{ fontSize: 11.5, color: 'var(--ink)', lineHeight: 1.55 }}>{ctx.internal_findings}</div>
              )}
            </div>

            {/* Browser result highlight */}
            {ctx.browser_result?.data?.has_active_incident && (
              <div style={{
                background: 'var(--negative-tint)',
                border: '1px solid rgba(239,68,68,0.22)',
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
              }}>
                <AlertTriangle size={13} style={{ color: 'var(--negative)', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--negative)', marginBottom: 3 }}>
                    Confirmed on {ctx.browser_result.vendor} Status Page
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                    {ctx.browser_result.data.incident_title || ctx.browser_result.data.status_summary}
                  </div>
                  {ctx.browser_result.data.affected_services && ctx.browser_result.data.affected_services.length > 0 && (
                    <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {ctx.browser_result.data.affected_services.map((s, i) => (
                        <span key={i} style={{
                          fontSize: 10, padding: '1px 6px', borderRadius: 3,
                          background: 'rgba(239,68,68,0.12)',
                          color: 'var(--negative)',
                          border: '1px solid rgba(239,68,68,0.2)',
                        }}>{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Hypotheses collapsible */}
            {ctx.hypotheses && ctx.hypotheses.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowHypotheses(h => !h)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 11, color: 'var(--ink-3)', background: 'none',
                    border: 'none', cursor: 'pointer', padding: 0,
                  }}
                >
                  {showHypotheses ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  View AI analysis ({ctx.hypotheses.length} hypotheses)
                </button>
                {showHypotheses && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {ctx.hypotheses.map((h, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: 'var(--surface-2)',
                        border: '1px solid var(--line)',
                        borderRadius: 6, padding: '7px 10px',
                      }}>
                        <div style={{
                          width: 36, height: 4, borderRadius: 2,
                          background: `color-mix(in oklab, var(--primary-accent) ${Math.round(h.confidence * 100)}%, var(--line))`,
                          flexShrink: 0,
                        }} />
                        <span style={{ fontSize: 11, color: 'var(--ink-2)', flex: 1 }}>
                          <strong style={{ color: 'var(--ink)' }}>{h.label}</strong> — {Math.round(h.confidence * 100)}% confidence
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* What will happen section */}
        <div style={{
          display: 'flex', gap: 8,
          background: 'rgba(245,158,11,0.04)',
          border: '1px dashed rgba(245,158,11,0.3)',
          borderRadius: 8, padding: '11px 14px',
          alignItems: 'flex-start',
        }}>
          <AlertTriangle size={13} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
            <strong style={{ color: 'var(--warn)' }}>If you approve:</strong> The AI will execute the remediation plan — routing around the failed vendor, alerting your team, and creating a Jira ticket.
            <br />
            <strong style={{ color: 'var(--ink-3)' }}>If you reject:</strong> The pipeline will stop and generate a postmortem report without taking any action.
          </div>
        </div>

        {/* Comments */}
        <div>
          <label
            htmlFor="approval-comments"
            style={{
              display: 'block', fontSize: 10, fontWeight: 600,
              color: 'var(--ink-3)', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 5,
            }}
          >
            Notes for audit log (optional)
          </label>
          <textarea
            id="approval-comments"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            disabled={submitting || decided}
            placeholder="Add your reasoning or any concerns..."
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
              boxSizing: 'border-box' as const,
            }}
          />
        </div>

        {/* Buttons */}
        {!decided ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => handleDecision('approved')}
              disabled={submitting}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: 'var(--positive-tint)', border: '1px solid var(--positive)',
                borderRadius: 8, padding: '10px 0',
                color: 'var(--positive)', fontWeight: 700, fontSize: 12.5,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting && submittingAction !== 'approved' ? 0.5 : 1,
                transition: 'opacity 200ms',
              }}
            >
              {submitting && submittingAction === 'approved' ? (
                <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
              ) : (
                <CheckCircle size={13} />
              )}
              Yes, run remediation
            </button>
            <button
              type="button"
              onClick={() => handleDecision('rejected')}
              disabled={submitting}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: 'var(--negative-tint)', border: '1px solid var(--negative)',
                borderRadius: 8, padding: '10px 0',
                color: 'var(--negative)', fontWeight: 700, fontSize: 12.5,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting && submittingAction !== 'rejected' ? 0.5 : 1,
                transition: 'opacity 200ms',
              }}
            >
              {submitting && submittingAction === 'rejected' ? (
                <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
              ) : (
                <XCircle size={13} />
              )}
              No, stop here
            </button>
          </div>
        ) : (
          <div style={{
            textAlign: 'center', fontSize: 12, fontWeight: 600,
            color: 'var(--positive)', padding: '8px 0',
          }}>
            Decision submitted. Pipeline resuming...
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            background: 'var(--negative-tint)',
            border: '1px solid rgba(158,58,55,0.3)',
            borderRadius: 6, padding: '8px 10px',
            fontSize: 11.5, color: 'var(--negative)',
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
