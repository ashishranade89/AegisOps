const API_BASE = '/api/incident'

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { ...extra }
}

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
  const res = await fetch(`${API_BASE}/scenarios`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function startIncident(
  scenarioType: string,
  options: {
    openrouterApiKey?: string
    tavilyApiKey?: string
    llmModel?: string
    customTelemetry?: any
    clientKeysAllowed?: boolean
  } = {}
): Promise<StartIncidentResponse> {
  const body: Record<string, unknown> = {
    scenario_type: scenarioType,
    llm_model: options.llmModel,
    custom_telemetry: options.customTelemetry,
  }

  // Always forward user-supplied keys — backend decides whether to use them
  // based on ALLOW_CLIENT_API_KEYS. This prevents silent failures when the
  // server has no server-side key configured.
  if (options.openrouterApiKey) body.openrouter_api_key = options.openrouterApiKey
  if (options.tavilyApiKey) body.tavily_api_key = options.tavilyApiKey

  // Forward Jira credentials from localStorage so the backend can create tickets
  const jiraBaseUrl = localStorage.getItem('jira_base_url') || ''
  const jiraEmail = localStorage.getItem('jira_email') || ''
  const jiraApiToken = localStorage.getItem('jira_api_token') || ''
  const jiraProjectKey = localStorage.getItem('jira_project_key') || ''
  if (jiraBaseUrl && jiraEmail && jiraApiToken) {
    body.jira_base_url = jiraBaseUrl
    body.jira_email = jiraEmail
    body.jira_api_token = jiraApiToken
    if (jiraProjectKey) body.jira_project_key = jiraProjectKey
  }

  // Forward Slack credentials from localStorage so the backend can post notifications
  const slackBotToken = localStorage.getItem('slack_bot_token') || ''
  const slackChannelId = localStorage.getItem('slack_channel_id') || ''
  if (slackBotToken && slackChannelId) {
    body.slack_bot_token = slackBotToken
    body.slack_channel_id = slackChannelId
  }

  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

  const res = await fetch(`/api/incident/${runId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, openrouter_api_key: openrouterApiKey, llm_model: llmModel }),
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

  const res = await fetch(`${API_BASE}/${runId}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approval, openrouter_api_key: openrouterApiKey, llm_model: llmModel }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function stopIncident(runId: string): Promise<{ run_id: string; status: string }> {
  const res = await fetch(`${API_BASE}/${runId}/stop`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export interface VendorFrequency {
  vendor: string
  count: number
  failures: number
  failure_rate: number
}

export interface VendorMttr {
  vendor: string
  mean_seconds: number
  median_seconds: number
  count: number
}

export interface TrendsResponse {
  total_runs: number
  vendor_frequency: VendorFrequency[]
  mttr_by_vendor: VendorMttr[]
  time_of_day: number[]
  overall_mttr_seconds: { mean: number; median: number; std: number }
}

export interface AgentCost {
  agent: string
  cost_usd: number
  input_tokens: number
  output_tokens: number
}

export interface CostReportResponse {
  window_days: number
  total_cost_usd: number
  run_count: number
  avg_cost_per_run: number
  most_expensive_agent: string | null
  by_agent: AgentCost[]
  cost_over_time: Array<{ date: string; cost_usd: number }>
}

export async function getAnalyticsTrends(): Promise<TrendsResponse> {
  const res = await fetch('/api/analytics/trends', { headers: authHeaders() })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getAnalyticsCost(windowDays = 30): Promise<CostReportResponse> {
  const res = await fetch(`/api/analytics/cost?window_days=${windowDays}`, { headers: authHeaders() })
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

// ─── Slack / Jira Integration Tests ───────────────────────────────────────────

export interface TestResult {
  ok: boolean
  message: string
}

export async function testSlack(creds: {
  slack_bot_token: string
}): Promise<TestResult> {
  try {
    const res = await fetch('/api/test/slack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slack_bot_token: creds.slack_bot_token }),
    })
    if (!res.ok) return { ok: false, message: 'Could not reach server — try again' }
    return res.json()
  } catch {
    return { ok: false, message: 'Network error — check your connection' }
  }
}

export async function testJira(creds: {
  jira_base_url: string
  jira_email: string
  jira_api_token: string
}): Promise<TestResult> {
  try {
    const res = await fetch('/api/test/jira', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds),
    })
    if (!res.ok) return { ok: false, message: 'Could not reach server — try again' }
    return res.json()
  } catch {
    return { ok: false, message: 'Network error — check your connection' }
  }
}
