import React, { useState } from 'react'
import { Key, Eye, EyeOff, ShieldCheck, ArrowRight, ExternalLink, Zap, Globe, Cpu, AlertCircle, CheckCircle2 } from 'lucide-react'

interface ApiKeyGateProps {
  openrouterKey: string
  setOpenrouterKey: (v: string) => void
  tavilyKey: string
  setTavilyKey: (v: string) => void
  llmModel: string
  setLlmModel: (v: string) => void
  llmProvider: 'openrouter' | 'local'
  setLlmProvider: (v: 'openrouter' | 'local') => void
  llmBaseUrl: string
  setLlmBaseUrl: (v: string) => void
  onSubmit: () => void
}

function PasswordInput({
  value, onChange, placeholder, id
}: { value: string; onChange: (v: string) => void; placeholder: string; id: string }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        style={{
          width: '100%',
          background: 'var(--bg)',
          border: `1px solid ${value.trim() ? 'rgba(16,185,129,.5)' : 'var(--line-strong)'}`,
          borderRadius: 10,
          padding: '13px 44px 13px 14px',
          fontSize: 14,
          color: 'var(--ink)',
          outline: 'none',
          fontFamily: 'monospace',
          transition: 'border-color 200ms',
          boxSizing: 'border-box',
        }}
      />
      {value.trim() && (
        <CheckCircle2
          size={15}
          style={{ position: 'absolute', right: value.trim() ? 38 : 14, top: '50%', transform: 'translateY(-50%)', color: '#10b981', pointerEvents: 'none' }}
        />
      )}
      <button
        type="button"
        onClick={() => setShow(!show)}
        style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 0, display: 'flex', alignItems: 'center' }}
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}

