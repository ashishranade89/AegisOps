import { create } from 'zustand'
import { GraphNode, GraphLink } from '@/types/vigilant'

export type IncidentPhase =
  | 'triage'
  | 'log_analysis'
  | 'metrics_analysis'
  | 'root_cause_analysis'
  | 'remediation'
  | 'reporting'
  | 'paused_for_approval'
  | 'completed'

export type RunStatus = 'idle' | 'pending' | 'running' | 'paused' | 'completed' | 'failed'

export interface TimelineEvent {
  type: string
  agent_name?: string
  detail?: string
  phase?: string
  message?: string
  timestamp: number
  // cost_update fields
  input_tokens?: number
  output_tokens?: number
  cost_usd?: number
  run_total_usd?: number
}

export interface AgentCost {
  input_tokens: number
  output_tokens: number
  cost_usd: number
}

const AGENT_TO_NODE_MAP: Record<string, string> = {
  "Triage Agent": "triage",
  "Jira Integration": "jira",
  "RAG Cache Lookup": "rag_search",
  "Root Cause Analyzer": "rca",
  "Browser Scraper Agent": "browser",
  "Web Search Agent": "web_search",
  "Self-Heal Agent": "self_heal",
  "Remediation Agent": "remediation",
  "Incident Reporter": "reporter",
  "Slack Report": "slack_report",
  "RAG Storage Node": "store_incident"
}

export interface BrowserResult {
  vendor: string
  url: string
  source: string
  data: {
    has_active_incident: boolean
    incident_title?: string
    incident_description?: string
    affected_services?: string[]
    status_summary?: string
    current_status?: string
    live_data?: boolean
  }
}

export interface ApprovalContext {
  root_cause?: string
  suspected_vendor?: string
  severity?: string
  internal_findings?: string
  hypotheses?: Array<{ label: string; confidence: number; rationale: string[] }>
  browser_result?: BrowserResult
  web_search_result?: object
}

export interface SlackMessage {
  status: 'posted' | 'skipped' | 'dry_run' | 'error'
  channel_id?: string
  message_ts?: string
  thread_url?: string
  reason?: string
}

interface IncidentStoreState {
  runId: string | null
  scenario: string
  status: RunStatus
  phase: IncidentPhase
  report: string
  events: TimelineEvent[]
  activeAgent: string | null
  completedNodes: string[]
  chatOpen: boolean
  agentCosts: Record<string, AgentCost>
  totalCostUsd: number
  browserResult: BrowserResult | null
  approvalContext: ApprovalContext | null
  graphNodes: GraphNode[]
  graphLinks: GraphLink[]
  jiraTicketId: string | null
  jiraTicketUrl: string | null
  slackMessage: SlackMessage | null

  setRunId: (id: string) => void
  setScenario: (scenario: string) => void
  setStatus: (status: RunStatus) => void
  setPhase: (phase: IncidentPhase) => void
  setReport: (report: string) => void
  addEvent: (event: TimelineEvent) => void
  recordCost: (data: { agent_name: string; input_tokens: number; output_tokens: number; cost_usd: number; run_total_usd: number }) => void
  setChatOpen: (open: boolean) => void
  setBrowserResult: (result: BrowserResult) => void
  setApprovalContext: (ctx: ApprovalContext) => void
  setGraphData: (nodes: GraphNode[], links: GraphLink[]) => void
  setJiraTicket: (id: string, url: string) => void
  setSlackMessage: (msg: SlackMessage) => void
  reset: () => void
}

const initialState = {
  runId: null,
  scenario: '',
  status: 'idle' as RunStatus,
  phase: 'triage' as IncidentPhase,
  report: '',
  events: [] as TimelineEvent[],
  activeAgent: null as string | null,
  completedNodes: [],
  chatOpen: true,
  agentCosts: {} as Record<string, AgentCost>,
  totalCostUsd: 0,
  browserResult: null as BrowserResult | null,
  approvalContext: null as ApprovalContext | null,
  graphNodes: [] as GraphNode[],
  graphLinks: [] as GraphLink[],
  jiraTicketId: null as string | null,
  jiraTicketUrl: null as string | null,
  slackMessage: null as SlackMessage | null,
}

export const useIncidentStore = create<IncidentStoreState>((set) => ({
  ...initialState,
  setRunId: (runId) => set({ runId, status: 'pending', completedNodes: [], agentCosts: {}, totalCostUsd: 0, report: '', approvalContext: null, events: [], activeAgent: null }),
  setScenario: (scenario) => set({ scenario }),
  setStatus: (status) => set({ status }),
  setPhase: (phase) =>
    set({
      phase,
      status:
        phase === 'completed'
          ? 'completed'
          : phase === 'paused_for_approval'
            ? 'paused'
            : 'running',
    }),
  setReport: (report) => set({ report }),
  addEvent: (event) => set((s) => {
    let nextActive = s.activeAgent
    let nextCompleted = [...s.completedNodes]

    if (event.type === 'agent_start' && event.agent_name) {
      nextActive = event.agent_name
    } else if (event.type === 'agent_end' && event.agent_name) {
      nextActive = null
      const nodeId = AGENT_TO_NODE_MAP[event.agent_name]
      if (nodeId && !nextCompleted.includes(nodeId)) {
        nextCompleted.push(nodeId)
      }
    }

    return {
      events: [...s.events, event],
      activeAgent: nextActive,
      completedNodes: nextCompleted
    }
  }),
  recordCost: ({ agent_name, input_tokens, output_tokens, cost_usd, run_total_usd }) =>
    set((s) => ({
      agentCosts: {
        ...s.agentCosts,
        [agent_name]: { input_tokens, output_tokens, cost_usd }
      },
      totalCostUsd: run_total_usd
    })),
  setChatOpen: (chatOpen) => set({ chatOpen }),
  setBrowserResult: (browserResult) => set({ browserResult }),
  setApprovalContext: (approvalContext) => set({ approvalContext }),
  setGraphData: (graphNodes, graphLinks) => set({ graphNodes, graphLinks }),
  setJiraTicket: (jiraTicketId, jiraTicketUrl) => set({ jiraTicketId, jiraTicketUrl }),
  setSlackMessage: (slackMessage) => set({ slackMessage }),
  reset: () => set(initialState)
}))
