import { cn } from '@/lib/utils'
import { Check, Cpu, ChevronDown, ChevronUp } from 'lucide-react'

// Define coordinates and metadata for all nodes
interface NodeMeta {
  id: string
  label: string
  x: number
  y: number
  role: string
}

const NODES: NodeMeta[] = [
  { id: 'triage', label: 'Triage', x: 80, y: 150, role: 'Telemetry Parser' },
  { id: 'rag_search', label: 'RAG Lookup', x: 230, y: 150, role: 'History Search' },
  { id: 'rca', label: 'RCA Decision', x: 380, y: 150, role: 'Routing Planner' },
  { id: 'browser', label: 'Stagehand Scrape', x: 530, y: 75, role: 'Browser Scraper' },
  { id: 'web_search', label: 'Tavily Search', x: 530, y: 225, role: 'Web Search Fallback' },
  { id: 'self_heal', label: 'Self Healing', x: 380, y: 300, role: 'Exception recovery' },
  { id: 'remediation', label: 'Remediation', x: 700, y: 150, role: 'Slack/Jira containment' },
  { id: 'reporter', label: 'Report Generator', x: 850, y: 150, role: 'Postmortem compiler' },
  { id: 'store_incident', label: 'Archive RAG', x: 990, y: 150, role: 'ChromaDB Archiver' },
]

// List of connections to draw in graph
const CONNECTIONS = [
  { from: 'triage', to: 'rag_search' },
  { from: 'rag_search', to: 'rca', curve: false },
  { from: 'rag_search', to: 'remediation', curve: true, controlY: 30 }, // Bypass path
  { from: 'rca', to: 'browser' },
  { from: 'rca', to: 'web_search' },
  { from: 'rca', to: 'remediation' },
  { from: 'browser', to: 'web_search', curve: false },
  { from: 'browser', to: 'remediation' },
  { from: 'web_search', to: 'remediation' },
  { from: 'remediation', to: 'reporter' },
  { from: 'reporter', to: 'store_incident' },
  // Self-heal triggers (failure routing)
  { from: 'rca', to: 'self_heal', dashed: true },
  { from: 'browser', to: 'self_heal', dashed: true },
  { from: 'web_search', to: 'self_heal', dashed: true },
  { from: 'self_heal', to: 'rca', curve: true, controlX: 320 },
  { from: 'self_heal', to: 'browser', curve: true, controlX: 470 }
]