export function ApiKeyGate({
  openrouterKey, setOpenrouterKey,
  tavilyKey, setTavilyKey,
  llmModel, setLlmModel,
  llmProvider, setLlmProvider,
  llmBaseUrl, setLlmBaseUrl,
  onSubmit,
}: ApiKeyGateProps) {
  const [localOrKey, setLocalOrKey] = useState(openrouterKey)
  const [localTavilyKey, setLocalTavilyKey] = useState(tavilyKey)
  const [localModel, setLocalModel] = useState(llmModel)
  const [localProvider, setLocalProvider] = useState(llmProvider)
  const [localBaseUrl, setLocalBaseUrl] = useState(llmBaseUrl)

  const canSubmit = localProvider === 'local'
    ? localBaseUrl.trim().length > 0
    : localOrKey.trim().length > 0

  const handleSave = () => {
    setOpenrouterKey(localOrKey)
    setTavilyKey(localTavilyKey)
    setLlmModel(localModel)
    setLlmProvider(localProvider)
    setLlmBaseUrl(localBaseUrl)
    // Persist to localStorage
    localStorage.setItem('openrouter_key', localOrKey)
    localStorage.setItem('tavily_key', localTavilyKey)
    localStorage.setItem('llm_model', localModel)
    localStorage.setItem('llm_provider', localProvider)
    localStorage.setItem('llm_base_url', localBaseUrl)
    onSubmit()
  }

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '40px 24px 60px',
    }} className="custom-scrollbar">
      <div style={{ width: '100%', maxWidth: 560 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18, margin: '0 auto 18px',
            background: 'linear-gradient(135deg, rgba(249,115,22,.18), rgba(37,99,235,.18))',
            border: '1px solid rgba(249,115,22,.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 40px rgba(249,115,22,.15)',
          }}>
            <Key size={28} style={{ color: 'var(--primary-accent)' }} />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--ink)', margin: '0 0 10px', letterSpacing: '-.02em' }}>
            API Keys Required
          </h1>
          <p style={{ fontSize: 14.5, color: 'var(--ink-3)', margin: 0, lineHeight: 1.6, maxWidth: 420, marginInline: 'auto' }}>
            AegisOps uses your own API keys to run the AI investigation swarm. Keys are stored only in your browser and sent directly to the backend — never shared.
          </p>
        </div>

        {/* Main form card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,.25)',
        }}>

          {/* Provider toggle */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
              LLM Provider
            </div>
            <div style={{ display: 'flex', gap: 8, background: 'var(--bg)', padding: 4, borderRadius: 12, border: '1px solid var(--line)' }}>
              {([
                { val: 'openrouter', label: 'OpenRouter', icon: <Globe size={14} />, desc: 'Cloud AI (GPT-4o, Gemini, Claude…)' },
                { val: 'local',      label: 'Local LLM', icon: <Cpu size={14} />,   desc: 'Ollama / LM Studio' },
              ] as const).map(({ val, label, icon, desc }) => (
                <button
                  key={val}
                  onClick={() => setLocalProvider(val)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', transition: 'all 150ms', textAlign: 'left',
                    background: localProvider === val
                      ? (val === 'openrouter' ? 'rgba(249,115,22,.14)' : 'rgba(96,165,250,.14)')
                      : 'transparent',
                    boxShadow: localProvider === val ? `0 0 0 1.5px ${val === 'openrouter' ? 'rgba(249,115,22,.5)' : 'rgba(96,165,250,.5)'}` : 'none',
                  }}
                >
                  <span style={{ color: localProvider === val ? (val === 'openrouter' ? '#fb923c' : '#93c5fd') : 'var(--ink-3)' }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: localProvider === val ? (val === 'openrouter' ? '#fb923c' : '#93c5fd') : 'var(--ink)' }}>{label}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 1 }}>{desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* OpenRouter key section */}
          {localProvider === 'openrouter' && (
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                <label htmlFor="or-key-input" style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ color: 'var(--negative)', fontSize: 16, lineHeight: 1 }}>*</span>
                  OpenRouter API Key
                  <span style={{ fontSize: 11, fontWeight: 600, background: 'var(--negative-tint)', color: 'var(--negative)', padding: '2px 8px', borderRadius: 6 }}>Required</span>
                </label>
                <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12, color: 'var(--info)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none', fontWeight: 600 }}>
                  Get key <ExternalLink size={11} />
                </a>
              </div>
              <PasswordInput
                id="or-key-input"
                value={localOrKey}
                onChange={setLocalOrKey}
                placeholder="sk-or-v1-..."
              />
              <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8, lineHeight: 1.5 }}>
                Powers all AI agents — Triage, Root Cause, Remediation, and Reporting. Free tier available at openrouter.ai.
              </div>
            </div>
          )}

          {/* Local LLM base URL */}
          {localProvider === 'local' && (
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)' }}>
              <label htmlFor="local-url-input" style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                <span style={{ color: 'var(--negative)', fontSize: 16, lineHeight: 1 }}>*</span>
                Ollama / LM Studio Base URL
                <span style={{ fontSize: 11, fontWeight: 600, background: 'var(--negative-tint)', color: 'var(--negative)', padding: '2px 8px', borderRadius: 6 }}>Required</span>
              </label>
              <input
                id="local-url-input"
                type="text"
                value={localBaseUrl}
                onChange={(e) => setLocalBaseUrl(e.target.value)}
                placeholder="http://localhost:11434/v1"
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--line-strong)', borderRadius: 10, padding: '13px 14px', fontSize: 14, color: 'var(--ink)', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }}
              />
              <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8 }}>
                Make sure your Ollama server is running locally before launching.
              </div>
            </div>
          )}

          {/* Tavily — optional */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <label htmlFor="tavily-key-input" style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 7 }}>
                Tavily Search Key
                <span style={{ fontSize: 11, fontWeight: 600, background: 'var(--surface-2)', color: 'var(--ink-3)', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--line)' }}>Optional</span>
              </label>
              <a href="https://tavily.com" target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: 'var(--info)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none', fontWeight: 600 }}>
                Get key <ExternalLink size={11} />
              </a>
            </div>
            <PasswordInput
              id="tavily-key-input"
              value={localTavilyKey}
              onChange={setLocalTavilyKey}
              placeholder="tvly-..."
            />
            <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8 }}>
              Enables live vendor status page scraping. Falls back to DuckDuckGo if not set.
            </div>
          </div>

          {/* LLM model selector */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)' }}>
            <label htmlFor="model-select" style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <Cpu size={14} style={{ color: '#f59e0b' }} />
              AI Model
            </label>
            <select
              id="model-select"
              value={localModel}
              onChange={(e) => setLocalModel(e.target.value)}
              style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--line-strong)', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: 'var(--ink)', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
            >
              <option value="google/gemini-2.0-flash-001">Gemini 2.0 Flash — fastest, cheapest (~$0.004/run)</option>
              <option value="openai/gpt-4o-mini">GPT-4o Mini — balanced speed &amp; quality</option>
              <option value="openai/gpt-4o">GPT-4o — highest quality</option>
              <option value="google/gemini-pro-1.5">Gemini 1.5 Pro — long context</option>
              <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet — excellent reasoning</option>
              <option value="deepseek/deepseek-chat">DeepSeek V3 — very low cost</option>
            </select>
          </div>

          {/* Security notice */}
          <div style={{ padding: '16px 24px', background: 'rgba(20,184,166,.04)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <ShieldCheck size={18} style={{ color: '#14b8a6', flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Your keys stay private</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6 }}>
                Keys are saved only in your browser's <code style={{ fontFamily: 'monospace', background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 4 }}>localStorage</code> and never sent to any third party. They are forwarded only to <em>your own</em> running backend server during investigation runs.
              </div>
            </div>
          </div>

          {/* Submit */}
          <div style={{ padding: '20px 24px' }}>
            {!canSubmit && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderRadius: 10, background: 'var(--warn-tint)', border: '1px solid rgba(245,158,11,.25)', marginBottom: 14 }}>
                <AlertCircle size={15} style={{ color: 'var(--warn)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: 'var(--warn)', fontWeight: 600 }}>
                  {localProvider === 'openrouter'
                    ? 'Enter your OpenRouter API key above to continue.'
                    : 'Enter your local LLM base URL above to continue.'}
                </span>
              </div>
            )}
            <button
              id="api-key-submit-btn"
              onClick={handleSave}
              disabled={!canSubmit}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '16px 24px', borderRadius: 12,
                background: canSubmit
                  ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                  : 'var(--surface-2)',
                color: canSubmit ? '#fff' : 'var(--ink-4)',
                fontSize: 15, fontWeight: 900,
                border: canSubmit ? '1px solid rgba(255,255,255,.2)' : '1px solid var(--line)',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                boxShadow: canSubmit ? '0 6px 28px rgba(37,99,235,.45), inset 0 1px 0 rgba(255,255,255,.15)' : 'none',
                textTransform: 'uppercase', letterSpacing: '0.06em', transition: 'all 150ms',
              }}
            >
              <Zap size={16} />
              Save Keys &amp; Launch Cockpit
              <ArrowRight size={16} />
            </button>
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-4)', marginTop: 12, marginBottom: 0 }}>
              You can update or change these keys anytime from the <strong style={{ color: 'var(--ink-3)' }}>API Keys</strong> tab in the cockpit sidebar.
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
