import React from 'react'
import {
  Siren,
  ScrollText,
  BarChart3,
  GitBranch,
  Wrench,
  FileText,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import type { IncidentPhase } from '@/stores/incident-store'

const PHASES: { key: IncidentPhase; label: string; desc: string; icon: typeof Siren }[] = [
  { key: 'triage',             label: 'Triage',          desc: 'Classify severity & vendor', icon: Siren },
  { key: 'log_analysis',       label: 'Log Analysis',    desc: 'Parse raw application logs',  icon: ScrollText },
  { key: 'metrics_analysis',   label: 'Metrics Analysis',desc: 'Evaluate telemetry signals',  icon: BarChart3 },
  { key: 'root_cause_analysis',label: 'Root Cause',      desc: 'Browser scrape & web search', icon: GitBranch },
  { key: 'remediation',        label: 'Remediation',     desc: 'Apply self-healing playbook', icon: Wrench },
  { key: 'reporting',          label: 'Reporting',       desc: 'Compile postmortem report',   icon: FileText },
  { key: 'completed',          label: 'Done',            desc: 'Incident resolved',           icon: CheckCircle2 },
]

// Section IDs each phase links to in the run page
const PHASE_SECTION_MAP: Partial<Record<IncidentPhase, string>> = {
  triage: 'section-topology',
  log_analysis: 'section-topology',
  metrics_analysis: 'section-topology',
  root_cause_analysis: 'section-topology',
  remediation: 'section-approval',
  paused_for_approval: 'section-approval',
  reporting: 'section-report',
  completed: 'section-report',
}

interface PhaseBarProps {
  currentPhase: IncidentPhase
  layout?: 'vertical' | 'horizontal'
}

function scrollTo(sectionId: string) {
  const el = document.getElementById(sectionId)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

export function PhaseBar({ currentPhase, layout = 'vertical' }: PhaseBarProps) {
  const currentIndex = PHASES.findIndex((p) => p.key === currentPhase)
  const isPaused = currentPhase === 'paused_for_approval'

  if (layout === 'horizontal') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 8, overflowX: 'auto', padding: '4px 0' }} className="custom-scrollbar">
          {PHASES.map((phase, i) => {
            const isActive = phase.key === currentPhase
            const isPast   = i < currentIndex
            const Icon     = phase.icon
            const isLast    = i === PHASES.length - 1
            const sectionId = PHASE_SECTION_MAP[phase.key]
            const isClickable = (isPast || isActive) && !!sectionId

            let dotBg     = 'var(--line)'
            let dotBorder = 'var(--line)'
            let labelColor = 'var(--ink-4)'

            if (isPast) {
              dotBg     = 'var(--positive)'
              dotBorder = 'var(--positive)'
              labelColor = 'var(--ink-2)'
            } else if (isActive) {
              dotBg     = 'var(--primary-accent)'
              dotBorder = 'var(--primary-accent)'
              labelColor = 'var(--primary-accent)'
            }

            return (
              <React.Fragment key={phase.key}>
                {/* Step Item */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: isClickable ? 'pointer' : 'default',
                    flexShrink: 0
                  }}
                  onClick={() => isClickable && sectionId && scrollTo(sectionId)}
                  title={isClickable ? `Scroll to ${phase.label} section` : undefined}
                >
                  {/* Indicator Dot */}
                  <div style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: dotBg,
                    border: `2px solid ${dotBorder}`,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    transition: 'all 300ms ease',
                    boxShadow: isActive
                      ? '0 0 0 3px color-mix(in oklab, var(--primary-accent) 15%, transparent)'
                      : 'none',
                  }}>
                    {isPast ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L4 7.5L8.5 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : isActive ? (
                      <Loader2
                        size={10}
                        color="#fff"
                        style={{ animation: 'spin 0.9s linear infinite' }}
                      />
                    ) : (
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--line-strong)' }} />
                    )}
                  </div>

                  {/* Label & Icon */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon size={12} style={{ color: labelColor, flexShrink: 0 }} />
                    <span style={{
                      fontSize: '12px',
                      fontWeight: isActive || isPast ? 600 : 400,
                      color: labelColor,
                      whiteSpace: 'nowrap'
                    }}>
                      {phase.label}
                    </span>
                  </div>
                </div>

                {/* Horizontal Line connector */}
                {!isLast && (
                  <div style={{
                    flex: '1 1 20px',
                    height: 2,
                    minWidth: 12,
                    background: isPast ? 'var(--positive)' : 'var(--line)',
                    borderRadius: 1,
                    alignSelf: 'center'
                  }} />
                )}
              </React.Fragment>
            )
          })}
        </div>
        
        {isPaused && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--warn-tint, rgba(234,179,8,0.1))', padding: '6px 12px', borderRadius: 6, border: '1px solid var(--warn)' }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: 'var(--warn)',
              display: 'grid', placeItems: 'center', flexShrink: 0,
            }}>
              <div style={{ width: 4, height: 4, borderRadius: 1, background: '#fff' }} />
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--warn)' }}>
              Awaiting Approval: Human review required before remediation.
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {PHASES.map((phase, i) => {
        const isActive = phase.key === currentPhase
        const isPast   = i < currentIndex
        const Icon     = phase.icon
        const isLast    = i === PHASES.length - 1
        const sectionId = PHASE_SECTION_MAP[phase.key]
        const isClickable = (isPast || isActive) && !!sectionId

        let dotBg     = 'var(--line)'
        let dotBorder = 'var(--line)'
        let labelColor = 'var(--ink-4)'
        let descColor  = 'var(--ink-4)'

        if (isPast) {
          dotBg     = 'var(--positive)'
          dotBorder = 'var(--positive)'
          labelColor = 'var(--ink-2)'
          descColor  = 'var(--ink-3)'
        } else if (isActive) {
          dotBg     = 'var(--primary-accent)'
          dotBorder = 'var(--primary-accent)'
          labelColor = 'var(--primary-accent)'
          descColor  = 'var(--ink-2)'
        }

        return (
          <div
            key={phase.key}
            style={{ display: 'flex', gap: 12, alignItems: 'stretch', cursor: isClickable ? 'pointer' : 'default' }}
            onClick={() => isClickable && sectionId && scrollTo(sectionId)}
            title={isClickable ? `Scroll to ${phase.label} section` : undefined}
          >
            {/* Left: dot + connector line */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
              {/* Dot */}
              <div style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: dotBg,
                border: `2px solid ${dotBorder}`,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                transition: 'all 300ms ease',
                boxShadow: isActive
                  ? '0 0 0 4px color-mix(in oklab, var(--primary-accent) 15%, transparent)'
                  : 'none',
              }}>
                {isPast ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5L4 7.5L8.5 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : isActive ? (
                  <Loader2
                    size={10}
                    color="#fff"
                    style={{ animation: 'spin 0.9s linear infinite' }}
                  />
                ) : (
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--line-strong)' }} />
                )}
              </div>
              {/* Connector line */}
              {!isLast && (
                <div style={{
                  flex: 1,
                  width: 2,
                  minHeight: 16,
                  background: isPast
                    ? 'var(--positive)'
                    : 'var(--line)',
                  margin: '2px 0',
                  borderRadius: 2,
                  transition: 'background 300ms ease',
                }} />
              )}
            </div>

            {/* Right: label + desc */}
            <div style={{
              paddingBottom: isLast ? 0 : 14,
              paddingTop: 1,
              minWidth: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon
                  size={12}
                  style={{ color: labelColor, flexShrink: 0, transition: 'color 300ms' }}
                />
                <span style={{
                  fontSize: 12.5,
                  fontWeight: isActive || isPast ? 600 : 400,
                  color: labelColor,
                  transition: 'all 300ms ease',
                  letterSpacing: isActive ? '-0.01em' : 0,
                }}>
                  {phase.label}
                </span>
                {isActive && isPaused === false && (
                  <span style={{
                    fontSize: 9.5,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    color: 'var(--primary-accent)',
                    background: 'color-mix(in oklab, var(--primary-accent) 10%, transparent)',
                    padding: '1px 6px',
                    borderRadius: 999,
                    textTransform: 'uppercase',
                  }}>
                    Active
                  </span>
                )}
              </div>
              <div style={{
                fontSize: 11,
                color: descColor,
                marginTop: 1,
                transition: 'color 300ms ease',
              }}>
                {phase.desc}
              </div>
            </div>
          </div>
        )
      })}

      {/* Paused-for-approval extra row */}
      {isPaused && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%',
            background: 'var(--warn)',
            border: '2px solid var(--warn)',
            display: 'grid', placeItems: 'center', flexShrink: 0,
            boxShadow: '0 0 0 4px color-mix(in oklab, var(--warn) 15%, transparent)',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: 1, background: '#fff' }} />
          </div>
          <div>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--warn)' }}>
              Awaiting Approval
            </span>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>
              Human review required before remediation
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
