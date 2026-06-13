import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Loader2, Bot, User, Minimize2, RefreshCw, ThumbsDown } from 'lucide-react'
import { chatAboutIncident } from '@/lib/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
  isRetry?: boolean  // assistant message was a retry/clarification response
}

const SUGGESTED_QUESTIONS = [
  "What caused this incident?",
  "Which services are affected?",
  "What should I tell my users?",
  "What is the remediation plan?",
  "How serious is this?",
  "Is this fixed yet?",
]

// Quick retry prompts shown under assistant messages
const RETRY_PROMPTS = [
  "I still don't understand, explain differently",
  "Can you use simpler words?",
  "Give me a step-by-step breakdown",
]

interface IncidentChatProps {
  runId: string
}

export function IncidentChat({ runId }: IncidentChatProps) {
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFailedMsg, setLastFailedMsg] = useState<string>('')
  // Track which assistant message indices have been "rejected" (thumbed down)
  const [rejectedIdx, setRejectedIdx] = useState<Set<number>>(new Set())
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && !minimized) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open, minimized])

  useEffect(() => {
    if (open && !minimized) {
      inputRef.current?.focus()
    }
  }, [open, minimized])

  async function sendMessage(text: string) {
    const msg = text.trim()
    if (!msg || loading) return
    setInput('')
    setError(null)

    const newMessages: Message[] = [...messages, { role: 'user', content: msg }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const result = await chatAboutIncident(runId, msg, messages)
      setMessages([...newMessages, {
        role: 'assistant',
        content: result.reply,
        isRetry: result.retry_mode,
      }])
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Failed to get response'
      // Strip JSON wrapper like {"detail":"LLM error: Connection error."}
      let friendly = raw
      try {
        const parsed = JSON.parse(raw)
        friendly = parsed.detail ?? parsed.message ?? parsed.error ?? raw
      } catch { /* not JSON, use as-is */ }
      setLastFailedMsg(msg)
      setError(friendly)
      setMessages(messages) // true rollback: remove the optimistic user message so Retry doesn't duplicate it
    } finally {
      setLoading(false)
    }
  }

  function handleThumbsDown(assistantIdx: number) {
    // Mark message as rejected visually
    setRejectedIdx(prev => new Set(prev).add(assistantIdx))
    // Auto-send a clarification request with context about which answer failed
    sendMessage("That didn't fully answer my question. Can you explain it differently or ask me what specifically I'm confused about?")
  }

  function handleRetryPrompt(prompt: string, assistantIdx: number) {
    setRejectedIdx(prev => new Set(prev).add(assistantIdx))
    sendMessage(prompt)
  }

  // Find the last assistant message index to show feedback controls only there
  const lastAssistantIdx = messages.reduce((last, msg, i) => msg.role === 'assistant' ? i : last, -1)

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          type="button"
          onClick={() => { setOpen(true); setMinimized(false) }}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'var(--primary-accent)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(37,99,235,0.35)',
            transition: 'transform 150ms, box-shadow 150ms',
            zIndex: 1000,
          }}
          title="Ask about this incident"
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.08)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
        >
          <MessageCircle size={22} color="#fff" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 370,
            height: minimized ? 52 : 500,
            borderRadius: 14,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 1000,
            transition: 'height 200ms ease',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            background: 'var(--primary-accent)',
            flexShrink: 0,
            cursor: 'pointer',
          }}
            onClick={() => setMinimized(m => !m)}
          >
            <Bot size={16} color="#fff" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#fff' }}>Incident Assistant</div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)' }}>
                Ask me anything — I'll keep clarifying until it's clear
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMinimized(m => !m) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', padding: 2 }}
              title={minimized ? 'Expand' : 'Minimize'}
            >
              <Minimize2 size={14} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', padding: 2 }}
              title="Close"
            >
              <X size={14} />
            </button>
          </div>

          {!minimized && (
            <>
              {/* Messages */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}>
                {messages.length === 0 && (
                  <div>
                    <div style={{
                      textAlign: 'center',
                      color: 'var(--ink-4)',
                      fontSize: 12,
                      marginBottom: 16,
                      lineHeight: 1.5,
                    }}>
                      <Bot size={28} style={{ color: 'var(--primary-accent)', marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
                      Ask me anything about this incident — I'll explain it in plain language.
                      If an answer isn't clear, just say so and I'll try again.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {SUGGESTED_QUESTIONS.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => sendMessage(q)}
                          style={{
                            background: 'var(--surface-2)',
                            border: '1px solid var(--line)',
                            borderRadius: 8,
                            padding: '7px 11px',
                            textAlign: 'left',
                            fontSize: 11.5,
                            color: 'var(--ink-2)',
                            cursor: 'pointer',
                            transition: 'background 150ms',
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)' }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div key={i}>
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'flex-start',
                        flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                      }}
                    >
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                        background: msg.role === 'user' ? 'var(--primary-accent)' : 'var(--surface-2)',
                        border: '1px solid var(--line)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {msg.role === 'user'
                          ? <User size={13} color="#fff" />
                          : <Bot size={13} style={{ color: msg.isRetry ? 'var(--warn)' : 'var(--primary-accent)' }} />
                        }
                      </div>
                      <div style={{
                        maxWidth: '75%',
                        background: msg.role === 'user'
                          ? 'color-mix(in oklab, var(--primary-accent) 12%, var(--surface))'
                          : msg.isRetry
                            ? 'color-mix(in oklab, var(--warn) 8%, var(--surface-2))'
                            : 'var(--surface-2)',
                        border: `1px solid ${
                          msg.role === 'user'
                            ? 'color-mix(in oklab, var(--primary-accent) 25%, transparent)'
                            : msg.isRetry
                              ? 'color-mix(in oklab, var(--warn) 30%, transparent)'
                              : 'var(--line)'
                        }`,
                        borderRadius: msg.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                        padding: '8px 11px',
                        fontSize: 12,
                        color: 'var(--ink)',
                        lineHeight: 1.55,
                      }}>
                        {msg.isRetry && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            fontSize: 10, color: 'var(--warn)', marginBottom: 5,
                            fontWeight: 600,
                          }}>
                            <RefreshCw size={9} />
                            Let me try explaining that differently
                          </div>
                        )}
                        {msg.content}
                      </div>
                    </div>

                    {/* Feedback controls — only on the last assistant message, if not already rejected */}
                    {msg.role === 'assistant' && i === lastAssistantIdx && !loading && !rejectedIdx.has(i) && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        marginTop: 5,
                        marginLeft: 34,
                        flexWrap: 'wrap',
                      }}>
                        <button
                          type="button"
                          onClick={() => handleThumbsDown(i)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            background: 'none', border: '1px solid var(--line)',
                            borderRadius: 6, padding: '3px 7px',
                            fontSize: 10.5, color: 'var(--ink-4)',
                            cursor: 'pointer',
                          }}
                          title="This answer didn't help — ask differently"
                        >
                          <ThumbsDown size={10} />
                          Not helpful
                        </button>
                        {RETRY_PROMPTS.map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => handleRetryPrompt(p, i)}
                            style={{
                              background: 'none', border: '1px solid var(--line)',
                              borderRadius: 6, padding: '3px 7px',
                              fontSize: 10.5, color: 'var(--ink-4)',
                              cursor: 'pointer',
                            }}
                          >
                            {p.length > 22 ? p.slice(0, 22) + '…' : p}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Show "rejected" indicator after thumb-down on older messages */}
                    {msg.role === 'assistant' && rejectedIdx.has(i) && i !== lastAssistantIdx && (
                      <div style={{
                        marginTop: 4, marginLeft: 34,
                        fontSize: 10, color: 'var(--ink-5)',
                        fontStyle: 'italic',
                      }}>
                        Retrying with a clearer explanation…
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--surface-2)', border: '1px solid var(--line)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Bot size={13} style={{ color: 'var(--primary-accent)' }} />
                    </div>
                    <div style={{
                      background: 'var(--surface-2)', border: '1px solid var(--line)',
                      borderRadius: '4px 12px 12px 12px',
                      padding: '8px 12px', display: 'flex', gap: 4, alignItems: 'center',
                    }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: 'var(--ink-4)',
                          animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                        }} />
                      ))}
                    </div>
                  </div>
                )}

                {error && (
                  <div style={{
                    fontSize: 11, color: 'var(--negative)',
                    background: 'var(--negative-tint)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: 6, padding: '6px 10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  }}>
                    <span>{error}</span>
                    <button
                      type="button"
                      onClick={() => { setError(null); sendMessage(lastFailedMsg) }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--negative)', padding: 0, flexShrink: 0,
                        display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5,
                      }}
                      title="Retry"
                    >
                      <RefreshCw size={11} /> Retry
                    </button>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div style={{
                padding: '10px 12px',
                borderTop: '1px solid var(--line)',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                background: 'var(--surface)',
                flexShrink: 0,
              }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }}
                  placeholder="Ask a question, or say 'explain differently'…"
                  disabled={loading}
                  style={{
                    flex: 1,
                    background: 'var(--surface-2)',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    padding: '7px 11px',
                    fontSize: 12,
                    color: 'var(--ink)',
                    fontFamily: 'var(--font-ui)',
                    outline: 'none',
                    opacity: loading ? 0.6 : 1,
                  }}
                />
                <button
                  type="button"
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  style={{
                    width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                    background: !input.trim() || loading ? 'var(--surface-2)' : 'var(--primary-accent)',
                    border: '1px solid var(--line)',
                    cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 150ms',
                  }}
                >
                  {loading
                    ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--ink-4)' }} />
                    : <Send size={14} color={!input.trim() ? 'var(--ink-4)' : '#fff'} />
                  }
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
