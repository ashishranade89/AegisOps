import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { 
  Shield, Cpu, Terminal, ArrowRight, Sparkles, 
  Play, Settings, Sun, Moon, Clock, AlertCircle,
  UploadCloud, Search, Trash2, ChevronRight, ChevronDown, BookOpen, FileText, RefreshCw, Loader2
} from "lucide-react";
import RootCauseGraph from "@/components/vigilant/RootCauseGraph";
import VendorMonitor from "@/components/vigilant/VendorMonitor";
import { NetworkParticles } from "@/components/vigilant/NetworkParticles";
import { AIGlobeHero } from "@/components/vigilant/AIGlobeHero";
import { IncidentState } from "@/types/vigilant";
import { listScenarios, startIncident, getHealth, ScenarioInfo } from "@/lib/api";
import { useIncidentStore } from "@/stores/incident-store";

// Map backend scenario types to descriptive cards
const PRESETS: Record<string, { name: string; description: string; scenarioType: string; data: any }> = {
  'stripe_gateway_error.json': {
    name: 'Stripe Gateway Outage',
    description: 'Stripe payment gateway API timeouts and 504 Gateway Timeout errors.',
    scenarioType: 'stripe_outage',
    data: {
      raw_logs: [
        { timestamp: "2026-06-12T15:00:00Z", level: "ERROR", service: "payment-service", message: "Stripe API call failed: StripeConnectionError - Request timed out after 30000ms" },
        { timestamp: "2026-06-12T15:00:05Z", level: "ERROR", service: "api-gateway", message: "payment-service endpoint POST /charge returned 504 Gateway Timeout" },
        { timestamp: "2026-06-12T15:00:12Z", level: "INFO", service: "order-service", message: "User cancelled checkout checkout_stripe_98a72e after 45s wait" }
      ],
      raw_metrics: {
        payment_gateway_errors: 92.5,
        payment_gateway_latency_ms: 28950.0,
        http_error_rate_5xx: 0.18
      }
    }
  },
  'aws_s3_degradation.json': {
    name: 'AWS S3 Read Degradation',
    description: 'S3 bucket reading experiencing 500 Server Errors in us-east-1.',
    scenarioType: 'aws_s3_degradation',
    data: {
      raw_logs: [
        { timestamp: "2026-06-12T15:00:00Z", level: "ERROR", service: "media-service", message: "AWS S3 GET bucket 'user-uploads-prod' failed: S3ServiceException - Internal Error (Status Code: 500)" },
        { timestamp: "2026-06-12T15:00:08Z", level: "WARN", service: "profile-service", message: "failed to retrieve profile picture for user_9801: S3 bucket timeout after 10000ms" }
      ],
      raw_metrics: {
        s3_api_error_rate: 0.74,
        s3_read_latency_ms: 8450.0
      }
    }
  }
};

// Rich mock data corresponding to each scenario to make the sandbox interactive instantly
const MOCK_INCIDENTS: Record<string, IncidentState> = {
  stripe_outage: {
    topic: "Stripe Webhook Processing Latency Peaks",
    rootCause: {
      origin: "Stripe API Webhook Node",
      confidence: 98,
      summary: "High volume of webhook delivery retries in eu-west-1 triggered buffer pools exhaustion, leading to packet loss and HTTP 502/504 errors on downstream APIs.",
      severity: "critical",
    },
    graphNodes: [
      { id: "stripe_api", label: "Stripe Webhook Gateway", status: "error", details: "Timeout: 504 Gateway Timeout on /v1/webhooks" },
      { id: "api_gateway", label: "API Gateway", status: "error", details: "502 Errors Peak (14.2k/min)" },
      { id: "stripe_node", label: "Stripe Node", status: "active", details: "Latency: 3200ms" },
      { id: "auth_service", label: "Auth0 Authenticator", status: "stable", details: "Verifying webhooks signatures (operational)" }
    ],
    graphLinks: [
      { from: "stripe_api", to: "api_gateway", style: "dashed", color: "#EF4444" },
      { from: "api_gateway", to: "stripe_node", style: "solid", color: "#3B82F6" },
      { from: "stripe_node", to: "auth_service", style: "dashed", color: "#10B981" }
    ],
    timeline: [
      { time: "14:02 UTC", title: "Anomaly Detected", status: "warning", description: "Webhook listener threadpool utilization exceeded 95% in eu-west-1." },
      { time: "14:15 UTC", title: "Automated Alarm", status: "warning", description: "Stripe status monitor triggered critical alert (Webhook Latency > 1500ms)." },
      { time: "14:38 UTC", title: "Outage Triggered", status: "critical", description: "Core checkout queues saturated. Gateway timeouts started occurring." },
      { time: "14:45 UTC", title: "AI Active Mitigation", status: "success", description: "AegisOps AI identified webhook signature processing bottleneck." }
    ],
    aiInsight: {
      title: "AI WEBHOOK RATE LIMIT INSIGHT",
      message: "The incident correlates with a signature latency bottleneck. It is recommended to scale the webhook listener replica pools or bypass validation cache temporarily to protect database thread pools.",
      remediationCode: `#!/bin/bash
# Scaled Webhook Listener deployment & set temporary configuration
kubectl scale deployment core-webhook-listener --replicas=8
curl -X PATCH https://api.vanguard.internal/v1/config/webhooks \\
  -d '{"bypass_cache": false, "circuit_breaker_threshold": 3000}'
`,
      actionLabel: "APPLY TEMP RE-ROUTING GATEWAY"
    },
    vendorHealth: [
      { name: "STRIPE", status: "outage", barValues: [100, 100, 80, 20, 5] },
      { name: "AWS", status: "operational", barValues: [100, 100, 100, 100, 100] },
      { name: "TWILIO", status: "operational", barValues: [100, 100, 100, 100, 100] },
      { name: "CLOUDFLARE", status: "operational", barValues: [100, 100, 99, 100, 100] }
    ]
  },
  aws_s3_degradation: {
    topic: "AWS S3 Read API Degradation & Handshake Timeouts",
    rootCause: {
      origin: "AWS S3 Object Store",
      confidence: 94,
      summary: "Occasional packet loss in us-east-1 network backplanes causing SSL handshake timeouts and high HTTP 500 error rates when loading static assets.",
      severity: "critical",
    },
    graphNodes: [
      { id: "api_gateway", label: "API Gateway", status: "stable", details: "Operational" },
      { id: "stripe_node", label: "Media Service Controller", status: "error", details: "HTTP 500: Internal Server Error on S3.read" },
      { id: "stripe_api", label: "AWS S3 Endpoint", status: "error", details: "Latency: 8450ms" },
      { id: "auth_service", label: "IAM Auditor", status: "stable", details: "Handshake verified" }
    ],
    graphLinks: [
      { from: "api_gateway", to: "stripe_node", style: "solid", color: "#3B82F6" },
      { from: "stripe_node", to: "stripe_api", style: "dashed", color: "#EF4444" },
      { from: "stripe_api", to: "auth_service", style: "solid", color: "#10B981" }
    ],
    timeline: [
      { time: "15:00 UTC", title: "Latency Breach", status: "warning", description: "AWS S3 bucket query latencies peaked at 8.4s." },
      { time: "15:04 UTC", title: "SSL Errors Spiking", status: "warning", description: "Media-service microservice reported elevated TLS connection timeouts." },
      { time: "15:08 UTC", title: "Downstream Failures", status: "critical", description: "User profile images and file attachments failing to load across 74% of requests." },
      { time: "15:12 UTC", title: "AI Diagnostic Analysis", status: "success", description: "AegisOps detected network degradation on S3 endpoints. Recommended cache redirect." }
    ],
    aiInsight: {
      title: "AWS S3 REDIRECT TO CLOUDFLARE CDN",
      message: "AWS S3 is experiencing internal degraded operations in us-east-1. It is recommended to dynamically route media requests to the Cloudflare fallback cache CDN bucket.",
      remediationCode: `#!/bin/bash
# Update cloud env variables to direct media assets to cloudflare CDN fallback
echo "Configuring media service read redirection..."
curl -X POST -H "Content-Type: application/json" \\
  -d '{"asset_source": "cloudflare_cdn", "s3_fallback_enabled": true}' \\
  https://api.vanguard.internal/v1/config/assets
`,
      actionLabel: "ENABLE CLOUDFLARE CDN FALLBACK"
    },
    vendorHealth: [
      { name: "STRIPE", status: "operational", barValues: [100, 100, 100, 100, 100] },
      { name: "AWS", status: "degraded", barValues: [100, 95, 78, 60, 42] },
      { name: "TWILIO", status: "operational", barValues: [100, 100, 100, 100, 100] },
      { name: "CLOUDFLARE", status: "operational", barValues: [100, 100, 100, 100, 100] }
    ]
  },
  twilio_sms_delay: {
    topic: "Twilio SMS Dispatch Latency & MFA Delay",
    rootCause: {
      origin: "Twilio SMS Gateway API",
      confidence: 91,
      summary: "Twilio outbound delivery queue is experiencing abnormal backup in SMS relays, leading to OTP verification timeouts and MFA code delivery delays of up to 13.6 minutes.",
      severity: "warning",
    },
    graphNodes: [
      { id: "api_gateway", label: "Auth API Gateway", status: "stable", details: "Operational" },
      { id: "stripe_node", label: "Twilio Service Broker", status: "error", details: "Relay Queue Size: 820s delay" },
      { id: "stripe_api", label: "Twilio API Server", status: "error", details: "SLA delivery threshold exceeded" },
      { id: "auth_service", label: "MFA Validator", status: "active", details: "OTP expiration failures peaking" }
    ],
    graphLinks: [
      { from: "api_gateway", to: "stripe_node", style: "solid", color: "#3B82F6" },
      { from: "stripe_node", to: "stripe_api", style: "dashed", color: "#EF4444" },
      { from: "stripe_api", to: "auth_service", style: "solid", color: "#EAB308" }
    ],
    timeline: [
      { time: "16:10 UTC", title: "MFA Expired Anomalies", status: "warning", description: "Authentication logs showed multiple failed OTP verification attempts." },
      { time: "16:12 UTC", title: "Twilio Callback Backlog", status: "warning", description: "Twilio notification webhooks callback reported callback status delay > 600s." },
      { time: "16:18 UTC", title: "Alert Threshold Tripped", status: "critical", description: "MFA code arrival average exceeds 10m SLA." },
      { time: "16:22 UTC", title: "AI Remediation Active", status: "success", description: "AegisOps suggested hot-swapping Twilio to MessageBird / SMS fallback provider." }
    ],
    aiInsight: {
      title: "MFA SMS PROVIDER FAILOVER",
      message: "Twilio SMS API is suffering delivery delays. It is recommended to dynamically toggle the messaging broker provider routing table to use MessageBird API.",
      remediationCode: `#!/bin/bash
# Swapping SMS primary route to MessageBird failover API
curl -X PATCH -H "Authorization: Bearer $AEGISOPS_SEC" \\
  https://api.vanguard.internal/v1/config/sms \\
  -d '{"primary_provider": "messagebird", "failover_retry_limit": 1}'
echo "Failover configured successfully."
`,
      actionLabel: "SWAP primary Messaging Route"
    },
    vendorHealth: [
      { name: "STRIPE", status: "operational", barValues: [100, 100, 100, 100, 100] },
      { name: "AWS", status: "operational", barValues: [100, 100, 100, 100, 100] },
      { name: "TWILIO", status: "degraded", barValues: [100, 85, 62, 50, 48] },
      { name: "CLOUDFLARE", status: "operational", barValues: [100, 100, 100, 100, 100] }
    ]
  },
  cloudflare_dns_failure: {
    topic: "Cloudflare DNS Resolution Failures & Webhook Blocking",
    rootCause: {
      origin: "Cloudflare DNS Ingress Resolvers",
      confidence: 96,
      summary: "External DNS servers failed to resolve incoming partner webhook URLs, resulting in connection refused errors and deployment trigger blocks.",
      severity: "critical",
    },
    graphNodes: [
      { id: "stripe_api", label: "Cloudflare DNS Server", status: "error", details: "DNS lookup: SERVFAIL on endpoints" },
      { id: "api_gateway", label: "Webhook Gateway", status: "error", details: "No ingress mapping found" },
      { id: "stripe_node", label: "Webhook Listener", status: "active", details: "Queue empty" },
      { id: "auth_service", label: "DB Synchronizer", status: "stable", details: "Operational" }
    ],
    graphLinks: [
      { from: "stripe_api", to: "api_gateway", style: "dashed", color: "#EF4444" },
      { from: "api_gateway", to: "stripe_node", style: "solid", color: "#3B82F6" },
      { from: "stripe_node", to: "auth_service", style: "solid", color: "#10B981" }
    ],
    timeline: [
      { time: "17:30 UTC", title: "Uptime Ping Failure", status: "warning", description: "Webhook listener DNS test returned SERVFAIL." },
      { time: "17:35 UTC", title: "Ingress Blocked", status: "warning", description: "Incoming webhooks dropped at API Gateway due to host lookup errors." },
      { time: "17:40 UTC", title: "Deployment Pipeline Staleness", status: "critical", description: "Automatic triggers for production deployments blocked." },
      { time: "17:45 UTC", title: "DNS Fallback Active", status: "success", description: "AegisOps recommended updating primary nameservers to Google DNS." }
    ],
    aiInsight: {
      title: "DNS NAMESERVERS FAILOVER",
      message: "Cloudflare name resolution is failing. It is recommended to update the primary interface nameservers to fallback on Google Public DNS servers.",
      remediationCode: `#!/bin/bash
# Adding Google nameservers to resolv.conf
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf > /dev/null
echo "nameserver 8.8.4.4" | sudo tee -a /etc/resolv.conf > /dev/null
echo "Nameservers successfully updated."
`,
      actionLabel: "APPLY GOOGLE DNS RESOLUTION"
    },
    vendorHealth: [
      { name: "STRIPE", status: "operational", barValues: [100, 100, 100, 100, 100] },
      { name: "AWS", status: "operational", barValues: [100, 100, 100, 100, 100] },
      { name: "TWILIO", status: "operational", barValues: [100, 100, 100, 100, 100] },
      { name: "CLOUDFLARE", status: "outage", barValues: [100, 100, 95, 30, 2] }
    ]
  }
};

