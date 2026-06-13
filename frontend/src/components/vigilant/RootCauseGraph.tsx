import { useState, useMemo } from "react";
import { GraphNode, GraphLink } from "../../types/vigilant";
import { Info, Activity, Sparkles, AlertCircle } from "lucide-react";

interface RootCauseGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
  isDarkMode?: boolean;
}

export default function RootCauseGraph({ nodes, links, isDarkMode = true }: RootCauseGraphProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Compute neat layout positions for nodes dynamically
  const nodePositions = useMemo(() => {
    const positions: { [key: string]: { x: number; y: number } } = {};
    if (nodes.length === 0) return positions;

    // Fixed predefined layout for standard stripe/auth cases to match screenshots exactly
    const overrides: { [key: string]: { x: number; y: number } } = {
      api_gateway: { x: 30, y: 25 },
      stripe_node: { x: 70, y: 65 },
      stripe_api: { x: 20, y: 75 },
      auth_service: { x: 80, y: 20 },
      aws_sts: { x: 30, y: 30 },
      iam_auditor: { x: 70, y: 55 },
      db_sync: { x: 50, y: 80 },
    };

    nodes.forEach((node, index) => {
      if (overrides[node.id]) {
        positions[node.id] = overrides[node.id];
      } else {
        // Fallback: arrange others beautifully in an orbit grid
        const angle = (index / nodes.length) * Math.PI * 2;
        positions[node.id] = {
          x: 50 + Math.cos(angle) * 30,
          y: 50 + Math.sin(angle) * 30,
        };
      }
    });

    return positions;
  }, [nodes]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className={`relative w-full h-[320px] md:h-[400px] rounded-xl overflow-hidden flex flex-col justify-between transition-colors ${
      isDarkMode 
        ? "bg-slate-950/20 border border-white/5" 
        : "bg-[#f8fafc] border border-slate-200 shadow-inner"
    }`}>
      {/* Absolute ambient light aura */}
      {isDarkMode && (
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-500/10 blur-[90px] animate-pulse rounded-full"></div>
          {nodes.some((n) => n.status === "error") && (
            <div className="absolute top-1/3 left-1/3 w-32 h-32 bg-red-500/10 blur-[80px] animate-pulse rounded-full"></div>
          )}
        </div>
      )}

      {/* SVG Connection Lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="glowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#EF4444" stopOpacity="0.8" />
          </linearGradient>
          <marker id="arrow" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={isDarkMode ? "rgba(255,255,255,0.15)" : "rgba(100,116,139,0.3)"} />
          </marker>
        </defs>

        {links.map((link, idx) => {
          const fromPos = nodePositions[link.from];
          const toPos = nodePositions[link.to];

          if (!fromPos || !toPos) return null;

          // Convert percents to strings or calculate pixels
          const x1 = `${fromPos.x}%`;
          const y1 = `${fromPos.y}%`;
          const x2 = `${toPos.x}%`;
          const y2 = `${toPos.y}%`;

          const isErrorLink = link.color === "#EF4444";

          return (
            <g key={idx}>
              {/* Underlying glow layer for links */}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={link.color || "#3B82F6"}
                strokeWidth={isErrorLink ? "3" : "1.5"}
                className={`opacity-20 ${isErrorLink ? "blur-[2px]" : ""}`}
              />
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={link.color || "#3B82F6"}
                strokeWidth={isErrorLink ? "1.5" : "1"}
                strokeDasharray={link.style === "dashed" ? "5,4" : undefined}
                className={isErrorLink ? "animate-dash" : undefined}
                style={{
                  strokeDashoffset: isErrorLink ? 10 : 0,
                  transition: "stroke-dashoffset 0.5s linear",
                }}
                markerEnd="url(#arrow)"
              />
            </g>
          );
        })}
      </svg>

      {/* Interactive Nodes layer */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        {nodes.map((node) => {
          const pos = nodePositions[node.id];
          if (!pos) return null;

          const isError = node.status === "error";
          const isActive = node.status === "active";
          const isStandby = node.status === "standby";

          // Determine border color and ring styles
          let statusColor = isDarkMode 
            ? "border-sky-500/40 text-sky-400 bg-slate-900/90 hover:border-sky-400" 
            : "border-sky-300 text-sky-700 bg-sky-50 hover:border-sky-500 shadow-3xs";
          let ringColor = "";

          if (isError) {
            statusColor = isDarkMode
              ? "border-red-500/80 text-rose-400 bg-slate-955/90 shadow-[0_0_15px_rgba(239,68,68,0.2)] hover:border-red-400"
              : "border-red-400 text-red-750 bg-red-50 shadow-[0_2px_8px_rgba(239,68,68,0.1)] hover:border-red-400";
            ringColor = "animate-ping absolute inset-0 rounded-lg bg-red-500/20 pointer-events-none";
          } else if (isActive) {
            statusColor = isDarkMode
              ? "border-amber-500/80 text-amber-400 bg-slate-900/90 hover:border-amber-400"
              : "border-amber-400 text-amber-700 bg-amber-50/70 hover:border-amber-500 shadow-3xs";
            ringColor = "animate-pulse absolute inset-0 rounded-lg bg-amber-500/25 pointer-events-none";
          } else if (isStandby) {
            statusColor = isDarkMode
              ? "border-slate-700 text-slate-400 bg-slate-900/60 hover:border-slate-500"
              : "border-slate-300 text-slate-500 bg-slate-100 hover:border-slate-400";
          }

          const isSelected = selectedNodeId === node.id;

          return (
            <div
              key={node.id}
              className="absolute pointer-events-auto transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              onMouseEnter={() => setSelectedNodeId(node.id)}
              onMouseLeave={() => setSelectedNodeId(null)}
              onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
            >
              <div className={`${ringColor}`}></div>
              <div
                className={`px-3 py-2 border rounded-lg text-xs font-mono transition-all duration-300 flex flex-col items-center cursor-pointer select-none max-w-[150px] text-center ${statusColor} ${
                  isSelected 
                    ? isDarkMode 
                      ? "scale-105 ring-2 ring-blue-500/50 border-blue-400 bg-slate-955" 
                      : "scale-105 ring-2 ring-blue-500/30 border-blue-500 bg-white shadow-md text-blue-800"
                    : ""
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold tracking-tight">
                  {isError && <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                  {node.label}
                </div>
                <div className={`text-[10px] mt-0.5 font-sans truncate w-full ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                  {node.details}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Graph Status HUD Overlay */}
      <div className={`p-3 w-full flex justify-between items-center z-30 pointer-events-none select-none border-b transition-colors ${
        isDarkMode 
          ? "bg-gradient-to-b from-slate-950/60 to-transparent border-transparent" 
          : "bg-slate-100/70 border-slate-200"
      }`}>
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
          <span className={`text-[10px] font-mono uppercase tracking-widest ${
            isDarkMode ? "text-slate-400" : "text-slate-650"
          }`}>Topology Realtime Map</span>
        </div>
        <div className="flex gap-2">
          <span className={`text-[10px] border px-2 py-0.5 rounded-full flex items-center gap-1 ${
            isDarkMode 
              ? "text-rose-400 bg-red-950/30 border-red-900/50" 
              : "text-red-700 bg-red-50 border-red-200 font-medium"
          }`}>
            <span className="w-1 h-1 bg-red-500 rounded-full animate-ping"></span>
            anomaly flagged
          </span>
        </div>
      </div>

      {/* Selected Node Details Tooltip HUD */}
      <div className={`p-3 w-full z-30 pointer-events-auto border-t transition-all min-h-[50px] flex items-center justify-between ${
        isDarkMode 
          ? "bg-gradient-to-t from-slate-950/95 via-slate-950/60 to-transparent border-white/5 text-slate-400" 
          : "bg-slate-50 border-slate-200 text-slate-600"
      }`}>
        {selectedNode ? (
          <div className="flex flex-col gap-2 w-full text-xs animate-fadeIn">
            <div className="flex items-center justify-between border-b border-white/5 pb-1">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-500 shrink-0" />
                <span className={`font-sans font-bold ${isDarkMode ? "text-slate-200" : "text-slate-800"}`}>
                  {selectedNode.label}
                </span>
                <span className={`text-[9px] px-1.5 py-0.2 rounded font-sans uppercase font-bold ${
                  selectedNode.status === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                  selectedNode.status === 'active' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                  'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                }`}>
                  {selectedNode.status.toUpperCase()}
                </span>
              </div>
              <span className={`text-[10px] font-sans ${isDarkMode ? "text-slate-500" : "text-slate-450"}`}>
                ID: {selectedNode.id}
              </span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-1">
              <div>
                <span className="text-[9px] text-slate-500 uppercase font-sans block">Latency</span>
                <span className={`font-mono font-bold ${selectedNode.status === 'error' ? 'text-rose-400' : isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  {selectedNode.status === 'error' ? '3200ms' : selectedNode.status === 'active' ? '850ms' : '140ms'}
                </span>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 uppercase font-sans block">Error Rate</span>
                <span className={`font-mono font-bold ${selectedNode.status === 'error' ? 'text-rose-400' : isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  {selectedNode.status === 'error' ? '15%' : '0%'}
                </span>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 uppercase font-sans block">Related Logs</span>
                <span className={`font-mono font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  {selectedNode.status === 'error' ? '132' : '12'}
                </span>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 uppercase font-sans block">Linked Evidence</span>
                <span className={`font-mono font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  {selectedNode.status === 'error' ? '27' : '0'}
                </span>
              </div>
              <div className="col-span-2 md:col-span-1">
                <span className="text-[9px] text-slate-500 uppercase font-sans block">Agent Notes</span>
                <span className={`font-sans text-[10px] leading-tight block truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`} title={selectedNode.details}>
                  {selectedNode.status === 'error' ? 'Outage detected.' : 'Operational. Matches baseline.'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className={`text-[11px] flex items-center gap-1.5 mx-auto py-1 ${isDarkMode ? "text-slate-500" : "text-slate-500"}`}>
            <Sparkles className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
            Hover or click nodes inside network graph to inspect real-time log values
          </div>
        )}
      </div>
    </div>
  );
}
