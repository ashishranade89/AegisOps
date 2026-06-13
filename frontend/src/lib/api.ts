const API_BASE = '/api/incident'

export interface StartIncidentResponse {
  run_id: string
  status: string
}

export interface ScenarioInfo {
  scenario_type: string
  name: string
  description: string
}

export interface HealthResponse {
  status: string
  llm_configured: boolean
  auth_required: boolean
  client_keys_allowed: boolean
  server_instance_id: string
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  const apiKey = localStorage.getItem('incident_api_key')
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }
  return headers
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch('/health')
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function listScenarios(): Promise<ScenarioInfo[]> {
  const res = await fetch(`${API_BASE}/scenarios`, { headers: authHeaders() })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function startIncident(
  scenarioType: string,
  options: {
    openrouterApiKey?: string
    tavilyApiKey?: string
    llmModel?: string
    llmBaseUrl?: string
    customTelemetry?: any
    clientKeysAllowed?: boolean
  } = {}
): Promise<StartIncidentResponse> {
  const body: Record<string, unknown> = {
    scenario_type: scenarioType,
    llm_model: options.llmModel,
    llm_base_url: options.llmBaseUrl,
    custom_telemetry: options.customTelemetry,
  }

  if (options.clientKeysAllowed) {
    if (options.openrouterApiKey) body.openrouter_api_key = options.openrouterApiKey
    if (options.tavilyApiKey) body.tavily_api_key = options.tavilyApiKey
  }

  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function chatAboutIncident(
  runId: string,
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<{ reply: string; retry_mode?: boolean; retry_count?: number }> {
  const openrouterApiKey = localStorage.getItem('openrouter_key') || undefined
  const llmModel = localStorage.getItem('llm_model') || undefined
  const llmBaseUrl = localStorage.getItem('llm_base_url') || undefined

  const res = await fetch(`/api/incident/${runId}/chat`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ message, history, openrouter_api_key: openrouterApiKey, llm_model: llmModel, llm_base_url: llmBaseUrl }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function resumeIncident(
  runId: string,
  approval: { status: string; judge_name?: string; comments?: string }
): Promise<{ run_id: string; status: string }> {
  const openrouterApiKey = localStorage.getItem('openrouter_key') || undefined
  const llmModel = localStorage.getItem('llm_model') || undefined
  const llmBaseUrl = localStorage.getItem('llm_base_url') || undefined

  const res = await fetch(`${API_BASE}/${runId}/resume`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ approval, openrouter_api_key: openrouterApiKey, llm_model: llmModel, llm_base_url: llmBaseUrl }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function stopIncident(runId: string): Promise<{ run_id: string; status: string }> {
  const res = await fetch(`${API_BASE}/${runId}/stop`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ─── Log Source Monitors ───────────────────────────────────────────────────────

export type MonitorType = 'local' | 'ssh' | 'syslog_udp' | 'syslog_tcp'

export interface MonitorCredentials {
  username?: string
  password?: string
  private_key?: string
  passphrase?: string
}

export interface Monitor {
  id: string
  name: string
  type: MonitorType
  host?: string
  port?: number
  log_path?: string
  scan_interval: number
  enabled: boolean
  auto_remediate: boolean
  has_credentials: boolean
  byte_offset: number
  last_scanned_at?: string
  created_at: string
  updated_at: string
}

export interface MonitorPayload {
  name: string
  type: MonitorType
  host?: string
  port?: number
  log_path?: string
  scan_interval?: number
  enabled?: boolean
  auto_remediate?: boolean
  credentials?: MonitorCredentials
}

export async function listMonitors(): Promise<Monitor[]> {
  const res = await fetch('/api/monitors', { headers: authHeaders() })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function createMonitor(payload: MonitorPayload): Promise<Monitor> {
  const res = await fetch('/api/monitors', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updateMonitor(id: string, payload: Partial<MonitorPayload>): Promise<Monitor> {
  const res = await fetch(`/api/monitors/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteMonitor(id: string): Promise<void> {
  const res = await fetch(`/api/monitors/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function toggleMonitor(id: string, enabled: boolean): Promise<Monitor> {
  const res = await fetch(`/api/monitors/${id}/toggle`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ enabled }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
