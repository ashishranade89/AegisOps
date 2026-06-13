import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { AgentFeed } from '@/components/agent-feed'
import { PhaseBar } from '@/components/phase-bar'
import { TopologyGraph } from '@/components/topology-graph'
import { ApprovalCard } from '@/components/approval-card'
import { VendorStatusCard } from '@/components/vendor-status-card'
import { HypothesisChart, InvestigationMindMap } from '@/components/report-visuals'
import { IncidentChat } from '@/components/incident-chat'
import { useSSE } from '@/hooks/use-sse'
import { useIncidentStore } from '@/stores/incident-store'
import { stopIncident } from '@/lib/api'
import { ArrowLeft, Loader2, Sparkles, AlertTriangle, DollarSign, Download, Printer } from 'lucide-react'

function scenarioHeading(key: string): string {
  if (!key) return 'Incident Response Workflow'
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function RunPage() {
  const { runId } = useParams<{ runId: string }>()
  const navigate = useNavigate()
  const {
    scenario,
    status,
    phase,
    report,
    events,
    activeAgent,
    completedNodes,
    chatOpen,
    setChatOpen,
    reset,
    totalCostUsd,
    agentCosts,
    browserResult,
    approvalContext,
  } = useIncidentStore()

  const [graphCollapsed, setGraphCollapsed] = useState(false)
  const [showVisuals, setShowVisuals] = useState(false)

  function downloadReport() {
    if (!report) return
    const blob = new Blob([report], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `incident-report-${runId || 'unknown'}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function printReport() {
    const printWin = window.open('', '_blank')
    if (!printWin) return
    const style = `
      body { font-family: Georgia, serif; max-width: 800px; margin: 0 auto; padding: 40px 24px; color: #111; }
      h1 { font-size: 24px; margin-bottom: 4px; }
      h2 { font-size: 18px; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-top: 28px; }
      h3 { font-size: 15px; margin-top: 20px; }
      pre, code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
      pre { padding: 12px; overflow-x: auto; }
      ul, ol { padding-left: 20px; }
      li { margin-bottom: 4px; }
      .header { border-bottom: 2px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 24px; }
      .meta { font-size: 12px; color: #666; margin-top: 6px; }
    `
    // Simple markdown-to-HTML conversion for print
    const htmlContent = report
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]*?<\/li>)/gm, '<ul>$1</ul>')
      .replace(/\n\n/g, '<br/><br/>')
    printWin.document.write(`
      <!DOCTYPE html><html><head><title>Incident Report — ${runId}</title>
      <style>${style}</style></head>
      <body>
        <div class="header">
          <strong>Outage Investigator — Incident Report</strong>
          <div class="meta">Run ID: ${runId} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString()}</div>
        </div>
        ${htmlContent}
      </body></html>
    `)
    printWin.document.close()
    printWin.focus()
    setTimeout(() => printWin.print(), 500)
  }

  useSSE(runId || null)

  const isStreaming = status === 'running' || status === 'pending'

  return (
    <div
      style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}
      className="fade-in"
    >
      {/* Main Column */}
      <div className="scroll" style={{ paddingBottom: '40px' }}>

        {/* ── Run header ── */}
        <div className="card" style={{ background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={() => { reset(); navigate('/history') }}
                className="icon-btn"
                title="Return to Investigations"
                aria-label="Return to Investigations"
              >
                <ArrowLeft size={14} />
              </button>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={13} style={{ color: 'var(--warn)' }} />
                  <span className="eyebrow" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}>
                    Incident session
                  </span>
                </div>
                <h2 className="h2" style={{ fontWeight: 600, marginTop: 2 }}>{scenarioHeading(scenario)}</h2>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isStreaming && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--primary-accent)', fontWeight: 500 }}>
                    <Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} />
                    Agents working...
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (window.confirm("Are you sure you want to stop the active investigation swarm?")) {
                        try {
                          await stopIncident(runId!);
                        } catch (err) {
                          console.error("Failed to stop run:", err);
                        }
                      }
                    }}
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: 8,
                      color: '#ef4444',
                      padding: '5px 11px',
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 120ms',
                    }}
                    className="hover:bg-red-500/25"
                  >
                    Stop Swarm
                  </button>
                </div>
              )}
              {status === 'completed' && (
                <span style={{ fontSize: 11.5, color: 'var(--positive)', fontWeight: 600 }}>✓ Completed</span>
              )}
              {status === 'paused' && (
                <span style={{ fontSize: 11.5, color: 'var(--warn)', fontWeight: 600 }}>⏸ Awaiting approval...</span>
              )}
              {status === 'failed' && (
                <span style={{ fontSize: 11.5, color: 'var(--negative)', fontWeight: 600 }}>✗ Failed / Halted</span>
              )}
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', background: 'var(--surface)', padding: '3px 7px', borderRadius: 4, border: '1px solid var(--line)' }}>
                {runId}
              </div>
              {totalCostUsd > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: 'var(--positive)', background: 'var(--positive-tint)', padding: '3px 7px', borderRadius: 4, border: '1px solid var(--positive)' }}>
                  <DollarSign size={10} />
                  {totalCostUsd < 0.001 ? '<$0.001' : `$${totalCostUsd.toFixed(4)}`}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sleek Horizontal Phase Stepper - replacing vertical sidebar */}
        <div className="card" style={{ padding: '12px 16px', background: 'var(--surface-2)' }}>
          <PhaseBar currentPhase={phase} layout="horizontal" />
        </div>

        {/* Main content - now full width since sidebar column is removed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* Topology graph - collapsible */}
          <div id="section-topology">
            <TopologyGraph 
              activeAgent={activeAgent} 
              completedNodes={completedNodes} 
              collapsed={graphCollapsed}
              onToggleCollapse={() => setGraphCollapsed(!graphCollapsed)}
            />
          </div>

          {/* Live vendor status card (browser scrape result) */}
          {browserResult && (
            <VendorStatusCard result={browserResult} />
          )}

          {/* Human approval gate */}
          {status === 'paused' && runId && (
            <ApprovalCard runId={runId} />
          )}

          {/* Collapsible Visual Diagnostic Analysis - separated from report card for cleanliness */}
          {approvalContext && (
            <div className="card" style={{ marginBottom: 4 }}>
              <div 
                className="card-head" 
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => setShowVisuals(!showVisuals)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={15} style={{ color: 'var(--primary-accent)' }} />
                  <div>
                    <div className="card-title">Visual Diagnostic Analysis</div>
                    <div className="card-sub">Interactive Mind Map and Root Cause Hypotheses</div>
                  </div>
                </div>
                <button type="button" className="icon-btn" style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6 }}>
                  {showVisuals ? 'Hide Diagrams' : 'Show Diagrams'}
                </button>
              </div>
              {showVisuals && (
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start', borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                  <InvestigationMindMap
                    context={approvalContext}
                    browserResult={browserResult}
                    runId={runId}
                    scenario={scenario}
                  />
                  {approvalContext.hypotheses && approvalContext.hypotheses.length > 0 && (
                    <HypothesisChart hypotheses={approvalContext.hypotheses} />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Postmortem report */}
          {report && (
            <div className="card" id="section-report">
              <div className="card-head" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={16} style={{ color: 'var(--primary-accent)' }} />
                    <div>
                      <div className="card-title">Incident Postmortem Report</div>
                      <div className="card-sub">Generated automatically by compiled agents</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={printReport}
                      className="icon-btn"
                      title="Export as PDF"
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, padding: '5px 10px', borderRadius: 6 }}
                    >
                      <Printer size={13} />
                      Export PDF
                    </button>
                    <button
                      type="button"
                      onClick={downloadReport}
                      className="icon-btn"
                      title="Download as Markdown"
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, padding: '5px 10px', borderRadius: 6 }}
                    >
                      <Download size={13} />
                      .md
                    </button>
                  </div>
                </div>
              </div>

              <article className="prose">
                <ReactMarkdown>{report}</ReactMarkdown>
              </article>
            </div>
          )}

          {!report && isStreaming && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', borderStyle: 'dashed', textAlign: 'center' }}>
              <Loader2 style={{ width: 28, height: 28, color: 'var(--primary-accent)', marginBottom: 16, animation: 'spin 0.8s linear infinite' }} />
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>Assembling Incident Context</div>
              <p className="muted" style={{ fontSize: 12.5, maxWidth: 320, margin: '6px 0 0' }}>
                LangGraph nodes are analyzing logs, status pages, and telemetry signals...
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right: Sliding Activity Feed */}
      <aside className={`chat-panel ${chatOpen ? '' : 'collapsed'}`}>
        <div className="chat-head">
          <div className={`chat-orb ${isStreaming ? 'pulse' : ''}`} />
          <div style={{ flex: 1 }}>
            <div className="chat-title">Activity Stream</div>
            <div className="chat-sub">{isStreaming ? 'Listening to events...' : 'Pipeline ended'}</div>
          </div>
          <button
            className="icon-btn"
            onClick={() => setChatOpen(false)}
            title="Collapse Activity Panel"
            aria-label="Collapse Activity Panel"
          >
            ✕
          </button>
        </div>
        <div className="chat-stream">
          <AgentFeed events={events} agentCosts={agentCosts} />
        </div>
      </aside>

      {runId && <IncidentChat runId={runId} />}
    </div>
  )
}
