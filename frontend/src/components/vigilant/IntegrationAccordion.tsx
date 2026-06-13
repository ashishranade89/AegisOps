import { useState, useCallback } from 'react'
import { ChevronDown, ChevronRight, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react'
import type { TestResult } from '../../lib/api'

export interface FieldConfig {
  label: string
  storageKey: string
  placeholder: string
  type: 'password' | 'text'
  /** Field must be non-empty to enable the Test button */
  testRequired?: boolean
  /** Render the Test button inline with this field */
  showTestButton?: boolean
}

interface IntegrationAccordionProps {
  icon: string
  title: string
  fields: FieldConfig[]
  onTest?: (values: Record<string, string>) => Promise<TestResult>
}

type TestState = 'idle' | 'testing' | 'ok' | 'error'

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldConfig
  value: string
  onChange: (v: string) => void
}) {
  const [show, setShow] = useState(false)

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg)',
    border: '1px solid var(--line-strong)',
    borderRadius: 8,
    padding: field.type === 'password' ? '10px 40px 10px 12px' : '10px 12px',
    fontSize: 13,
    color: 'var(--ink)',
    outline: 'none',
    fontFamily: 'monospace',
    boxSizing: 'border-box',
    transition: 'border-color 150ms',
  }

  if (field.type === 'password') {
    return (
      <div style={{ position: 'relative', width: '100%' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          autoComplete="off"
          spellCheck={false}
          style={inputStyle}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--ink-3)', padding: 0, display: 'flex', alignItems: 'center',
          }}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    )
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      autoComplete="off"
      spellCheck={false}
      style={{ ...inputStyle, width: '100%' }}
    />
  )
}

export function IntegrationAccordion({ icon, title, fields, onTest }: IntegrationAccordionProps) {
  const [expanded, setExpanded] = useState(false)
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    fields.forEach((f) => { init[f.storageKey] = localStorage.getItem(f.storageKey) || '' })
    return init
  })
  const [testState, setTestState] = useState<TestState>('idle')
  const [testMessage, setTestMessage] = useState('')

  const canTest =
    onTest != null &&
    fields.filter((f) => f.testRequired).every((f) => (values[f.storageKey] || '').trim().length > 0)

  const anyFilled = fields.some((f) => (values[f.storageKey] || '').trim().length > 0)

  const handleChange = useCallback((storageKey: string, val: string) => {
    setValues((prev) => ({ ...prev, [storageKey]: val }))
    localStorage.setItem(storageKey, val)
    // Reset test state whenever the user edits a field (spec: badge must not show stale state)
    setTestState('idle')
    setTestMessage('')
  }, [])

  const handleTest = async () => {
    if (!onTest || !canTest) return
    setTestState('testing')
    try {
      const result = await onTest(values)
      setTestState(result.ok ? 'ok' : 'error')
      setTestMessage(result.message)
    } catch {
      setTestState('error')
      setTestMessage('Unexpected error — try again')
    }
  }

  const badgeColor =
    testState === 'ok' ? '#10b981'
    : testState === 'error' ? '#ef4444'
    : anyFilled ? 'var(--ink-3)'
    : 'var(--ink-4)'

  const badgeText =
    testState === 'ok' ? '✓ connected'
    : testState === 'error' ? '✗ error'
    : anyFilled ? 'not tested'
    : 'not configured'

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: expanded ? 'var(--surface-2)' : 'var(--surface)',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--ink)',
          transition: 'background 150ms',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{title}</span>
          <span style={{
            fontSize: 11, fontWeight: 600,
            background: 'var(--surface-2)', color: 'var(--ink-3)',
            padding: '2px 8px', borderRadius: 6, border: '1px solid var(--line)',
          }}>Optional</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: badgeColor, fontWeight: 600 }}>{badgeText}</span>
          {expanded
            ? <ChevronDown size={14} style={{ color: 'var(--ink-3)' }} />
            : <ChevronRight size={14} style={{ color: 'var(--ink-3)' }} />}
        </div>
      </button>

      {/* Accordion body */}
      {expanded && (
        <div style={{
          padding: '14px 16px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          background: 'var(--bg)',
        }}>
          {fields.map((f) => (
            <div key={f.storageKey}>
              <label style={{
                fontSize: 12, fontWeight: 700, color: 'var(--ink-3)',
                display: 'block', marginBottom: 5,
              }}>
                {f.label}
              </label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <FieldInput
                    field={f}
                    value={values[f.storageKey] || ''}
                    onChange={(v) => handleChange(f.storageKey, v)}
                  />
                </div>
                {f.showTestButton && onTest && (
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={!canTest || testState === 'testing'}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: testState === 'ok'
                        ? '1px solid rgba(16,185,129,.4)'
                        : testState === 'error'
                        ? '1px solid rgba(239,68,68,.4)'
                        : '1px solid var(--line-strong)',
                      background: testState === 'ok'
                        ? 'rgba(16,185,129,.1)'
                        : testState === 'error'
                        ? 'rgba(239,68,68,.1)'
                        : 'var(--surface-2)',
                      color: testState === 'ok'
                        ? '#10b981'
                        : testState === 'error'
                        ? '#ef4444'
                        : canTest ? 'var(--ink-2)' : 'var(--ink-4)',
                      fontSize: 12, fontWeight: 700,
                      cursor: canTest && testState !== 'testing' ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', gap: 5,
                      whiteSpace: 'nowrap', flexShrink: 0,
                      transition: 'all 150ms',
                    }}
                  >
                    {testState === 'testing'
                      ? <><span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> Testing…</>
                      : 'Test'}
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Inline test result message */}
          {(testState === 'ok' || testState === 'error') && testMessage && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 10px', borderRadius: 7,
              background: testState === 'ok' ? 'rgba(16,185,129,.08)' : 'rgba(239,68,68,.08)',
              border: `1px solid ${testState === 'ok' ? 'rgba(16,185,129,.25)' : 'rgba(239,68,68,.25)'}`,
            }}>
              {testState === 'ok'
                ? <CheckCircle2 size={13} style={{ color: '#10b981', flexShrink: 0 }} />
                : <XCircle size={13} style={{ color: '#ef4444', flexShrink: 0 }} />}
              <span style={{
                fontSize: 12,
                color: testState === 'ok' ? '#10b981' : '#ef4444',
                fontWeight: 600,
              }}>{testMessage}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