interface TopologyGraphProps {
  activeAgent: string | null
  completedNodes: string[]
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export function TopologyGraph({ activeAgent, completedNodes, collapsed = false, onToggleCollapse }: TopologyGraphProps) {
  // Map agent name to node ID
  const activeNodeId = (() => {
    if (!activeAgent) return null
    if (activeAgent.includes('Triage')) return 'triage'
    if (activeAgent.includes('RAG Cache') || activeAgent.includes('RAG Search')) return 'rag_search'
    if (activeAgent.includes('Root Cause')) return 'rca'
    if (activeAgent.includes('Browser') || activeAgent.includes('Scraper')) return 'browser'
    if (activeAgent.includes('Web Search')) return 'web_search'
    if (activeAgent.includes('Self-Heal') || activeAgent.includes('Healing')) return 'self_heal'
    if (activeAgent.includes('Remediation')) return 'remediation'
    if (activeAgent.includes('Reporter') || activeAgent.includes('Report')) return 'reporter'
    if (activeAgent.includes('Storage') || activeAgent.includes('Archive')) return 'store_incident'
    return null
  })()

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div 
        className="card-head" 
        style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={onToggleCollapse}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Cpu className="muted spin-slow" size={16} />
          <div>
            <div className="card-title">Routing Topology {collapsed ? '(Collapsed)' : ''}</div>
            <div className="card-sub">Live visualization of LangGraph state execution path</div>
          </div>
        </div>
        <button 
          className="icon-btn" 
          style={{ padding: 4 }}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse?.();
          }}
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {!collapsed && (
        <div className="w-full overflow-x-auto custom-scrollbar pb-2">
          <svg viewBox="0 0 1070 360" className="w-full h-auto min-w-[700px] block" style={{ overflow: 'visible', maxHeight: '360px' }}>
          <defs>
            {/* Glow Filter for Active Nodes */}
            <filter id="svg-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            
            {/* Arrow Head markers */}
            <marker
              id="arrowhead"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="var(--line-strong)" />
            </marker>
            <marker
              id="active-arrowhead"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="var(--primary-accent)" />
            </marker>
          </defs>

          {/* Connections / Edges */}
          {CONNECTIONS.map((conn, idx) => {
            const fromNode = NODES.find((n) => n.id === conn.from)
            const toNode = NODES.find((n) => n.id === conn.to)
            if (!fromNode || !toNode) return null

            const isFlowing = activeNodeId === conn.from
            const isDashed = conn.dashed

            // Calculate path coordinate
            let pathD = `M ${fromNode.x} ${fromNode.y} L ${toNode.x} ${toNode.y}`
            if (conn.curve) {
              const controlX = conn.controlX ?? (fromNode.x + toNode.x) / 2
              const controlY = conn.controlY ?? (fromNode.y + toNode.y) / 2 - 20
              pathD = `M ${fromNode.x} ${fromNode.y} Q ${controlX} ${controlY} ${toNode.x} ${toNode.y}`
            }

            return (
              <g key={`conn-${idx}`}>
                <path
                  d={pathD}
                  fill="none"
                  stroke={isFlowing ? 'var(--primary-accent)' : 'var(--line)'}
                  strokeWidth={isFlowing ? 2.5 : 1.5}
                  strokeDasharray={isDashed ? '5,5' : isFlowing ? '6,6' : 'none'}
                  markerEnd={isFlowing ? 'url(#active-arrowhead)' : 'url(#arrowhead)'}
                  className={cn(
                    'transition-colors duration-500',
                    isFlowing && 'animate-dash-flow'
                  )}
                />
              </g>
            )
          })}

          {/* Nodes */}
          {NODES.map((node) => {
            const isActive = activeNodeId === node.id
            const isCompleted = completedNodes.includes(node.id)

            return (
              <g
                key={node.id}
                className={cn(
                  'cursor-default transition-all duration-500',
                  isActive && 'scale-105'
                )}
                style={{ transformOrigin: `${node.x}px ${node.y}px` }}
              >
                {/* Node Outer Halo Ring */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={22}
                  fill="none"
                  stroke={isActive ? 'var(--primary-accent)' : isCompleted ? 'var(--positive)' : 'transparent'}
                  strokeWidth="2"
                  className={cn(
                    'transition-all duration-500',
                    isActive && 'animate-pulse'
                  )}
                />

                {/* Node Core Circle */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={18}
                  filter={isActive ? 'url(#svg-glow)' : 'none'}
                  fill="var(--surface-2)"
                  stroke={isActive ? 'var(--primary-accent)' : isCompleted ? 'var(--positive)' : 'var(--line-strong)'}
                  strokeWidth={isActive || isCompleted ? '2.5' : '1.5'}
                  className="transition-all duration-500"
                />

                {/* Inner Icon / Text Status Indicator */}
                {isCompleted ? (
                  <g transform={`translate(${node.x - 5}, ${node.y - 5})`}>
                    <Check size={10} className="completed" style={{ color: 'var(--positive)', strokeWidth: 3 }} />
                  </g>
                ) : isActive ? (
                  <circle cx={node.x} cy={node.y} r={3} fill="var(--primary-accent)" />
                ) : null}

                {/* Label text */}
                <text
                  x={node.x}
                  y={node.y - 28}
                  textAnchor="middle"
                  fill={isActive ? 'var(--primary-accent)' : isCompleted ? 'var(--positive)' : 'var(--ink)'}
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    fontFamily: 'var(--font-ui)',
                    transition: 'fill 300ms'
                  }}
                >
                  {node.label}
                </text>

                {/* Role tooltip subtext */}
                <text
                  x={node.x}
                  y={node.y + 30}
                  textAnchor="middle"
                  fill="var(--ink-3)"
                  style={{
                    fontSize: '9.5px',
                    fontFamily: 'var(--font-ui)',
                    pointerEvents: 'none'
                  }}
                >
                  {node.role}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      )}
    </div>
  )
}
