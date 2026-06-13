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
