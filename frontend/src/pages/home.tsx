import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Shield, ArrowRight,
  Sun, Moon,
  Search, Trash2, ChevronRight, ChevronDown, BookOpen, FileText, RefreshCw, Loader2, ServerCog
} from "lucide-react";
import { NetworkParticles } from "@/components/vigilant/NetworkParticles";
import { AIGlobeHero } from "@/components/vigilant/AIGlobeHero";
import { IncidentState } from "@/types/vigilant";
import { listScenarios, startIncident, getHealth, ScenarioInfo } from "@/lib/api";
import { useIncidentStore } from "@/stores/incident-store";
import { AgentSwarmCockpit, TelemetryMode } from "@/components/vigilant/AgentSwarmCockpit";
import { ApiKeyGate } from "@/components/vigilant/ApiKeyGate";

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
    const stored = localStorage.getItem("theme");
    if (stored === "dark") return true;
    if (stored === "light") return false;
    // No stored preference — use system color scheme, default to dark
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
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

  const getAuthHeaders = (extra: Record<string, string> = {}): Record<string, string> => {
    const headers: Record<string, string> = { ...extra };
    const apiKey = localStorage.getItem('incident_api_key') || incidentApiKey;
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    return headers;
  };

  async function loadHistoryData() {
    setHistoryLoading(true);
    try {
      const [runsRes, ragRes] = await Promise.all([
        fetch('/api/history', { headers: getAuthHeaders() }),
        fetch('/api/rag/entries', { headers: getAuthHeaders() }),
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
    await fetch(`/api/history/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    setHistoryRuns(r => r.filter(x => x.run_id !== id));
    if (expandedRunId === id) {
      setExpandedRunId(null);
      setExpandedRunReport(null);
    }
  }

  async function deleteRagEntry(id: string) {
    await fetch(`/api/rag/entries/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    setHistoryRagEntries(e => e.filter(x => x.incident_id !== id));
  }

  async function clearRag() {
    if (!confirm('Clear all knowledge base entries and stored API keys? This cannot be undone.')) return;
    await fetch('/api/rag/clear', { method: 'DELETE', headers: getAuthHeaders() });
    setHistoryRagEntries([]);

    // Clear API keys from localStorage
    localStorage.removeItem('openrouter_key');
    localStorage.removeItem('tavily_key');
    localStorage.removeItem('incident_api_key');
    localStorage.removeItem('llm_model');
    localStorage.removeItem('llm_provider');
    localStorage.removeItem('llm_base_url');
    sessionStorage.removeItem('keys_submitted_session');

    // Also clear theme so both browsers revert to dark
    localStorage.removeItem('theme');

    // Reset React state
    setOpenrouterKey('');
    setTavilyKey('');
    setIncidentApiKey('');
    setLlmModel('google/gemini-2.0-flash-001');
    setLlmProvider('openrouter');
    setLlmBaseUrl('http://localhost:11434/v1');
    setIsDarkMode(true);
    setKeysSubmitted(false);
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
      const res = await fetch(`/api/history/${runId}/report`, { headers: getAuthHeaders() });
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
  const [clientKeysAllowed, setClientKeysAllowed] = useState<boolean>(true);
  const [authRequired, setAuthRequired] = useState<boolean>(false);
  const [incidentApiKey, setIncidentApiKey] = useState<string>('');
  
  // Telemetry Ingestion Mode states
  const [telemetryMode, setTelemetryMode] = useState<'standard' | 'preset' | 'upload' | 'manual'>('standard');
  const [selectedPreset, _setSelectedPreset] = useState<string>('stripe_gateway_error.json');
  const [uploadedData, setUploadedData] = useState<any | null>(null);
  const [manualDescription, setManualDescription] = useState<string>('');
  
  // Custom alert threshold states
  const [latencyThreshold, _setLatencyThreshold] = useState<number>(1800);
  const [errorThreshold, _setErrorThreshold] = useState<number>(15);
  const [_expandedEventIdx, setExpandedEventIdx] = useState<number | null>(null);
  const [_copystate, _setCopystate] = useState<boolean>(false);
  const [isMitigating, setIsMitigating] = useState<boolean>(false);
  const [_mitigationLog, setMitigationLog] = useState<string[]>([]);
  
  // Telemetry live stream logs
  const [_logs, setLogs] = useState<string[]>([
    "System initialized. Core Engine V3.4 active.",
    "Awaiting thresholds configuration & investigative triggers.",
    "All synthetic uptime checks reporting operational."
  ]);
  
  // Dynamic Incident state preview loaded from scenario maps
  const [previewIncident, setPreviewIncident] = useState<IncidentState>(MOCK_INCIDENTS.stripe_outage);
  
  // Real Investigation running states
  const [loading, setLoading] = useState<boolean>(false);
  const [_error, setError] = useState<string | null>(null);
  
  // Immersive gateway scanning terminal simulation
  const [loadingAnalysis, setLoadingAnalysis] = useState<boolean>(false);
  const [_consoleLogs, setConsoleLogs] = useState<string[]>([]);
  // True once the user has explicitly submitted keys via the gate or if keys are already saved in localStorage.
  const [keysSubmitted, setKeysSubmitted] = useState<boolean>(
    () => {
      const hasOrKey = !!localStorage.getItem('openrouter_key');
      const isLocal = localStorage.getItem('llm_provider') === 'local';
      return isLocal || hasOrKey;
    }
  );
  
  const { runId, setRunId, setScenario } = useIncidentStore();
  const agentLogTimerRef = useRef<any>(null);

  // Always require the user to supply their own OpenRouter key.
  // Even if the server env has a key, we still enforce the user to enter one
  // so there are no silently shared credentials.
  const needsClientOpenRouterKey =
    llmProvider === 'openrouter' && !openrouterKey.trim();
  const needsIncidentApiKey = authRequired && !incidentApiKey.trim();
  const cockpitLocked = needsClientOpenRouterKey || needsIncidentApiKey;

  // Retrieve keys on mount & health checks
  useEffect(() => {
    // Load saved config into state (pre-fills the gate form for returning users)
    setOpenrouterKey(localStorage.getItem('openrouter_key') || '');
    setTavilyKey(localStorage.getItem('tavily_key') || '');
    setLlmModel(localStorage.getItem('llm_model') || 'openai/gpt-4o');
    setLlmProvider((localStorage.getItem('llm_provider') as 'openrouter' | 'local') || 'openrouter');
    setLlmBaseUrl(localStorage.getItem('llm_base_url') || 'http://localhost:11434/v1');
    setIncidentApiKey(localStorage.getItem('incident_api_key') || '');

    async function load() {
      try {
        const health = await getHealth();
        setClientKeysAllowed(health.client_keys_allowed);
        setAuthRequired(health.auth_required);

        // Detect backend restart — clear stale localStorage keys so the gate re-appears
        const storedInstanceId = localStorage.getItem('server_instance_id');
        if (storedInstanceId && storedInstanceId !== health.server_instance_id) {
          ['openrouter_key','tavily_key','incident_api_key','llm_model','llm_provider','llm_base_url'].forEach(k => localStorage.removeItem(k));
          sessionStorage.removeItem('keys_submitted_session');
          setOpenrouterKey(''); setTavilyKey(''); setIncidentApiKey('');
          setLlmModel('google/gemini-2.0-flash-001'); setLlmProvider('openrouter'); setLlmBaseUrl('http://localhost:11434/v1');
          setKeysSubmitted(false);
        }
        localStorage.setItem('server_instance_id', health.server_instance_id);

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

  // Launch a real backend investigation and redirect to Live graph page
  const handleStart = async () => {
    // Hard guard — never launch without a key regardless of server state
    if (llmProvider === 'openrouter' && !openrouterKey.trim()) {
      setError('OpenRouter API key is required. Enter your key in the API Keys tab before launching.');
      return;
    }
    if (telemetryMode === 'standard' && !selectedScenarioType) return;
    if (telemetryMode === 'upload' && !uploadedData) return;
    if (telemetryMode === 'manual' && !manualDescription.trim()) return;
    
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
    // Always send the user-supplied key so the backend uses it directly
    const targetKey = llmProvider === 'openrouter' ? openrouterKey : undefined;

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
    } else if (telemetryMode === 'manual') {
      activeScenarioType = 'custom_telemetry';
      activeCustomTelemetry = {
        raw_logs: [{ timestamp: new Date().toISOString(), level: "ERROR", service: "user-report", message: manualDescription.trim() }],
        raw_metrics: {}
      };
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
    <div className="w-full h-full overflow-y-auto font-sans transition-colors duration-300 bg-[var(--bg)] text-[var(--ink)]">
      
      <div className="absolute top-0 right-0 w-[45%] h-[400px] bg-sky-500/5 blur-[120px] rounded-full pointer-events-none"></div>

      {/* Unified Command Header */}
      <header className="sticky top-0 z-50 border-b backdrop-blur-md transition-all bg-[var(--bg)]/80 border-[var(--line)]">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 flex-shrink-0" style={{ textDecoration: 'none', color: 'inherit' }} onClick={() => setView('landing')}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-rose-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-.02em', color: 'var(--ink)', margin: 0, lineHeight: 1.2 }}>AegisOps</h1>
              <span style={{ fontSize: 10, color: 'var(--ink-4)', display: 'block', fontFamily: 'monospace' }}>Autonomous Incident Orchestrator</span>
            </div>
          </Link>

          {/* Segmented Nav */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            background: 'var(--surface)', border: '1px solid var(--line)',
            borderRadius: 12, padding: 4, flexShrink: 0,
          }}>
            {([
              { label: 'Overview',       action: () => setView('landing'),                                             active: view === 'landing' },
              { label: 'Agent Swarm',    action: () => { setView('app'); setActiveAppTab('sandbox'); },                active: view === 'app' && activeAppTab === 'sandbox', id: 'view-sandbox-dashboard-btn' },
              { label: 'Investigations', action: () => { setView('app'); setActiveAppTab('history'); setHistoryTab('runs'); }, active: view === 'app' && activeAppTab === 'history' && historyTab === 'runs' },
              { label: 'Knowledge Base', action: () => { setView('app'); setActiveAppTab('history'); setHistoryTab('rag'); },  active: view === 'app' && activeAppTab === 'history' && historyTab === 'rag' },
            ] as {label:string; action:()=>void; active:boolean; id?:string}[]).map((item) => (
              <button
                key={item.label}
                id={(item as any).id}
                onClick={item.action}
                style={{
                  padding: '7px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: item.active ? 800 : 500,
                  background: item.active ? 'var(--primary-accent)' : 'transparent',
                  color: item.active ? '#fff' : 'var(--ink-3)',
                  transition: 'all 150ms',
                  boxShadow: item.active ? '0 2px 10px rgba(249,115,22,.3)' : 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
              </button>
            ))}
            <button
              onClick={() => navigate('/sources')}
              style={{
                padding: '7px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5,
                background: 'transparent', color: 'var(--ink-3)', transition: 'all 150ms',
              }}
              title="Configure log source monitors"
            >
              <ServerCog style={{ width: 13, height: 13 }} />
              Log Sources
            </button>
            {runId && (
              <button
                onClick={() => navigate(`/run/${runId}`)}
                style={{
                  padding: '7px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(244,63,94,.15)', color: '#f43f5e',
                  animation: 'none',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f43f5e', display: 'inline-block', animation: 'sse-pulse 1.5s infinite' }} />
                Active Run
              </button>
            )}
          </div>

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: 'monospace', padding: '4px 10px', borderRadius: 8, background: 'rgba(16,185,129,.08)', color: '#10b981', border: '1px solid rgba(16,185,129,.2)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              Live
            </span>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink-2)', transition: 'all 120ms' }}
              title="Toggle theme"
            >
              {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
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
              <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4 text-[var(--ink)]">
                Autonomous AI agents detect, <br />
                investigate, and explain <br />
                <span className="bg-gradient-to-r from-blue-600 via-teal-500 to-emerald-500 bg-clip-text text-transparent">
                  third-party vendor outages.
                </span>
              </h2>
              <p className="text-sm md:text-base max-w-2xl mx-auto font-sans leading-relaxed text-[var(--ink-3)]">
                From alert to root cause in minutes. AegisOps automatically triages telemetry exceptions, scans status pages, and compiles verified fallback routing patches.
              </p>

              {/* CTAs */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 32 }}>
                <button
                  id="deploy-sandbox-btn"
                  onClick={() => { setView('app'); setActiveAppTab('sandbox'); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '15px 32px', borderRadius: 12,
                    background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                    color: '#fff', fontSize: 15, fontWeight: 900,
                    border: '1px solid rgba(255,255,255,.18)',
                    cursor: 'pointer',
                    boxShadow: '0 8px 32px rgba(37,99,235,.45), 0 2px 0 rgba(255,255,255,.12) inset',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    transition: 'all 150ms',
                  }}
                >
                  <span style={{ fontSize: 18 }}>🚀</span>
                  Run Demo Incident
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setView('app'); setActiveAppTab('history'); setHistoryTab('runs'); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '15px 32px', borderRadius: 12,
                    background: 'var(--surface)',
                    color: 'var(--ink)', fontSize: 15, fontWeight: 800,
                    border: '1px solid var(--line-strong)',
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(0,0,0,.2)',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    transition: 'all 150ms',
                  }}
                >
                  <span style={{ fontSize: 18 }}>📋</span>
                  Explore RCA Reports
                </button>
              </div>

              {/* Supported Vendors Strip */}
              <div className="mt-12 pt-6 border-t border-[var(--line)] max-w-xl mx-auto">
                <span className="text-[10px] uppercase tracking-wider text-[var(--ink-4)] block mb-3 font-sans font-bold">Supported Integrations & Monitored Vendors</span>
                <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-xs font-sans font-semibold text-[var(--ink-3)]">
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
                <h3 className="text-xs font-sans tracking-widest text-blue-500 uppercase font-bold">Autonomous Agents Stack</h3>
                <h4 className="text-xl font-bold mt-1 text-[var(--ink)]">Four specialized layers. Zero-touch operations.</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                
                {/* CARD 1 */}
                <div className="p-5 rounded-xl border flex flex-col justify-between transition-all border-[var(--line)] bg-[var(--surface)] backdrop-blur-md hover:border-[var(--line-strong)]">
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-blue-950/50 border border-blue-500/20 flex items-center justify-center text-lg mb-4 shadow-3xs">
                      🔍
                    </div>
                    <h5 className="font-bold text-sm tracking-tight mb-1">Triage Agent</h5>
                    <p className="text-xs leading-normal font-sans text-[var(--ink-3)]">
                      Ingests logs, metrics, and alerts to pinpoint which dependency or vendor has failed.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t flex items-center justify-between text-[11px] font-sans border-[var(--line)]">
                    <span className="text-blue-500 font-bold">Scanning Uptime</span>
                    <span className="text-[var(--ink-4)]">Live alerts</span>
                  </div>
                </div>

                {/* CARD 2 */}
                <div className="p-5 rounded-xl border flex flex-col justify-between transition-all border-[var(--line)] bg-[var(--surface)] backdrop-blur-md hover:border-[var(--line-strong)]">
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-amber-950/50 border border-amber-500/20 flex items-center justify-center text-lg mb-4 shadow-3xs">
                      ⚙️
                    </div>
                    <h5 className="font-bold text-sm tracking-tight mb-1">Web Searcher</h5>
                    <p className="text-xs leading-normal font-sans text-[var(--ink-3)]">
                      Queries Tavily Search for public DownDetector spikes and API status indicators.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t flex items-center justify-between text-[11px] font-sans border-[var(--line)]">
                    <span className="text-amber-500 font-bold">Search API</span>
                    <span className="text-[var(--ink-4)]">Tavily engine</span>
                  </div>
                </div>

                {/* CARD 3 */}
                <div className="p-5 rounded-xl border flex flex-col justify-between transition-all border-[var(--line)] bg-[var(--surface)] backdrop-blur-md hover:border-[var(--line-strong)]">
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-purple-950/50 border border-purple-500/20 flex items-center justify-center text-lg mb-4 shadow-3xs">
                      🌐
                    </div>
                    <h5 className="font-bold text-sm tracking-tight mb-1">Browser Watcher</h5>
                    <p className="text-xs leading-normal font-sans text-[var(--ink-3)]">
                      Launches headless Stagehand browsers to verify vendor status boards and login interfaces.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t flex items-center justify-between text-[11px] font-sans border-[var(--line)]">
                    <span className="text-purple-500 font-bold">Scraping Engine</span>
                    <span className="text-[var(--ink-4)]">Playwright</span>
                  </div>
                </div>

                {/* CARD 4 */}
                <div className="p-5 rounded-xl border flex flex-col justify-between transition-all border-[var(--line)] bg-[var(--surface)] backdrop-blur-md hover:border-[var(--line-strong)]">
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-emerald-950/50 border border-emerald-500/20 flex items-center justify-center text-lg mb-4 shadow-3xs">
                      📝
                    </div>
                    <h5 className="font-bold text-sm tracking-tight mb-1">Mitigation Specialist</h5>
                    <p className="text-xs leading-normal font-sans text-[var(--ink-3)]">
                      Synthesizes DNS fallback routes and webhook buffer policies into self-healing reports.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t flex items-center justify-between text-[11px] font-sans border-[var(--line)]">
                    <span className="text-emerald-500 font-bold">RAG Cache</span>
                    <span className="text-[var(--ink-4)]">Auto-mitigate</span>
                  </div>
                </div>

              </div>
            </section>

          </div>
        ) : activeAppTab === "sandbox" ? (
          !keysSubmitted ? (
            // ── API Key Gate — always shown on first visit / fresh session ──
            // Pre-filled with any previously saved keys for convenience.
            <ApiKeyGate
              openrouterKey={openrouterKey}
              setOpenrouterKey={setOpenrouterKey}
              tavilyKey={tavilyKey}
              setTavilyKey={setTavilyKey}
              llmModel={llmModel}
              setLlmModel={setLlmModel}
              llmProvider={llmProvider}
              setLlmProvider={setLlmProvider}
              llmBaseUrl={llmBaseUrl}
              setLlmBaseUrl={setLlmBaseUrl}
              onSubmit={() => {
                // Mark this session as having submitted — survives tab navigation
                // but resets on page refresh / new tab, re-showing the gate.
                sessionStorage.setItem('keys_submitted_session', 'true');
                setKeysSubmitted(true);
              }}
            />
          ) : (
          <AgentSwarmCockpit
            scenarios={scenarios}
            selectedScenarioType={selectedScenarioType}
            onScenarioChange={handleScenarioChange}
            telemetryMode={telemetryMode}
            onTelemetryModeChange={(m) => setTelemetryMode(m as TelemetryMode)}
            onLaunch={handleStart}
            onUploadData={setUploadedData}
            manualDescription={manualDescription}
            setManualDescription={setManualDescription}
            loading={loading}
            loadingAnalysis={loadingAnalysis}
            cockpitLocked={cockpitLocked}
            previewIncident={previewIncident}
            onApplyMitigation={handleApplyMitigation}
            isMitigating={isMitigating}
            // Config props
            openrouterKey={openrouterKey}
            setOpenrouterKey={setOpenrouterKey}
            tavilyKey={tavilyKey}
            setTavilyKey={setTavilyKey}
            llmModel={llmModel}
            setLlmModel={setLlmModel}
            llmProvider={llmProvider}
            setLlmProvider={setLlmProvider}
            llmBaseUrl={llmBaseUrl}
            setLlmBaseUrl={setLlmBaseUrl}
          />
          )
        ) : (
          
          /* VIEW 3: UNIFIED HISTORY & KNOWLEDGE BASE */
          <div className="relative z-20 flex flex-col gap-6 fade-in">

            {/* Page header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '4px 0' }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--ink)', margin: 0, letterSpacing: '-.02em' }}>
                  {historyTab === 'runs' ? '🔍 Past Investigations' : '🧠 Knowledge Base'}
                </h2>
                <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
                  {historyTab === 'runs'
                    ? 'All completed incident investigation runs with root cause analysis reports.'
                    : 'RAG-indexed incident memories used to accelerate future investigations.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button" onClick={loadHistoryData}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  <RefreshCw size={13} className={historyLoading ? 'spin-slow' : ''} />
                  Refresh
                </button>
                <button
                  type="button" onClick={clearRag}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: '1px solid var(--negative)', background: 'var(--negative-tint)', color: 'var(--negative)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  <Trash2 size={13} />
                  Clear Cache &amp; API Keys
                </button>
              </div>
            </div>

            {/* Segmented tab + search bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px' }}>
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', padding: 4, borderRadius: 9, border: '1px solid var(--line)', flexShrink: 0 }}>
                {(['runs', 'rag'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setHistoryTab(t)} style={{
                    padding: '7px 16px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    fontSize: 12.5, fontWeight: historyTab === t ? 800 : 500,
                    background: historyTab === t ? 'var(--primary-accent)' : 'transparent',
                    color: historyTab === t ? '#fff' : 'var(--ink-3)',
                    transition: 'all 120ms',
                    boxShadow: historyTab === t ? '0 2px 8px rgba(249,115,22,.3)' : 'none',
                  }}>
                    {t === 'runs'
                      ? `Investigations ${historyRuns.length > 0 ? `(${historyRuns.length})` : ''}`
                      : `Knowledge ${historyRagEntries.length > 0 ? `(${historyRagEntries.length})` : ''}`}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <Search size={14} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Search by run ID, scenario, vendor…"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--font-ui)' }}
                />
              </div>
            </div>

            {historyLoading ? (
              <div style={{ textAlign: 'center', padding: '60px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                <Loader2 size={32} style={{ color: 'var(--primary-accent)', animation: 'cockpit-spin 1s linear infinite' }} />
                <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading investigation history…</span>
              </div>
            ) : historyTab === 'runs' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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

                  return (
                    <div key={run.run_id} className="card animate-fadeIn" style={{ padding: 0, overflow: 'hidden' }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', cursor: 'pointer' }}
                        onClick={() => toggleRunExpansion(run.run_id)}
                      >
                        {reportLoadingId === run.run_id ? (
                          <Loader2 size={12} className="spin-slow text-[var(--ink-3)]" />
                        ) : isExpanded ? (
                          <ChevronDown size={13} className="text-[var(--ink-3)]" />
                        ) : (
                          <ChevronRight size={13} className="text-[var(--ink-3)]" />
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
                          
                          {/* Real Metadata Columns */}
                          <div className="grid grid-cols-3 gap-3 mt-2 text-[10px] text-[var(--ink-3)] font-sans border-t border-white/5 pt-1.5">
                            <div>
                              <span className="text-[var(--ink-4)] block uppercase text-[8.5px]">Scenario</span>
                              <span className="font-semibold text-[var(--ink-2)]">{run.scenario_type.replace(/_/g, ' ')}</span>
                            </div>
                            <div>
                              <span className="text-[var(--ink-4)] block uppercase text-[8.5px]">Phase</span>
                              <span className="font-semibold text-[var(--ink-2)]">{run.current_phase?.replace(/_/g, ' ') || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[var(--ink-4)] block uppercase text-[8.5px]">Updated</span>
                              <span className="font-semibold text-[var(--ink-2)]">{new Date(run.updated_at).toLocaleTimeString()}</span>
                            </div>
                          </div>
                          
                          <div style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 4 }}>
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
                        {run.status === 'paused' && (
                          <Link
                            to={`/run/${run.run_id}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ fontSize: 11, color: 'var(--warn)', fontWeight: 600, textDecoration: 'none', marginRight: 8 }}
                          >
                            Review & Approve →
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
                          {expandedRunReport ? (
                            <div>
                              <h4 className="text-[10px] font-sans font-bold uppercase tracking-wider text-[var(--ink-4)] mb-1">RCA Summary Report</h4>
                              <pre style={{ fontSize: 11, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, color: 'var(--ink-2)' }}>
                                {expandedRunReport}
                              </pre>
                            </div>
                          ) : (
                            <div className="text-[11px] text-[var(--ink-4)] italic">Loading report contents...</div>
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
                    <div className={"p-4 rounded-xl border transition-all bg-[var(--surface)] border-[var(--line)]"}>
                      <div className="flex items-center gap-2 mb-2">
                        <BookOpen className="w-4 h-4 text-blue-500" />
                        <h4 className="text-xs font-sans font-bold uppercase tracking-wider">Playbook: Stripe Connection pool overflow</h4>
                      </div>
                      <p className="text-[11px] text-[var(--ink-3)] leading-relaxed font-sans">
                        Configures edge routing backoffs and connection pool validation whenever payment gateways return 504 Gateway errors.
                      </p>
                      <span className="text-[9px] font-mono mt-2.5 block text-[var(--ink-4)]">TAGS: stripe · gateway · dns-failover</span>
                    </div>
                    <div className={"p-4 rounded-xl border transition-all bg-[var(--surface)] border-[var(--line)]"}>
                      <div className="flex items-center gap-2 mb-2">
                        <BookOpen className="w-4 h-4 text-amber-500" />
                        <h4 className="text-xs font-sans font-bold uppercase tracking-wider">Playbook: AWS STS token mismatch recovery</h4>
                      </div>
                      <p className="text-[11px] text-[var(--ink-3)] leading-relaxed font-sans">
                        Mitigates IAM validation outages by caching STS temporary tokens locally and automatically failing over to backup IAM roles.
                      </p>
                      <span className="text-[9px] font-mono mt-2.5 block text-[var(--ink-4)]">TAGS: aws · sts · token-cache</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/5 pt-4 mt-2">
                  <h3 className="text-xs font-sans font-bold uppercase tracking-wider text-[var(--ink-3)] mb-3">RAG Stored Incident Memories</h3>
                  {historyRagEntries.filter(e => 
                    !historySearch || 
                    e.incident_id.toLowerCase().includes(historySearch.toLowerCase()) || 
                    (e.vendor || '').toLowerCase().includes(historySearch.toLowerCase()) || 
                    e.content.toLowerCase().includes(historySearch.toLowerCase())
                  ).length === 0 ? (
                    <div className="card text-center p-8 text-xs text-[var(--ink-4)]">
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
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>{entry.incident_id}</span>
                            {entry.vendor && (
                              <span style={{ fontSize: 9.5, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'rgba(59,130,246,0.1)', color: 'var(--primary-accent)' }}>
                                {entry.vendor}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>
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
                      <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6, fontSize: 11, lineHeight: 1.5, color: 'var(--ink-2)' }}>
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
      <footer className="mt-24 border-t py-8 text-center text-xs font-mono tracking-wider transition-colors duration-300 bg-[var(--surface)] border-[var(--line)] text-[var(--ink-4)]">
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