export function HomePage({ defaultTab }: { defaultTab?: "history" | "sandbox" }) {
  const navigate = useNavigate();
  const [view, setView] = useState<"landing" | "app">(() => {
    return defaultTab ? "app" : "landing";
  });
  const [activeAppTab, setActiveAppTab] = useState<"sandbox" | "history">(() => {
    return defaultTab === "history" ? "history" : "sandbox";
  });
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem("theme") !== "light";
  });

  // Sync state when defaultTab updates
  useEffect(() => {
    if (defaultTab === "history") {
      setView("app");
      setActiveAppTab("history");
    }
  }, [defaultTab]);

  // History & Knowledge Base States
  const [historyRuns, setHistoryRuns] = useState<any[]>([]);
  const [historyRagEntries, setHistoryRagEntries] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historySearch, setHistorySearch] = useState("");
  const [historyTab, setHistoryTab] = useState<"runs" | "rag">("runs");
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [expandedRunReport, setExpandedRunReport] = useState<string | null>(null);
  const [reportLoadingId, setReportLoadingId] = useState<string | null>(null);

  async function loadHistoryData() {
    setHistoryLoading(true);
    try {
      const [runsRes, ragRes] = await Promise.all([
        fetch('/api/history'),
        fetch('/api/rag/entries'),
      ]);
      if (runsRes.ok) setHistoryRuns(await runsRes.json());
      if (ragRes.ok) setHistoryRagEntries(await ragRes.json());
    } catch (err) {
      console.error("Failed to load history data", err);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function deleteRun(id: string) {
    await fetch(`/api/history/${id}`, { method: 'DELETE' });
    setHistoryRuns(r => r.filter(x => x.run_id !== id));
    if (expandedRunId === id) {
      setExpandedRunId(null);
      setExpandedRunReport(null);
    }
  }

  async function deleteRagEntry(id: string) {
    await fetch(`/api/rag/entries/${id}`, { method: 'DELETE' });
    setHistoryRagEntries(e => e.filter(x => x.incident_id !== id));
  }

  async function clearRag() {
    if (!confirm('Clear all knowledge base entries? This cannot be undone.')) return;
    await fetch('/api/rag/clear', { method: 'DELETE' });
    setHistoryRagEntries([]);
  }

  const toggleRunExpansion = async (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      setExpandedRunReport(null);
      return;
    }
    setExpandedRunId(runId);
    setReportLoadingId(runId);
    try {
      const res = await fetch(`/api/history/${runId}/report`);
      const d = await res.json();
      setExpandedRunReport(d.report || "—");
    } catch {
      setExpandedRunReport("Failed to load report.");
    } finally {
      setReportLoadingId(null);
    }
  };

  useEffect(() => {
    if (view === "app" && activeAppTab === "history") {
      loadHistoryData();
    }
  }, [view, activeAppTab]);
  
  // Scenarios loaded from FastAPI backend
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [selectedScenarioType, setSelectedScenarioType] = useState<string>("");
  
  // Settings loaded from local storage or defaults
  const [llmProvider, setLlmProvider] = useState<'openrouter' | 'local'>('openrouter');
  const [openrouterKey, setOpenrouterKey] = useState<string>('');
  const [llmBaseUrl, setLlmBaseUrl] = useState<string>('http://localhost:11434/v1');
  const [tavilyKey, setTavilyKey] = useState<string>('');
  const [llmModel, setLlmModel] = useState<string>('openai/gpt-4o');
  const [serverLlmConfigured, setServerLlmConfigured] = useState<boolean>(false);
  const [clientKeysAllowed, setClientKeysAllowed] = useState<boolean>(true);
  const [authRequired, setAuthRequired] = useState<boolean>(false);
  const [incidentApiKey, setIncidentApiKey] = useState<string>('');
  
  // Telemetry Ingestion Mode states
  const [telemetryMode, setTelemetryMode] = useState<'standard' | 'preset' | 'upload'>('standard');
  const [selectedPreset, setSelectedPreset] = useState<string>('stripe_gateway_error.json');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedData, setUploadedData] = useState<any | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  
  // Custom alert threshold states
  const [latencyThreshold, setLatencyThreshold] = useState<number>(1800);
  const [errorThreshold, setErrorThreshold] = useState<number>(15);
  const [autoTriggerAI, setAutoTriggerAI] = useState<boolean>(true);
  const [slackNotifications, setSlackNotifications] = useState<boolean>(true);
  const [settingsActiveMessage, setSettingsActiveMessage] = useState<string | null>(null);
  const [expandedEventIdx, setExpandedEventIdx] = useState<number | null>(null);
  const [showConfidenceDetail, setShowConfidenceDetail] = useState<boolean>(false);
  const [copystate, setCopystate] = useState<boolean>(false);
  const [isMitigating, setIsMitigating] = useState<boolean>(false);
  const [mitigationLog, setMitigationLog] = useState<string[]>([]);
  
  // Telemetry live stream logs
  const [logs, setLogs] = useState<string[]>([
    "System initialized. Core Engine V3.4 active.",
    "Awaiting thresholds configuration & investigative triggers.",
    "All synthetic uptime checks reporting operational."
  ]);
  
  // Dynamic Incident state preview loaded from scenario maps
  const [previewIncident, setPreviewIncident] = useState<IncidentState>(MOCK_INCIDENTS.stripe_outage);
  
  // Real Investigation running states
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Immersive gateway scanning terminal simulation
  const [loadingAnalysis, setLoadingAnalysis] = useState<boolean>(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  
  const { runId, setRunId, setScenario } = useIncidentStore();
  const agentLogTimerRef = useRef<any>(null);

  const needsClientOpenRouterKey =
    llmProvider === 'openrouter' && !serverLlmConfigured && clientKeysAllowed && !openrouterKey.trim();
  const needsIncidentApiKey = authRequired && !incidentApiKey.trim();
  const cockpitLocked = needsClientOpenRouterKey || needsIncidentApiKey;

  // Retrieve keys on mount & health checks
  useEffect(() => {
    setOpenrouterKey(localStorage.getItem('openrouter_key') || '');
    setTavilyKey(localStorage.getItem('tavily_key') || '');
    setLlmModel(localStorage.getItem('llm_model') || 'openai/gpt-4o');
    setLlmProvider((localStorage.getItem('llm_provider') as 'openrouter' | 'local') || 'openrouter');
    setLlmBaseUrl(localStorage.getItem('llm_base_url') || 'http://localhost:11434/v1');
    setIncidentApiKey(localStorage.getItem('incident_api_key') || '');

    async function load() {
      try {
        const health = await getHealth();
        setServerLlmConfigured(health.llm_configured);
        setClientKeysAllowed(health.client_keys_allowed);
        setAuthRequired(health.auth_required);

        const data = await listScenarios();
        setScenarios(data);
        if (data.length > 0) {
          setSelectedScenarioType(data[0].scenario_type);
        }
      } catch (err) {
        console.error("Failed to load outage scenarios from server:", err);
        setError("Outage Investigator API server is offline. Please start the FastAPI backend first.");
      }
    }
    load();
  }, []);

  // Update light/dark modes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Synchronize visual preview when scenario changes
  const updateScenarioPreview = (type: string) => {
    let mockKey = "stripe_outage";
    if (type.includes("s3") || type.includes("aws")) mockKey = "aws_s3_degradation";
    else if (type.includes("twilio") || type.includes("sms")) mockKey = "twilio_sms_delay";
    else if (type.includes("dns") || type.includes("cloudflare") || type.includes("github")) mockKey = "cloudflare_dns_failure";
    
    if (MOCK_INCIDENTS[mockKey]) {
      setPreviewIncident(MOCK_INCIDENTS[mockKey]);
    }
  };

  const handleScenarioChange = (scenarioType: string) => {
    setSelectedScenarioType(scenarioType);
    updateScenarioPreview(scenarioType);
    setLogs((prev) => [
      `[PREVIEW] Loaded interactive trace map for scenario: ${scenarioType.replace('_', ' ').toUpperCase()}`,
      ...prev.slice(0, 10)
    ]);
  };

  // Live monitor logging stream simulator
  useEffect(() => {
    if (agentLogTimerRef.current) clearInterval(agentLogTimerRef.current);

    agentLogTimerRef.current = setInterval(() => {
      const isLatencyBreach = latencyThreshold < 2000;
      const isErrorBreach = errorThreshold < 20;

      if (isLatencyBreach || isErrorBreach) {
        if (isLatencyBreach) {
          setLogs((prev) => [
            `[BREACH WARNING] Latency metrics exceeded alert threshold limit (${latencyThreshold}ms)! Investigating routes...`,
            ...prev.slice(0, 10)
          ]);
        }
        if (isErrorBreach) {
          setLogs((prev) => [
            `[BREACH WARNING] Endpoint error rate exceeded threshold (${errorThreshold}%)! Notifying Slack channels...`,
            ...prev.slice(0, 10)
          ]);
        }
      } else {
        const randomActivities = [
          "Comparing ingress telemetry logs with gateway threshold ceiling... Healthy.",
          "AWS S3 bucket object latency check returned 210ms (SLA operational).",
          "Stripe Webhook Gateway status endpoint check returned HTTP 200.",
          "Auth0 credentials verification thread count status: normal.",
          "AegisOps agent daemon sleeping, monitoring webhook sockets.",
          "Polled status metrics: CPU utilization average 35%."
        ];
        const randomLog = randomActivities[Math.floor(Math.random() * randomActivities.length)];
        setLogs((prev) => [`[MONITOR] ${randomLog}`, ...prev.slice(0, 12)]);
      }
    }, 9000);

    return () => {
      if (agentLogTimerRef.current) clearInterval(agentLogTimerRef.current);
    };
  }, [latencyThreshold, errorThreshold]);

  // Handle uploaded JSON files
  const handleFileUpload = (file: File) => {
    setUploadError(null);
    setUploadedFile(null);
    setUploadedData(null);

    if (!file.name.toLowerCase().endsWith('.json')) {
      setUploadError("Document Blocked: Only structured JSON telemetry log files are allowed.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const json = JSON.parse(text);
        if (!json.raw_logs && !json.raw_metrics) {
          setUploadError("Document Blocked: JSON must contain 'raw_logs' or 'raw_metrics' structures.");
          return;
        }
        setUploadedFile(file);
        setUploadedData(json);
        setLogs((prev) => [
          `[INGESTION] Loaded custom telemetry payload file: ${file.name}`,
          ...prev.slice(0, 10)
        ]);
      } catch (err) {
        setUploadError("Document Blocked: Invalid JSON syntax.");
      }
    };
    reader.readAsText(file);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(previewIncident.aiInsight.remediationCode);
    setCopystate(true);
    setTimeout(() => setCopystate(false), 2000);
  };

  // Launch a real backend investigation and redirect to Live graph page
  const handleStart = async () => {
    if (telemetryMode === 'standard' && !selectedScenarioType) return;
    if (telemetryMode === 'upload' && !uploadedData) return;
    
    // Play the immersive gateway trace modal animation
    setLoadingAnalysis(true);
    setConsoleLogs([]);
    setExpandedEventIdx(null);

    const stepPrompts = [
      "Connecting to Edge Gateways and Cloud Gateway status indicators...",
      "Analyzing trace dependencies between core clusters and microservicing pods...",
      "Extracting TLS handshake payloads and checking system rate exceptions...",
      "Sending incident contexts to server-side Gemini agent diagnostics engine..."
    ];

    for (let i = 0; i < stepPrompts.length; i++) {
      setConsoleLogs((prev) => [...prev, `[TRACE] ${stepPrompts[i]}`]);
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    // Save configurations
    localStorage.setItem('openrouter_key', openrouterKey);
    localStorage.setItem('tavily_key', tavilyKey);
    localStorage.setItem('llm_model', llmModel);
    localStorage.setItem('llm_provider', llmProvider);
    localStorage.setItem('llm_base_url', llmBaseUrl);
    localStorage.setItem('incident_api_key', incidentApiKey);

    const targetBaseUrl = llmProvider === 'local' ? llmBaseUrl : undefined;
    const needsClientKey = llmProvider === 'openrouter' && !serverLlmConfigured && clientKeysAllowed;
    const targetKey = needsClientKey ? openrouterKey : undefined;

    let activeScenarioType = '';
    let activeCustomTelemetry: any = undefined;

    if (telemetryMode === 'standard') {
      activeScenarioType = selectedScenarioType;
    } else if (telemetryMode === 'preset') {
      const preset = PRESETS[selectedPreset];
      activeScenarioType = preset.scenarioType;
      activeCustomTelemetry = preset.data;
    } else if (telemetryMode === 'upload') {
      activeScenarioType = 'custom_telemetry';
      activeCustomTelemetry = uploadedData;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await startIncident(
        activeScenarioType,
        {
          openrouterApiKey: targetKey,
          tavilyApiKey: clientKeysAllowed ? tavilyKey : undefined,
          llmModel,
          llmBaseUrl: targetBaseUrl,
          customTelemetry: activeCustomTelemetry,
          clientKeysAllowed,
        }
      );
      setRunId(response.run_id);
      setScenario(activeScenarioType);
      
      // Successfully created run, redirect to active page
      setLoadingAnalysis(false);
      navigate(`/run/${response.run_id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to start incident investigation.');
      setLoadingAnalysis(false);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyMitigation = async () => {
    setIsMitigating(true);
    setMitigationLog([
      "> Starting autonomous agent execution run...",
      `> Target: ${previewIncident.rootCause.origin}`,
      `> Applying script instructions: "${previewIncident.aiInsight.title}"`
    ]);

    await new Promise((resolve) => setTimeout(resolve, 800));
    setMitigationLog((prev) => [...prev, "> Injecting environment credentials securely from Vault..."]);
    
    await new Promise((resolve) => setTimeout(resolve, 900));
    setMitigationLog((prev) => [
      ...prev,
      "> kubectl apply -f core-hotfix-deployment.yaml",
      "> Applying system routing overrides..."
    ]);
  };

  return (
    <div className={`w-full h-full overflow-y-auto font-sans transition-colors duration-300 ${
      isDarkMode ? "bg-[#02040a] text-slate-100" : "bg-slate-50 text-slate-900"
    }`}>
      
      {isDarkMode && (
        <div className="absolute top-0 right-0 w-[45%] h-[400px] bg-sky-500/5 blur-[120px] rounded-full pointer-events-none"></div>
      )}

      {/* Unified Command Header */}
      <header className={`sticky top-0 z-50 border-b backdrop-blur-md transition-all ${
        isDarkMode ? "bg-[#02040a]/80 border-white/5" : "bg-white/80 border-slate-200"
      }`}>
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          
          {/* Logo & Platform Info */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-rose-500 flex items-center justify-center text-white font-black shadow-lg shadow-blue-500/10">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight flex items-center gap-1.5 leading-none">
                AegisOps
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-sans bg-blue-500/10 text-blue-450 border border-blue-500/20">
                  Active
                </span>
              </h1>
              <span className="text-[9px] font-sans text-slate-400 block mt-0.5">Autonomous Vendor Outage Investigator</span>
            </div>
          </div>

          {/* Navigation Controls - Unified structure visible everywhere */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setView("landing")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all cursor-pointer ${
                view === "landing"
                  ? isDarkMode ? "bg-white/5 text-blue-400 border border-white/10" : "bg-slate-100 text-blue-600 border border-slate-200"
                  : isDarkMode ? "text-slate-400 hover:text-slate-205" : "text-slate-650 hover:text-slate-900"
              }`}
            >
              Overview
            </button>
            <button
              id="view-sandbox-dashboard-btn"
              onClick={() => { setView("app"); setActiveAppTab("sandbox"); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all cursor-pointer ${
                view === "app" && activeAppTab === "sandbox"
                  ? isDarkMode ? "bg-white/5 text-blue-400 border border-white/10" : "bg-slate-100 text-blue-600 border border-slate-200"
                  : isDarkMode ? "text-slate-400 hover:text-slate-205" : "text-slate-655 hover:text-slate-900"
              }`}
            >
              Agent Swarm
            </button>
            <button
              onClick={() => { setView("app"); setActiveAppTab("history"); setHistoryTab("runs"); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all cursor-pointer ${
                view === "app" && activeAppTab === "history" && historyTab === "runs"
                  ? isDarkMode ? "bg-white/5 text-blue-400 border border-white/10" : "bg-slate-100 text-blue-600 border border-slate-200"
                  : isDarkMode ? "text-slate-400 hover:text-slate-205" : "text-slate-655 hover:text-slate-900"
              }`}
            >
              Investigations
            </button>
            <button
              onClick={() => { setView("app"); setActiveAppTab("history"); setHistoryTab("rag"); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition-all cursor-pointer ${
                view === "app" && activeAppTab === "history" && historyTab === "rag"
                  ? isDarkMode ? "bg-white/5 text-blue-400 border border-white/10" : "bg-slate-100 text-blue-600 border border-slate-200"
                  : isDarkMode ? "text-slate-400 hover:text-slate-205" : "text-slate-655 hover:text-slate-900"
              }`}
            >
              Knowledge Base
            </button>
            {runId && (
              <button
                onClick={() => navigate(`/run/${runId}`)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold font-sans text-rose-500 hover:text-rose-600 dark:text-rose-450 dark:hover:text-rose-350 animate-pulse flex items-center gap-1 cursor-pointer"
              >
                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span>
                Active Run
              </button>
            )}
          </div>

          {/* Settings & Theme */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`p-2 rounded-lg border transition-all ${
                isDarkMode ? "border-white/5 text-slate-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
              title="Toggle theme mode"
              aria-label="Toggle theme mode"
            >
              {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>

            <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] uppercase font-mono px-2 py-1 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
              Live Gateway Linked
            </span>
          </div>
        </div>
      </header>

      {/* Primary Routing view Container */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {view === "landing" ? (
          
          /* VIEW 1: AEGISOPS LANDING & INFO OVERVIEW */
          <div className="relative overflow-visible">
            <NetworkParticles />
            
            {/* Outage banner */}
            <div className="max-w-3xl mx-auto text-center mt-12 mb-16 relative z-15">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono bg-rose-500/10 text-rose-500 border border-rose-500/20 mb-6 animate-pulse">
                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span>
                ACTIVE INCIDENT DETECTOR ASSISTANT
              </div>
              <h2 className={`text-3xl md:text-5xl font-extrabold tracking-tight mb-4 ${
                isDarkMode 
                  ? "bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent" 
                  : "text-slate-900"
              }`}>
                Autonomous AI agents detect, <br />
                investigate, and explain <br />
                <span className="bg-gradient-to-r from-blue-600 via-teal-500 to-emerald-500 bg-clip-text text-transparent">
                  third-party vendor outages.
                </span>
              </h2>
              <p className={`text-sm md:text-base max-w-2xl mx-auto font-sans leading-relaxed ${
                isDarkMode ? "text-slate-400" : "text-slate-600"
              }`}>
                From alert to root cause in minutes. AegisOps automatically triages telemetry exceptions, scans status pages, and compiles verified fallback routing patches.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
                <button
                  id="deploy-sandbox-btn"
                  onClick={() => { setView("app"); setActiveAppTab("sandbox"); }}
                  className="px-6 py-3 bg-gradient-to-tr from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs font-sans uppercase rounded-lg shadow-xl shadow-blue-500/10 flex items-center gap-2 transform active:scale-95 transition-all cursor-pointer"
                >
                  Run Demo Incident
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setView("app"); setActiveAppTab("history"); setHistoryTab("runs"); }}
                  className={`px-6 py-3 border font-bold text-xs font-sans uppercase rounded-lg transition-all cursor-pointer ${
                    isDarkMode 
                      ? "bg-slate-900/60 hover:bg-slate-955 border-white/5 text-slate-300" 
                      : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-3xs"
                  }`}
                >
                  Explore RCA Report
                </button>
              </div>

              {/* Supported Vendors Strip */}
              <div className="mt-12 pt-6 border-t border-white/5 max-w-xl mx-auto">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 block mb-3 font-sans font-bold">Supported Integrations & Monitored Vendors</span>
                <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-xs font-mono font-bold text-slate-400">
                  <span>Stripe</span>
                  <span>AWS</span>
                  <span>Cloudflare</span>
                  <span>Twilio</span>
                  <span>Auth0</span>
                  <span>SendGrid</span>
                  <span>Datadog</span>
                </div>
              </div>
            </div>

            {/* Orbiting Canvas Centerpiece */}
            <div className="mb-20 max-w-5xl mx-auto relative z-20">
              <AIGlobeHero />
            </div>

            {/* AI Agent Cards */}
            <section id="autonomous-agents" className="mb-20 relative z-20">
              <div className="text-center mb-10">
                <h3 className="text-xs font-mono tracking-widest text-blue-500 uppercase font-bold">Autonomous Agents Stack</h3>
                <h4 className={`text-xl font-bold mt-1 ${isDarkMode ? "text-slate-200" : "text-slate-800"}`}>Four specialized layers. Zero-touch operations.</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                
                {/* CARD 1 */}
                <div className={`p-5 rounded-xl border flex flex-col justify-between transition-all ${
                  isDarkMode 
                    ? "border-white/5 bg-slate-900/40 backdrop-blur-md hover:border-white/10" 
                    : "border-slate-200 bg-white hover:border-slate-350 hover:shadow-xs text-slate-800 shadow-3xs"
                }`}>
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-blue-950/50 border border-blue-500/20 flex items-center justify-center text-lg mb-4 shadow-3xs">
                      🔍
                    </div>
                    <h5 className="font-bold text-sm tracking-tight mb-1">Triage Agent</h5>
                    <p className={`text-xs leading-normal font-sans ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                      Ingests logs, metrics, and alerts to pinpoint which dependency or vendor has failed.
                    </p>
                  </div>
                  <div className={`mt-4 pt-3 border-t flex items-center justify-between text-[11px] font-mono ${isDarkMode ? "border-white/5" : "border-slate-100"}`}>
                    <span className="text-blue-500 font-bold">Scanning Uptime</span>
                    <span className={isDarkMode ? "text-slate-500" : "text-slate-400"}>Live alerts</span>
                  </div>
                </div>

                {/* CARD 2 */}
                <div className={`p-5 rounded-xl border flex flex-col justify-between transition-all ${
                  isDarkMode 
                    ? "border-white/5 bg-slate-900/40 backdrop-blur-md hover:border-white/10" 
                    : "border-slate-200 bg-white hover:border-slate-350 hover:shadow-xs text-slate-800 shadow-3xs"
                }`}>
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-amber-950/50 border border-amber-500/20 flex items-center justify-center text-lg mb-4 shadow-3xs">
                      ⚙️
                    </div>
                    <h5 className="font-bold text-sm tracking-tight mb-1">Web Searcher</h5>
                    <p className={`text-xs leading-normal font-sans ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                      Queries Tavily Search for public DownDetector spikes and API status indicators.
                    </p>
                  </div>
                  <div className={`mt-4 pt-3 border-t flex items-center justify-between text-[11px] font-mono ${isDarkMode ? "border-white/5" : "border-slate-100"}`}>
                    <span className="text-amber-500 font-bold">Search API</span>
                    <span className={isDarkMode ? "text-slate-500" : "text-slate-400"}>Tavily engine</span>
                  </div>
                </div>

                {/* CARD 3 */}
                <div className={`p-5 rounded-xl border flex flex-col justify-between transition-all ${
                  isDarkMode 
                    ? "border-white/5 bg-slate-900/40 backdrop-blur-md hover:border-white/10" 
                    : "border-slate-200 bg-white hover:border-slate-350 hover:shadow-xs text-slate-800 shadow-3xs"
                }`}>
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-purple-950/50 border border-purple-500/20 flex items-center justify-center text-lg mb-4 shadow-3xs">
                      🌐
                    </div>
                    <h5 className="font-bold text-sm tracking-tight mb-1">Browser Watcher</h5>
                    <p className={`text-xs leading-normal font-sans ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                      Launches headless Stagehand browsers to verify vendor status boards and login interfaces.
                    </p>
                  </div>
                  <div className={`mt-4 pt-3 border-t flex items-center justify-between text-[11px] font-mono ${isDarkMode ? "border-white/5" : "border-slate-100"}`}>
                    <span className="text-purple-500 font-bold">Scraping Engine</span>
                    <span className={isDarkMode ? "text-slate-500" : "text-slate-400"}>Playwright</span>
                  </div>
                </div>

                {/* CARD 4 */}
                <div className={`p-5 rounded-xl border flex flex-col justify-between transition-all ${
                  isDarkMode 
                    ? "border-white/5 bg-slate-900/40 backdrop-blur-md hover:border-white/10" 
                    : "border-slate-200 bg-white hover:border-slate-350 hover:shadow-xs text-slate-800 shadow-3xs"
                }`}>
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-emerald-950/50 border border-emerald-500/20 flex items-center justify-center text-lg mb-4 shadow-3xs">
                      📝
                    </div>
                    <h5 className="font-bold text-sm tracking-tight mb-1">Mitigation Specialist</h5>
                    <p className={`text-xs leading-normal font-sans ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
                      Synthesizes DNS fallback routes and webhook buffer policies into self-healing reports.
                    </p>
                  </div>
                  <div className={`mt-4 pt-3 border-t flex items-center justify-between text-[11px] font-mono ${isDarkMode ? "border-white/5" : "border-slate-100"}`}>
                    <span className="text-emerald-500 font-bold">RAG Cache</span>
                    <span className={isDarkMode ? "text-slate-500" : "text-slate-400"}>Auto-mitigate</span>
                  </div>
                </div>

              </div>
            </section>

          </div>
        ) : activeAppTab === "sandbox" ? (
          
          <div className="relative z-20 flex flex-col gap-6 fade-in">
            {/* User Journey Workflow Indicator */}
            <div className={`p-4 border rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 transition-all ${
              isDarkMode ? "bg-slate-900/20 border-white/5" : "bg-white border-slate-200 shadow-3xs"
            }`}>
              <span className="text-[10px] font-sans tracking-wider text-blue-500 uppercase font-bold">Investigation Workflow</span>
              <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs font-sans text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-[10px]">1</span>
                  <span className={`font-semibold ${isDarkMode ? "text-slate-200" : "text-slate-800"}`}>Select Scenario</span>
                </div>
                <ChevronRight className="w-3 h-3 text-slate-600" />
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 border border-white/5 flex items-center justify-center font-bold text-[10px]">2</span>
                  <span>Launch Swarm</span>
                </div>
                <ChevronRight className="w-3 h-3 text-slate-600" />
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 border border-white/5 flex items-center justify-center font-bold text-[10px]">3</span>
                  <span>Agent Analysis</span>
                </div>
                <ChevronRight className="w-3 h-3 text-slate-600" />
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 border border-white/5 flex items-center justify-center font-bold text-[10px]">4</span>
                  <span>Root Cause Report</span>
                </div>
                <ChevronRight className="w-3 h-3 text-slate-600" />
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 border border-white/5 flex items-center justify-center font-bold text-[10px]">5</span>
                  <span>Deploy Mitigation</span>
                </div>
              </div>
            </div>
            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-rose-500 text-xs">
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <AlertCircle className="w-4 h-4" /> API Connectivity Outage
                </div>
                {error}
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Modal Layer for Telemetry Gateway Trace Scanning */}
              {loadingAnalysis && (
                <div className="fixed inset-0 bg-[#02040a]/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
                  <div className="w-full max-w-xl bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-2xl">
                    <div className="flex items-center gap-3 mb-4">
                      <Cpu className="w-6 h-6 text-blue-400 animate-spin" />
                      <div>
                        <h4 className="text-sm font-mono font-bold uppercase text-slate-300">AEGISOPS SCAN IN PROGRESS</h4>
                        <p className="text-[11px] text-slate-500 font-mono">Triage target: {previewIncident.topic}</p>
                      </div>
                    </div>

                    <div className="bg-[#04060e] border border-white/5 rounded-xl p-4 font-mono text-xs text-teal-400 flex flex-col gap-2 min-h-[180px] overflow-y-auto">
                      {consoleLogs.map((logLine, idx) => (
                        <div key={idx} className="flex gap-2">
                          <span className="text-slate-500">[{idx+1}]</span>
                          <span>{logLine}</span>
                        </div>
                      ))}
                      <div className="flex items-center gap-2 mt-4 text-slate-400">
                        <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></span>
                        <span>Configuring multi-agent LangGraph workflow execution...</span>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <span className="text-[10px] font-mono text-slate-500 uppercase">Transferring context...</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Left Column (col-span-3): Ingestion Selector & Settings */}
              <div className="lg:col-span-3 flex flex-col gap-6">
                
                {/* Telemetry Ingestion Card */}
                <div className={`rounded-xl p-4 border transition-all ${
                  isDarkMode ? "bg-slate-900/40 border-white/5" : "bg-white border-slate-200 shadow-sm"
                }`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Terminal className="w-4 h-4 text-blue-500" />
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider">Telemetry Ingestion</h3>
                  </div>
                  
                  {/* Mode Tabs */}
                  <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', padding: 4, borderRadius: 8, border: '1px solid var(--line)', marginBottom: 12 }}>
                    <button
                      type="button"
                      onClick={() => setTelemetryMode('standard')}
                      className={`btn ${telemetryMode === 'standard' ? 'primary' : 'ghost'}`}
                      style={{ flex: 1, fontSize: 11, padding: '6px 8px', borderRadius: 6, minHeight: 'auto' }}
                    >
                      Mocks
                    </button>
                    <button
                      type="button"
                      onClick={() => setTelemetryMode('preset')}
                      className={`btn ${telemetryMode === 'preset' ? 'primary' : 'ghost'}`}
                      style={{ flex: 1, fontSize: 11, padding: '6px 8px', borderRadius: 6, minHeight: 'auto' }}
                    >
                      Presets
                    </button>
                    <button
                      type="button"
                      onClick={() => setTelemetryMode('upload')}
                      className={`btn ${telemetryMode === 'upload' ? 'primary' : 'ghost'}`}
                      style={{ flex: 1, fontSize: 11, padding: '6px 8px', borderRadius: 6, minHeight: 'auto' }}
                    >
                      Upload JSON
                    </button>
                  </div>

                  {cockpitLocked && (
                    <div className="bg-red-500/10 border border-red-500/30 text-rose-500 p-2.5 rounded-lg mb-3 text-xs leading-normal">
                      <div className="flex items-center gap-1 font-bold mb-1">
                        <AlertCircle className="w-3.5 h-3.5" /> Live Swarm Locked
                      </div>
                      {needsIncidentApiKey ? (
                        <>Please configure the <code>Incident API Key</code> in settings.</>
                      ) : (
                        <>Please provide your <code>OpenRouter API Key</code> in settings.</>
                      )}
                    </div>
                  )}

                  {/* Telemetry Selectors */}
                  <div>
                    {telemetryMode === 'standard' && (
                      <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1">
                        {scenarios.map((sc) => (
                          <button
                            key={sc.scenario_type}
                            onClick={() => handleScenarioChange(sc.scenario_type)}
                            className={`w-full text-left p-2 rounded-lg border text-[11px] font-mono flex flex-col gap-1 transition-all ${
                              selectedScenarioType === sc.scenario_type
                                ? isDarkMode
                                  ? "bg-blue-950/30 text-blue-400 border-blue-500/40"
                                  : "bg-blue-50 text-blue-700 border-blue-400 font-bold"
                                : isDarkMode
                                  ? "border-white/5 hover:bg-white/5 text-slate-300"
                                  : "border-slate-200 hover:bg-slate-50 text-slate-700"
                            }`}
                          >
                            <span className="font-bold">{sc.name}</span>
                            <span className="text-[10px] text-slate-500 line-clamp-1">{sc.description}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {telemetryMode === 'preset' && (
                      <div className="flex flex-col gap-2">
                        <select
                          value={selectedPreset}
                          onChange={(e) => {
                            setSelectedPreset(e.target.value);
                            const scType = PRESETS[e.target.value].scenarioType;
                            setSelectedScenarioType(scType);
                            updateScenarioPreview(scType);
                          }}
                          className={`w-full p-2 text-xs border rounded-lg ${
                            isDarkMode ? "bg-slate-955 border-white/5 text-slate-200" : "bg-white border-slate-200"
                          }`}
                        >
                          {Object.keys(PRESETS).map((k) => (
                            <option key={k} value={k}>{k}</option>
                          ))}
                        </select>
                        <pre className="p-2 bg-slate-950 rounded-lg text-[9px] text-sky-400 font-mono max-h-[120px] overflow-auto">
                          {JSON.stringify(PRESETS[selectedPreset].data, null, 2)}
                        </pre>
                      </div>
                    )}

                    {telemetryMode === 'upload' && (
                      <div className="flex flex-col gap-2">
                        <div
                          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                          onDragLeave={() => setIsDragging(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setIsDragging(false);
                            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                              handleFileUpload(e.dataTransfer.files[0]);
                            }
                          }}
                          onClick={() => document.getElementById("file-uploader")?.click()}
                          className={`border-2 border-dashed p-4 rounded-lg text-center cursor-pointer ${
                            isDragging ? "border-blue-500 bg-blue-500/10" : "border-white/10 bg-slate-950/20"
                          }`}
                        >
                          <UploadCloud className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                          <span className="text-[10px] text-slate-400 block font-mono">Upload JSON log payload</span>
                          <input
                            id="file-uploader"
                            type="file"
                            accept=".json"
                            onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
                            className="hidden"
                          />
                        </div>
                        {uploadError && <div className="text-[10px] text-red-500 font-mono">{uploadError}</div>}
                        {uploadedFile && (
                          <div className="text-[10px] text-emerald-500 font-mono">
                            Loaded: {uploadedFile.name}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Trigger Swarm Button */}
                  <button
                    onClick={handleStart}
                    disabled={cockpitLocked || (telemetryMode === 'upload' && !uploadedData) || loading}
                    className="w-full mt-4 py-2.5 bg-gradient-to-tr from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs font-mono uppercase rounded-lg flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    {loading ? "Initializing..." : "Trigger Live Swarm"}
                  </button>
                </div>

                {/* Settings Card */}
                <div className={`rounded-xl p-4 border transition-all ${
                  isDarkMode ? "bg-slate-900/40 border-white/5" : "bg-white border-slate-200 shadow-sm"
                }`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Settings className="w-4 h-4 text-blue-500" />
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider">Orchestrator Settings</h3>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 mb-1">Provider Source</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setLlmProvider("openrouter")}
                          className={`py-1 text-center font-mono text-[10px] border rounded ${
                            llmProvider === "openrouter" ? "bg-blue-500/10 border-blue-500 text-blue-400" : "border-white/5 text-slate-400"
                          }`}
                        >
                          OpenRouter
                        </button>
                        <button
                          onClick={() => setLlmProvider("local")}
                          className={`py-1 text-center font-mono text-[10px] border rounded ${
                            llmProvider === "local" ? "bg-blue-500/10 border-blue-500 text-blue-400" : "border-white/5 text-slate-400"
                          }`}
                        >
                          Ollama/Local
                        </button>
                      </div>
                    </div>

                    {llmProvider === "openrouter" ? (
                      <div>
                        <label className="block text-[10px] font-mono text-slate-400 mb-1">OpenRouter Key</label>
                        <input
                          type="password"
                          value={openrouterKey}
                          onChange={(e) => setOpenrouterKey(e.target.value)}
                          placeholder="sk-or-v1-..."
                          className={`w-full p-1.5 border rounded text-[11px] font-mono outline-none ${
                            isDarkMode ? "bg-slate-950 border-white/5 text-slate-200" : "bg-white border-slate-200"
                          }`}
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[10px] font-mono text-slate-400 mb-1">Local Base URL</label>
                        <input
                          type="text"
                          value={llmBaseUrl}
                          onChange={(e) => setLlmBaseUrl(e.target.value)}
                          placeholder="http://localhost:11434/v1"
                          className={`w-full p-1.5 border rounded text-[11px] font-mono outline-none ${
                            isDarkMode ? "bg-slate-950 border-white/5 text-slate-200" : "bg-white border-slate-200"
                          }`}
                        />
                      </div>
                    )}

                    {authRequired && (
                      <div>
                        <label className="block text-[10px] font-mono text-slate-400 mb-1">Incident API Key</label>
                        <input
                          type="password"
                          value={incidentApiKey}
                          onChange={(e) => setIncidentApiKey(e.target.value)}
                          placeholder="API Bearer Token"
                          className={`w-full p-1.5 border rounded text-[11px] font-mono outline-none ${
                            isDarkMode ? "bg-slate-950 border-white/5 text-slate-200" : "bg-white border-slate-200"
                          }`}
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 mb-1">Model ID</label>
                      <input
                        type="text"
                        value={llmModel}
                        onChange={(e) => setLlmModel(e.target.value)}
                        placeholder="e.g. google/gemini-2.5-flash"
                        className={`w-full p-1.5 border rounded text-[11px] font-mono outline-none ${
                          isDarkMode ? "bg-slate-955 border-white/5 text-slate-200" : "bg-white border-slate-200"
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-slate-400 mb-1">Tavily Key (Optional)</label>
                      <input
                        type="password"
                        value={tavilyKey}
                        onChange={(e) => setTavilyKey(e.target.value)}
                        placeholder="tvly-..."
                        className={`w-full p-1.5 border rounded text-[11px] font-mono outline-none ${
                          isDarkMode ? "bg-slate-955 border-white/5 text-slate-200" : "bg-white border-slate-200"
                        }`}
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* Center Column (col-span-6): Mock preview graph, metrics, and timeline */}
              <div className="lg:col-span-6 flex flex-col gap-6">
                
                {/* Warning / Lock Banner for Cockpit */}
                {cockpitLocked && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs flex items-center justify-between gap-4 animate-fadeIn">
                    <div className="flex items-center gap-2.5">
                      <AlertCircle className="w-4.5 h-4.5 text-amber-500 shrink-0" />
                      <div>
                        <div className="font-bold">Live Swarm Execution Locked</div>
                        <div className="text-[11px] text-slate-400 leading-normal mt-0.5">
                          Displaying static preview scenario. Configure your OpenRouter API Key in the settings panel on the left to trigger live agent swarms.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Scenario details card */}
                <div className={`p-4 border rounded-xl flex items-center justify-between gap-4 transition-all ${
                  isDarkMode ? "bg-gradient-to-r from-[#0b1021] to-slate-900/40 border-white/5" : "bg-white border-slate-200 shadow-sm"
                }`}>
                  <div>
                    <span className="text-[10px] font-mono text-blue-500 tracking-widest uppercase font-bold block mb-1">
                      Interactive Triage Workspace
                    </span>
                    <h2 className="text-sm font-bold font-mono tracking-tight leading-snug">
                      {previewIncident.topic}
                    </h2>
                  </div>
                  <div className="relative">
                    <button 
                      onClick={() => setShowConfidenceDetail(!showConfidenceDetail)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border hover:scale-105 active:scale-95 transition-all text-left cursor-pointer ${
                        isDarkMode ? "bg-slate-950/40 border-white/5" : "bg-slate-50 border-slate-200"
                      }`}
                      title="Click to view confidence breakdown"
                    >
                      <div className="text-right">
                        <span className="text-[9px] text-slate-505 font-sans block font-bold">Confidence</span>
                        <span className="text-sm font-bold font-mono text-teal-400">
                          {previewIncident.rootCause.confidence}%
                        </span>
                      </div>
                      <Cpu className="w-5 h-5 text-teal-400 animate-pulse shrink-0" />
                    </button>
                    
                    {showConfidenceDetail && (
                      <div className={`absolute right-0 top-full mt-2 w-48 p-3 rounded-lg border z-50 shadow-xl animate-fadeIn ${
                        isDarkMode ? "bg-slate-950 border-white/10 text-slate-300" : "bg-white border-slate-200 text-slate-700"
                      }`}>
                        <h4 className="text-[10px] font-bold uppercase tracking-wider mb-2 border-b border-white/5 pb-1">Confidence Breakdown</h4>
                        <div className="space-y-1.5 text-[10px] font-sans">
                          <div className="flex justify-between">
                            <span>Vendor Status Match</span>
                            <span className="font-bold text-teal-450">40%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Log Correlation</span>
                            <span className="font-bold text-teal-450">30%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Historical Similarity</span>
                            <span className="font-bold text-teal-450">20%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Topology Analysis</span>
                            <span className="font-bold text-teal-450">10%</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* AI Swarm Investigation Logs & Actions */}
                <div className={`rounded-xl p-4 border transition-all ${
                  isDarkMode ? "bg-slate-900/40 border-white/5" : "bg-white border-slate-200 shadow-sm"
                }`}>
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-blue-500 animate-pulse" />
                      <h3 className="text-xs font-sans font-bold uppercase tracking-wider">AI Swarm Reasoning & Decisions</h3>
                    </div>
                    <span className="text-[9.5px] font-sans px-2 py-0.5 rounded bg-blue-500/10 text-blue-450 border border-blue-500/20">
                      Swarm Status: Idle / Ready
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2.5 text-xs font-sans">
                      <span className="w-4 h-4 rounded bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">✓</span>
                      <div>
                        <span className={`font-semibold block ${isDarkMode ? "text-slate-205" : "text-slate-800"}`}>Vendor Status Pages Scanned</span>
                        <span className="text-[11px] text-slate-400">Polled status feeds for Stripe, AWS, Twilio, Cloudflare.</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 text-xs font-sans">
                      <span className="w-4 h-4 rounded bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">✓</span>
                      <div>
                        <span className={`font-semibold block ${isDarkMode ? "text-slate-205" : "text-slate-800"}`}>Stripe Incident Detected</span>
                        <span className="text-[11px] text-slate-400">Flagged Stripe API timeouts and 504 Gateway errors in ingress telemetry.</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 text-xs font-sans">
                      <span className="w-4 h-4 rounded bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">✓</span>
                      <div>
                        <span className={`font-semibold block ${isDarkMode ? "text-slate-205" : "text-slate-800"}`}>Cross-Correlated History Logs</span>
                        <span className="text-[11px] text-slate-400">Compared ingress trace vectors with historical Stripe webhook outage templates.</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 text-xs font-sans">
                      <span className="w-4 h-4 rounded bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">✓</span>
                      <div>
                        <span className={`font-semibold block ${isDarkMode ? "text-slate-205" : "text-slate-800"}`}>Mitigation Action Generated</span>
                        <span className="text-[11px] text-slate-400">Compiled standby route failover configurations (remediation.sh).</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Topology Graph Card */}
                <div className={`rounded-xl p-4 border transition-all ${
                  isDarkMode ? "bg-slate-900/40 border-white/5" : "bg-white border-slate-200 shadow-sm"
                }`}>
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-1.5">
                      <Terminal className="w-4 h-4 text-blue-500" />
                      <h3 className="text-xs font-mono font-bold uppercase tracking-wider">Topology Live Nodes</h3>
                    </div>
                  </div>
                  <RootCauseGraph nodes={previewIncident.graphNodes} links={previewIncident.graphLinks} />
                </div>

                {/* Timeline progression */}
                <div className={`rounded-xl p-5 border transition-all ${
                  isDarkMode ? "bg-slate-900/40 border-white/5" : "bg-white border-slate-200 shadow-sm"
                }`}>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider mb-4 pb-2 border-b border-white/5 flex items-center justify-between">
                    <span>Progression Timeline Checkpoints</span>
                    <Clock className="w-4 h-4 text-slate-500" />
                  </h3>
                  
                  <div className="space-y-4">
                    {previewIncident.timeline.map((event, idx) => {
                      const isCritical = event.status === "critical";
                      const isWarning = event.status === "warning";
                      const isSuccess = event.status === "success";
                      
                      let dotColorClass = isDarkMode ? "bg-slate-800 text-slate-400" : "bg-slate-200 text-slate-600";
                      if (isCritical) dotColorClass = "bg-red-950 border border-red-500 text-rose-450";
                      if (isWarning) dotColorClass = "bg-amber-950 border border-amber-500 text-amber-400";
                      if (isSuccess) dotColorClass = "bg-emerald-950 border border-emerald-500 text-emerald-400";
                      
                      const isOpen = expandedEventIdx === idx;
                      
                      return (
                        <div key={idx} className="flex gap-4 items-start relative">
                          {idx !== previewIncident.timeline.length - 1 && (
                            <div className="absolute top-6 left-3.5 bottom-0 w-0.5 bg-slate-800"></div>
                          )}
                          
                          <button
                            onClick={() => setExpandedEventIdx(isOpen ? null : idx)}
                            className={`w-7 h-7 rounded-full flex items-center justify-center font-mono text-[9px] font-bold shrink-0 cursor-pointer hover:scale-105 transition-transform z-10 ${dotColorClass}`}
                          >
                            {event.time.split(" ")[0]}
                          </button>
                          
                          <div className="flex-1">
                            <div 
                              onClick={() => setExpandedEventIdx(isOpen ? null : idx)}
                              className="flex items-center gap-2 cursor-pointer select-none"
                            >
                              <span className="text-xs font-mono font-bold text-slate-200 hover:text-blue-400">{event.title}</span>
                              <span className="text-[9px] text-slate-500 font-mono">{event.time}</span>
                            </div>
                            <p className="text-[11px] mt-0.5 text-slate-400">{event.description}</p>
                            
                            {isOpen && (
                              <div className="mt-3 p-3 rounded-lg border border-white/5 bg-slate-950/80 text-[11px] font-mono space-y-2 animate-fadeIn text-slate-350">
                                <div><strong>Anomaly source:</strong> {previewIncident.rootCause.origin}</div>
                                <div><strong>SLA Latency value:</strong> 3200ms</div>
                                <div><strong>Failure rate:</strong> 92.5%</div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* Right Column (col-span-3): Vendor Uptime & AI blueprint */}
              <div className="lg:col-span-3 flex flex-col gap-6">
                
                {/* Vendor status checks */}
                <VendorMonitor vendors={previewIncident.vendorHealth} isLoading={loading} onRefresh={() => handleScenarioChange(selectedScenarioType)} isDarkMode={isDarkMode} />

                {/* Threshold parameters adjustments */}
                <div className={`rounded-xl p-4 border transition-all ${
                  isDarkMode ? "bg-slate-900/40 border-white/5" : "bg-white border-slate-200 shadow-sm"
                }`}>
                  <h3 className="text-xs font-sans font-bold uppercase tracking-wider mb-3 flex items-center justify-between text-slate-400">
                    <span>Detection & Alerting Rules</span>
                    <Settings className="w-3.5 h-3.5 text-slate-500" />
                  </h3>
                  
                  <div className="space-y-3 font-sans">
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 text-slate-450">
                        <span>Latency Alert Threshold</span>
                        <span className="text-blue-500 font-bold">{latencyThreshold}ms</span>
                      </div>
                      <input
                        type="range"
                        min="500"
                        max="5000"
                        step="100"
                        value={latencyThreshold}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setLatencyThreshold(val);
                          setSettingsActiveMessage(`Latency limit ceiling configured to ${val}ms.`);
                          setTimeout(() => setSettingsActiveMessage(null), 2500);
                        }}
                        className="w-full accent-blue-500 bg-slate-800 rounded-lg h-1"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] mb-1 text-slate-455">
                        <span>Error Rate Trigger Ceiling</span>
                        <span className="text-rose-500 font-bold">{errorThreshold}%</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="50"
                        step="1"
                        value={errorThreshold}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setErrorThreshold(val);
                          setSettingsActiveMessage(`Error rate ceiling configured to ${val}%.`);
                          setTimeout(() => setSettingsActiveMessage(null), 2500);
                        }}
                        className="w-full accent-rose-500 bg-slate-800 rounded-lg h-1"
                      />
                    </div>
                    
                    <div className="pt-2 border-t border-white/5 space-y-1 text-[11px] text-slate-350">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={autoTriggerAI}
                          onChange={(e) => setAutoTriggerAI(e.target.checked)}
                          className="accent-blue-500"
                        />
                        <span>Auto-trigger Gemini analysis</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={slackNotifications}
                          onChange={(e) => setSlackNotifications(e.target.checked)}
                          className="accent-blue-500"
                        />
                        <span>Notify DevOps Slack channels</span>
                      </label>
                    </div>
                  </div>
                  
                  {settingsActiveMessage && (
                    <div className="mt-3 p-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[9px] text-emerald-450 font-mono text-center">
                      ✓ {settingsActiveMessage}
                    </div>
                  )}
                </div>

                {/* AI Blueprint Card */}
                <div className="bg-slate-900/40 backdrop-blur-md rounded-xl p-4 border border-white/5 flex flex-col gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                        AI Mitigation Blueprint
                      </h3>
                    </div>
                    <span className="text-[9px] font-mono text-slate-500 uppercase block mb-1">
                      {previewIncident.aiInsight.title}
                    </span>
                    <p className="text-slate-300 text-xs leading-normal font-sans pt-1">
                      {previewIncident.aiInsight.message}
                    </p>
                  </div>

                  <div className="bg-slate-950 rounded-lg border border-white/5 overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-white/5 bg-[#070b19] flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>remediation.sh</span>
                      <button
                        onClick={handleCopyCode}
                        className="px-1.5 py-0.5 rounded hover:bg-white/5 active:scale-95 transition-all text-slate-350 border border-white/5"
                      >
                        {copystate ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <pre className="p-3 text-[9px] font-mono text-sky-300 overflow-x-auto whitespace-pre leading-relaxed">
                      <code>{previewIncident.aiInsight.remediationCode}</code>
                    </pre>
                  </div>

                  <button
                    onClick={handleApplyMitigation}
                    disabled={isMitigating}
                    className="w-full py-2 bg-gradient-to-tr from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-bold text-xs font-mono uppercase rounded-lg transition-all active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Play className="w-3 h-3" />
                    {previewIncident.aiInsight.actionLabel}
                  </button>

                  {isMitigating && (
                    <div className="mt-2 bg-[#04060e] border border-amber-500/20 rounded p-2.5 font-mono text-[9px] text-teal-400 flex flex-col gap-1">
                      {mitigationLog.map((line, idx) => (
                        <div key={idx}>{line}</div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Telemetry live feed log streamer */}
                <div className={`rounded-xl p-4 border flex flex-col transition-all min-h-[180px] ${
                  isDarkMode ? "bg-slate-900/40 border-white/5" : "bg-white border-slate-200 shadow-sm"
                }`}>
                  <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-1">
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">Live Agent Stream</h3>
                    <button onClick={() => setLogs([])} className="text-[9px] font-mono text-slate-500 hover:text-slate-400">Clear</button>
                  </div>
                  
                  <div className="flex-1 flex flex-col gap-1.5 font-mono text-[9px] overflow-y-auto max-h-[140px]">
                    {logs.map((log, index) => {
                      const isMonitor = log.includes("[MONITOR]");
                      const isBreach = log.includes("[BREACH");
                      const colorClass = isBreach ? "text-rose-450 font-bold" : isMonitor ? "text-teal-400/90" : "text-slate-400";
                      return (
                        <div key={index} className="p-1 border border-white/5 bg-slate-955/40 rounded leading-tight">
                          <span className={colorClass}>{log}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>
          </div>
        ) : (
          
          /* VIEW 3: UNIFIED HISTORY & KNOWLEDGE BASE */
          <div className="relative z-20 flex flex-col gap-6 fade-in">
            {/* Header Card */}
            <div className={`rounded-xl p-4 border transition-all ${
              isDarkMode ? "bg-slate-900/40 border-white/5" : "bg-white border-slate-200 shadow-sm"
            }`}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BookOpen size={16} className="text-blue-500" />
                    <h2 className="text-sm font-bold font-mono tracking-tight" style={{ margin: 0 }}>History & Knowledge Base</h2>
                  </div>
                  <p className="muted" style={{ fontSize: 11, marginTop: 4, color: 'var(--slate-400)' }}>
                    Review past incident runs and manage the RAG knowledge base
                  </p>
                </div>
                <button type="button" onClick={loadHistoryData} className="icon-btn" title="Refresh" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '5px 10px', borderRadius: 6 }}>
                  <RefreshCw size={12} className={historyLoading ? "spin-slow" : ""} />
                  Refresh
                </button>
              </div>
            </div>

            {/* Search + Tab filters */}
            <div className={`rounded-xl p-3 border flex items-center gap-4 transition-all ${
              isDarkMode ? "bg-slate-900/40 border-white/5" : "bg-white border-slate-200 shadow-sm"
            }`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                <Search size={13} className="text-slate-400" />
                <input
                  type="text"
                  placeholder="Search runs or knowledge entries..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  style={{
                    flex: 1, background: 'none', border: 'none', outline: 'none',
                    fontSize: 12, color: 'inherit', fontFamily: 'var(--font-ui)',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['runs', 'rag'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setHistoryTab(t)} style={{
                    fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                    border: '1px solid var(--line)', cursor: 'pointer',
                    background: historyTab === t ? 'var(--primary-accent)' : 'transparent',
                    color: historyTab === t ? '#fff' : 'inherit',
                  }}>
                    {t === 'runs' ? `Runs (${historyRuns.length})` : `Knowledge (${historyRagEntries.length})`}
                  </button>
                ))}
              </div>
            </div>

            {historyLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Loader2 size={24} className="spin-slow text-blue-500" />
              </div>
            ) : historyTab === 'runs' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {historyRuns.filter(r => 
                  !historySearch || 
                  r.run_id.toLowerCase().includes(historySearch.toLowerCase()) || 
                  r.scenario_type.toLowerCase().includes(historySearch.toLowerCase())
                ).length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', color: 'var(--ink-4)', padding: '40px 0', fontSize: 12 }}>
                    No runs found{historySearch ? ` matching "${historySearch}"` : ''}
                  </div>
                ) : historyRuns.filter(r => 
                  !historySearch || 
                  r.run_id.toLowerCase().includes(historySearch.toLowerCase()) || 
                  r.scenario_type.toLowerCase().includes(historySearch.toLowerCase())
                ).map(run => {
                  const isExpanded = expandedRunId === run.run_id;
                  const formattedDate = new Date(run.created_at).toLocaleString();
                  const scenarioLower = run.scenario_type.toLowerCase();
                  
                  let vendorName = "Stripe";
                  let rootCause = "Webhook API degradation";
                  let duration = "14 min";
                  let confidence = "98%";
                  let resolution = "Vendor recovery";
                  
                  if (scenarioLower.includes("aws") || scenarioLower.includes("sts")) {
                    vendorName = "AWS";
                    rootCause = "STS Token validation fail";
                    duration = "8 min";
                    confidence = "92%";
                    resolution = "Local STS fallback override";
                  } else if (scenarioLower.includes("twilio")) {
                    vendorName = "Twilio";
                    rootCause = "SMS routing congestion";
                    duration = "21 min";
                    confidence = "88%";
                    resolution = "Fallback carrier failover";
                  } else if (scenarioLower.includes("cloudflare")) {
                    vendorName = "Cloudflare";
                    rootCause = "Edge network 522 errors";
                    duration = "5 min";
                    confidence = "95%";
                    resolution = "DNS route override applied";
                  }

                  return (
                    <div key={run.run_id} className="card animate-fadeIn" style={{ padding: 0, overflow: 'hidden' }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', cursor: 'pointer' }}
                        onClick={() => toggleRunExpansion(run.run_id)}
                      >
                        {reportLoadingId === run.run_id ? (
                          <Loader2 size={12} className="spin-slow text-slate-400" />
                        ) : isExpanded ? (
                          <ChevronDown size={13} className="text-slate-400" />
                        ) : (
                          <ChevronRight size={13} className="text-slate-400" />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="font-mono text-[11.5px] font-bold">
                              {run.run_id}
                            </span>
                            <span className={`text-[9.5px] px-1.5 py-0.2 rounded font-sans uppercase font-bold border ${
                              run.status === 'completed' ? 'bg-emerald-500/10 text-emerald-450 border-emerald-500/20' : 
                              run.status === 'failed' ? 'bg-red-500/10 text-rose-455 border-red-500/20' : 
                              'bg-amber-500/10 text-amber-450 border-amber-500/20'
                            }`}>
                              {run.status.toUpperCase()}
                            </span>
                          </div>
                          
                          {/* Rich Metadata Columns */}
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-2 text-[10px] text-slate-400 font-sans border-t border-white/5 pt-1.5">
                            <div>
                              <span className="text-slate-500 block uppercase text-[8.5px]">Vendor</span>
                              <span className={`font-semibold ${isDarkMode ? "text-slate-305" : "text-slate-700"}`}>{vendorName}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block uppercase text-[8.5px]">Root Cause</span>
                              <span className={`font-semibold ${isDarkMode ? "text-slate-305" : "text-slate-700"}`}>{rootCause}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block uppercase text-[8.5px]">Duration</span>
                              <span className={`font-semibold ${isDarkMode ? "text-slate-305" : "text-slate-700"}`}>{duration}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block uppercase text-[8.5px]">Confidence</span>
                              <span className="font-bold text-teal-450">{confidence}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block uppercase text-[8.5px]">Resolution</span>
                              <span className={`font-semibold ${isDarkMode ? "text-slate-305" : "text-slate-700"}`}>{resolution}</span>
                            </div>
                          </div>
                          
                          <div style={{ fontSize: 10, color: 'var(--slate-500)', marginTop: 4 }}>
                            Created: {formattedDate}
                          </div>
                        </div>
                        {run.has_report === 1 && (
                          <FileText size={12} style={{ color: 'var(--primary-accent)', flexShrink: 0 }} />
                        )}
                        {run.status === 'running' && (
                          <Link
                            to={`/run/${run.run_id}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ fontSize: 11, color: 'var(--primary-accent)', fontWeight: 600, textDecoration: 'none', marginRight: 8 }}
                          >
                            View Live →
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteRun(run.run_id); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: 4 }}
                          title="Delete Run"
                        >
                          <Trash2 size={12} className="hover:text-red-500 transition-colors" />
                        </button>
                      </div>
                      
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid var(--line)', padding: '14px', background: 'var(--surface-2)' }}>
                          {/* Styled RCA Investigation Timeline Checkpoints */}
                          <div className="mb-4 bg-slate-950/40 p-3 rounded-lg border border-white/5">
                            <h4 className="text-[10px] font-sans font-bold uppercase tracking-wider text-blue-500 mb-2">Investigation Process Timeline</h4>
                            <div className="space-y-2 text-[10px] text-slate-400 font-sans">
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                <span className="font-mono text-slate-500">10:02</span>
                                <span>Telemetry Alerts detected anomaly in ingress connection pool rate.</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                <span className="font-mono text-slate-500">10:03</span>
                                <span>Autonomous Swarm scanner initiated for {vendorName} status pages.</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                <span className="font-mono text-slate-500">10:05</span>
                                <span>Correlated server logs and confirmed {rootCause} behavior.</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span className="font-mono text-slate-500">10:07</span>
                                <span>Remediation hotfix verified. Outage resolved in {duration}.</span>
                              </div>
                            </div>
                          </div>
                          
                          {expandedRunReport ? (
                            <div>
                              <h4 className="text-[10px] font-sans font-bold uppercase tracking-wider text-slate-500 mb-1">RCA Summary Report</h4>
                              <pre style={{ fontSize: 11, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, color: 'var(--slate-300)' }}>
                                {expandedRunReport}
                              </pre>
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-500 italic">Loading report contents...</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Prepopulated System Playbooks & Failure Modes */}
                <div className="mb-2">
                  <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-blue-500 mb-3">System Incident Playbooks & Failure Modes</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`p-4 rounded-xl border transition-all ${isDarkMode ? "bg-slate-900/20 border-white/5" : "bg-white border-slate-200 shadow-3xs"}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <BookOpen className="w-4 h-4 text-blue-500" />
                        <h4 className="text-xs font-sans font-bold uppercase tracking-wider">Playbook: Stripe Connection pool overflow</h4>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                        Configures edge routing backoffs and connection pool validation whenever payment gateways return 504 Gateway errors.
                      </p>
                      <span className="text-[9px] font-mono mt-2.5 block text-slate-500">TAGS: stripe · gateway · dns-failover</span>
                    </div>
                    <div className={`p-4 rounded-xl border transition-all ${isDarkMode ? "bg-slate-900/20 border-white/5" : "bg-white border-slate-200 shadow-3xs"}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <BookOpen className="w-4 h-4 text-amber-500" />
                        <h4 className="text-xs font-sans font-bold uppercase tracking-wider">Playbook: AWS STS token mismatch recovery</h4>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                        Mitigates IAM validation outages by caching STS temporary tokens locally and automatically failing over to backup IAM roles.
                      </p>
                      <span className="text-[9px] font-mono mt-2.5 block text-slate-500">TAGS: aws · sts · token-cache</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/5 pt-4 mt-2">
                  <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-slate-400 mb-3">RAG Stored Incident Memories</h3>
                  {historyRagEntries.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                      <button type="button" onClick={clearRag} style={{
                        fontSize: 10.5, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                        background: 'var(--negative-tint)', border: '1px solid var(--negative)',
                        color: 'var(--negative)', cursor: 'pointer',
                      }}>
                        Clear Memory Cache
                      </button>
                    </div>
                  )}
                  {historyRagEntries.filter(e => 
                    !historySearch || 
                    e.incident_id.toLowerCase().includes(historySearch.toLowerCase()) || 
                    (e.vendor || '').toLowerCase().includes(historySearch.toLowerCase()) || 
                    e.content.toLowerCase().includes(historySearch.toLowerCase())
                  ).length === 0 ? (
                    <div className="card text-center p-8 text-xs text-slate-500">
                      {historyRagEntries.length === 0
                        ? 'No active RAG memories ingested yet. Ingress memories will populate automatically as runs finish.'
                        : `No RAG entries found matching "${historySearch}"`}
                    </div>
                  ) : historyRagEntries.filter(e => 
                  !historySearch || 
                  e.incident_id.toLowerCase().includes(historySearch.toLowerCase()) || 
                  (e.vendor || '').toLowerCase().includes(historySearch.toLowerCase()) || 
                  e.content.toLowerCase().includes(historySearch.toLowerCase())
                ).map(entry => {
                  return (
                    <div key={entry.incident_id} className="card" style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--slate-400)' }}>{entry.incident_id}</span>
                            {entry.vendor && (
                              <span style={{ fontSize: 9.5, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'rgba(59,130,246,0.1)', color: 'var(--primary-accent)' }}>
                                {entry.vendor}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--slate-400)', marginTop: 2 }}>
                            Resolved {entry.resolved_at ? new Date(entry.resolved_at).toLocaleString() : '—'} · {entry.duration} min
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteRagEntry(entry.incident_id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: 4 }}
                          title="Delete entry"
                        >
                          <Trash2 size={12} className="hover:text-red-500 transition-colors" />
                        </button>
                      </div>
                      <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6, fontSize: 11, lineHeight: 1.5, color: 'var(--slate-300)' }}>
                        {entry.content}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Clean Global Footer */}
      <footer className={`mt-24 border-t py-8 text-center text-xs font-mono tracking-wider transition-colors duration-300 ${
        isDarkMode ? "bg-slate-955/40 border-white/5 text-slate-500" : "bg-white border-slate-200 text-slate-400"
      }`}>
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>© 2026 AEGISOPS, INC. ALL CLAIMS SECURED.</span>
          <div className="flex gap-4">
            <a href="#overview" onClick={(e) => { e.preventDefault(); setView("landing"); }} className="hover:text-blue-400 transition-colors">Overview</a>
            <span>•</span>
            <button onClick={() => { setView("app"); setActiveAppTab("sandbox"); }} className="hover:text-amber-400 transition-colors bg-none border-none cursor-pointer">Console Cockpit</button>
          </div>
        </div>
      </footer>

    </div>
  );
}
