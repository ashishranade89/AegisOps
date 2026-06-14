import { useEffect, useState } from 'react'
import {
  Server,
  Plus,
  Pencil,
  Trash2,
  Wifi,
  HardDrive,
  Radio,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  X,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import {
  listMonitors,
  createMonitor,
  updateMonitor,
  deleteMonitor,
  toggleMonitor,
  type Monitor,
  type MonitorPayload,
  type MonitorType,
} from '@/lib/api'

// ─── helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<MonitorType, string> = {
  local: 'Local File',
  ssh: 'SSH / SFTP',
  syslog_udp: 'Syslog UDP',
  syslog_tcp: 'Syslog TCP',
}

const TYPE_ICONS: Record<MonitorType, typeof Server> = {
  local: HardDrive,
  ssh: Server,
  syslog_udp: Radio,
  syslog_tcp: Wifi,
}

const TYPE_COLORS: Record<MonitorType, string> = {
  local: 'var(--info, #3b82f6)',
  ssh: '#a855f7',
  syslog_udp: 'var(--warn, #f59e0b)',
  syslog_tcp: 'var(--warn, #f59e0b)',
}

function fmt(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function intervalLabel(s: number) {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  return `${Math.round(s / 3600)}h`
}

// ─── empty form state ─────────────────────────────────────────────────────────

const EMPTY_FORM: MonitorPayload & { password: string; private_key: string; passphrase: string; username: string } = {
  name: '',
  type: 'local',
  host: '',
  port: undefined,
  log_path: '',
  scan_interval: 60,
  enabled: true,
  auto_remediate: false,
  username: '',
  password: '',
  private_key: '',
  passphrase: '',
}

// ─── Monitor Form Modal ───────────────────────────────────────────────────────

function MonitorModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: Monitor | null
  onSave: (payload: MonitorPayload) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authMode, setAuthMode] = useState<'password' | 'key'>('password')

  useEffect(() => {
    if (initial) {
      setForm({
        ...EMPTY_FORM,
        name: initial.name,
        type: initial.type,
        host: initial.host ?? '',
        port: initial.port,
        log_path: initial.log_path ?? '',
        scan_interval: initial.scan_interval,
        enabled: !!initial.enabled,
        auto_remediate: !!initial.auto_remediate,
      })
    }
  }, [initial])

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  const needsHost = form.type === 'ssh' || form.type === 'syslog_udp' || form.type === 'syslog_tcp'
  const needsPath = form.type === 'local' || form.type === 'ssh'
  const needsCreds = form.type === 'ssh'
  const isSyslog = form.type === 'syslog_udp' || form.type === 'syslog_tcp'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload: MonitorPayload = {
        name: form.name,
        type: form.type,
        scan_interval: Number(form.scan_interval),
        enabled: form.enabled,
        auto_remediate: form.auto_remediate,
      }
      if (needsHost && form.host) payload.host = form.host
      if (form.port) payload.port = Number(form.port)
      if (needsPath && form.log_path) payload.log_path = form.log_path

      if (needsCreds && (form.username || form.password || form.private_key)) {
        payload.credentials = { username: form.username }
        if (authMode === 'password') {
          payload.credentials.password = form.password
        } else {
          payload.credentials.private_key = form.private_key
          if (form.passphrase) payload.credentials.passphrase = form.passphrase
        }
      }

      await onSave(payload)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '12px', width: '100%', maxWidth: '520px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Fixed header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
            {initial ? 'Edit Log Source' : 'Add Log Source'}
          </h2>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Name */}
            <div>
              <label style={labelStyle}>Name</label>
              <input style={inputStyle} required value={form.name}
                placeholder="e.g. Production API Server"
                onChange={(e) => set('name', e.target.value)} />
            </div>

            {/* Type */}
            <div>
              <label style={labelStyle}>Source Type</label>
              <select style={inputStyle} value={form.type}
                onChange={(e) => set('type', e.target.value as MonitorType)}>
                {(Object.keys(TYPE_LABELS) as MonitorType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            {/* Host */}
            {needsHost && (
              <div>
                <label style={labelStyle}>
                  {isSyslog ? 'Listen Interface' : 'Host / IP / FQDN'}
                </label>
                <input style={inputStyle} value={form.host ?? ''}
                  placeholder={isSyslog ? '0.0.0.0' : '10.0.0.1 or server.example.com'}
                  onChange={(e) => set('host', e.target.value)} />
              </div>
            )}

            {/* Port */}
            <div>
              <label style={labelStyle}>
                Port {isSyslog ? '(default 10514)' : form.type === 'ssh' ? '(default 22)' : '(optional)'}
              </label>
              <input style={inputStyle} type="number" value={form.port ?? ''}
                placeholder={isSyslog ? '10514' : form.type === 'ssh' ? '22' : ''}
                onChange={(e) => set('port', e.target.value ? Number(e.target.value) : undefined)} />
            </div>

            {/* Log path */}
            {needsPath && (
              <div>
                <label style={labelStyle}>
                  {form.type === 'local' ? 'Local Log File Path' : 'Remote Log File Path'}
                </label>
                <input style={inputStyle} value={form.log_path ?? ''}
                  placeholder={form.type === 'local' ? 'C:/logs/incident.log  or  /var/log/app.log' : '/var/log/app/incidents.log'}
                  onChange={(e) => set('log_path', e.target.value)} />
              </div>
            )}

            {/* Scan interval (not for syslog — push model) */}
            {!isSyslog && (
              <div>
                <label style={labelStyle}>Scan Interval (seconds)</label>
                <input style={inputStyle} type="number" min={5} value={form.scan_interval}
                  onChange={(e) => set('scan_interval', Number(e.target.value))} />
              </div>
            )}

            {/* SSH credentials */}
            {needsCreds && (
              <fieldset style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '0.75rem', margin: 0 }}>
                <legend style={{ fontSize: '0.75rem', color: 'var(--muted)', padding: '0 4px' }}>Credentials</legend>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={labelStyle}>Username</label>
                  <input style={inputStyle} value={form.username}
                    placeholder="sre"
                    onChange={(e) => set('username', e.target.value)} />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  {(['password', 'key'] as const).map((m) => (
                    <button key={m} type="button"
                      onClick={() => setAuthMode(m)}
                      style={{
                        flex: 1, padding: '0.35rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer',
                        background: authMode === m ? 'var(--primary-accent)' : 'var(--bg)',
                        color: authMode === m ? '#fff' : 'var(--muted)',
                        border: '1px solid var(--border)',
                      }}>
                      {m === 'password' ? 'Password' : 'Private Key'}
                    </button>
                  ))}
                </div>

                {authMode === 'password' ? (
                  <div>
                    <label style={labelStyle}>Password</label>
                    <input style={inputStyle} type="password" value={form.password}
                      onChange={(e) => set('password', e.target.value)} />
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: '0.5rem' }}>
                      <label style={labelStyle}>Private Key (PEM)</label>
                      <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.7rem' }}
                        value={form.private_key} placeholder="-----BEGIN RSA PRIVATE KEY-----"
                        onChange={(e) => set('private_key', e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Passphrase (optional)</label>
                      <input style={inputStyle} type="password" value={form.passphrase}
                        onChange={(e) => set('passphrase', e.target.value)} />
                    </div>
                  </>
                )}

                {initial?.has_credentials && (
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.7rem', color: 'var(--positive)' }}>
                    <ShieldCheck size={10} style={{ display: 'inline', marginRight: 3 }} />
                    Credentials saved — leave fields blank to keep existing
                  </p>
                )}
              </fieldset>
            )}

            {/* Toggles */}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <Toggle label="Enabled" value={!!form.enabled} onChange={(v) => set('enabled', v)} />
              <Toggle
                label="Auto-Remediate"
                value={!!form.auto_remediate}
                onChange={(v) => set('auto_remediate', v)}
                hint="Skip human approval gate and auto-execute remediation steps"
                color="var(--warn)"
              />
            </div>

            {error && (
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--negative)', background: 'color-mix(in srgb, var(--negative) 10%, transparent)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                {error}
              </p>
            )}
          </div>

          {/* Pinned footer */}
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button type="button" className="icon-btn" style={{ padding: '0.5rem 1.25rem' }} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{
                padding: '0.5rem 1.25rem', borderRadius: '6px', fontWeight: 600, fontSize: '0.8rem',
                background: 'var(--primary-accent)', color: '#fff', border: 'none', cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}>
              {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Source'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Small reusable toggle ────────────────────────────────────────────────────

function Toggle({ label, value, onChange, hint, color }: {
  label: string; value: boolean; onChange: (v: boolean) => void; hint?: string; color?: string
}) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      title={hint}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none',
        border: '1px solid var(--border)', borderRadius: '8px', padding: '0.4rem 0.75rem',
        cursor: 'pointer', color: value ? (color ?? 'var(--positive)') : 'var(--muted)',
        fontSize: '0.75rem', fontWeight: 500, flex: 1,
      }}>
      {value
        ? <ToggleRight size={16} style={{ color: color ?? 'var(--positive)' }} />
        : <ToggleLeft size={16} />}
      {label}
    </button>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.45rem 0.65rem', fontSize: '0.82rem', color: 'var(--text)', outline: 'none' }

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SourcesPage() {
  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<{ open: boolean; editing: Monitor | null }>({ open: false, editing: null })
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setMonitors(await listMonitors())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load monitors')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleSave(payload: MonitorPayload) {
    if (modal.editing) {
      await updateMonitor(modal.editing.id, payload)
    } else {
      await createMonitor(payload)
    }
    await load()
  }

  async function handleDelete(m: Monitor) {
    if (!confirm(`Delete "${m.name}"? This cannot be undone.`)) return
    setDeleting(m.id)
    try {
      await deleteMonitor(m.id)
      await load()
    } finally {
      setDeleting(null)
    }
  }

  async function handleToggle(m: Monitor) {
    setToggling(m.id)
    try {
      await toggleMonitor(m.id, !m.enabled)
      await load()
    } finally {
      setToggling(null)
    }
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Log Sources</h1>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
            Configure archive servers and local files for continuous incident monitoring
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="icon-btn" onClick={load} title="Refresh" disabled={loading}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
          </button>
          <button
            onClick={() => setModal({ open: true, editing: null })}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              background: 'var(--primary-accent)', color: '#fff',
              border: 'none', borderRadius: '8px', padding: '0.45rem 0.9rem',
              fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
            }}>
            <Plus size={14} /> Add Source
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {(Object.keys(TYPE_LABELS) as MonitorType[]).map((t) => {
          const Icon = TYPE_ICONS[t]
          return (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: 'var(--muted)' }}>
              <Icon size={11} style={{ color: TYPE_COLORS[t] }} /> {TYPE_LABELS[t]}
            </span>
          )
        })}
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: 'var(--muted)' }}>
          <Zap size={11} style={{ color: 'var(--warn)' }} /> Auto-Remediate
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: 'var(--muted)' }}>
          <ShieldCheck size={11} style={{ color: 'var(--positive)' }} /> Manual Approval
        </span>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: 'color-mix(in srgb, var(--negative) 12%, transparent)', border: '1px solid var(--negative)', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--negative)' }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && monitors.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '1px dashed var(--border)', borderRadius: '12px' }}>
          <Server size={32} style={{ color: 'var(--muted)', marginBottom: '0.75rem' }} />
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>No log sources configured yet</p>
          <p style={{ margin: '0.3rem 0 1rem', color: 'var(--muted)', fontSize: '0.78rem' }}>
            Add a source to start monitoring servers and local files for incidents
          </p>
          <button
            onClick={() => setModal({ open: true, editing: null })}
            style={{ background: 'var(--primary-accent)', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.5rem 1.1rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={13} style={{ display: 'inline', marginRight: 5 }} /> Add your first source
          </button>
        </div>
      )}

      {/* Monitor cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {monitors.map((m) => {
          const Icon = TYPE_ICONS[m.type]
          const isToggling = toggling === m.id
          const isDeleting = deleting === m.id

          return (
            <div key={m.id} style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px',
              padding: '1rem 1.25rem', opacity: m.enabled ? 1 : 0.55, transition: 'opacity 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
                {/* Icon */}
                <div style={{ width: 36, height: 36, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${TYPE_COLORS[m.type]} 15%, transparent)`, flexShrink: 0 }}>
                  <Icon size={16} style={{ color: TYPE_COLORS[m.type] }} />
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{m.name}</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '20px', background: `color-mix(in srgb, ${TYPE_COLORS[m.type]} 15%, transparent)`, color: TYPE_COLORS[m.type] }}>
                      {TYPE_LABELS[m.type]}
                    </span>
                    {m.auto_remediate ? (
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '20px', background: 'color-mix(in srgb, var(--warn) 15%, transparent)', color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Zap size={9} /> Auto-Remediate
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '20px', background: 'color-mix(in srgb, var(--positive) 12%, transparent)', color: 'var(--positive)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <ShieldCheck size={9} /> Manual Approval
                      </span>
                    )}
                    {!m.enabled && (
                      <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: '20px', background: 'var(--bg)', color: 'var(--muted)' }}>
                        Paused
                      </span>
                    )}
                  </div>

                  <div style={{ marginTop: '0.35rem', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                    {m.host && <Meta label={m.type.startsWith('syslog') ? 'Listen' : 'Host'} value={`${m.host}${m.port ? `:${m.port}` : ''}`} />}
                    {m.log_path && <Meta label="Path" value={m.log_path} />}
                    {!m.type.startsWith('syslog') && <Meta label="Interval" value={intervalLabel(m.scan_interval)} />}
                    {m.has_credentials && <Meta label="Auth" value="Credentials saved" />}
                    <Meta label="Last scan" value={fmt(m.last_scanned_at ?? undefined)} />
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                  <button
                    className="icon-btn"
                    onClick={() => handleToggle(m)}
                    disabled={isToggling}
                    title={m.enabled ? 'Pause monitor' : 'Enable monitor'}
                    style={{ color: m.enabled ? 'var(--positive)' : 'var(--muted)' }}>
                    {m.enabled
                      ? <ToggleRight size={16} style={{ color: 'var(--positive)' }} />
                      : <ToggleLeft size={16} />}
                  </button>
                  <button className="icon-btn" title="Edit" onClick={() => setModal({ open: true, editing: m })}>
                    <Pencil size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    title="Delete"
                    disabled={isDeleting}
                    onClick={() => handleDelete(m)}
                    style={{ color: 'var(--negative)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal */}
      {modal.open && (
        <MonitorModal
          initial={modal.editing}
          onSave={handleSave}
          onClose={() => setModal({ open: false, editing: null })}
        />
      )}
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ fontSize: '0.72rem' }}>
      <span style={{ color: 'var(--muted)' }}>{label}: </span>
      <span style={{ color: 'var(--text)' }}>{value}</span>
    </span>
  )
}
