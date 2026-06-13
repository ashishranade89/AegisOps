export interface GraphNode {
  id: string;
  label: string;
  status: "error" | "active" | "standby" | "stable";
  details: string;
}

export interface GraphLink {
  from: string;
  to: string;
  style: "dashed" | "solid";
  color: string;
}

export interface TimelineEvent {
  time: string;
  title: string;
  status: "success" | "critical" | "warning" | "pending";
  description: string;
  metadata?: {
    tracedNode?: string;
    failureRate?: string;
    latencyValue?: string;
    httpStatus?: number;
    threadUtilization?: string;
    actionTaken?: string;
    payloadDump?: string;
  };
}

export interface AIInsight {
  title: string;
  message: string;
  remediationCode: string;
  actionLabel: string;
}

export interface VendorHealth {
  name: string;
  status: "operational" | "degraded" | "outage";
  barValues: number[];
}

export interface RootCause {
  origin: string;
  confidence: number;
  summary: string;
  severity: "critical" | "warning" | "stable";
}

export interface IncidentState {
  topic: string;
  rootCause: RootCause;
  graphNodes: GraphNode[];
  graphLinks: GraphLink[];
  timeline: TimelineEvent[];
  aiInsight: AIInsight;
  vendorHealth: VendorHealth[];
}

export interface PredefinedScenario {
  id: string;
  name: string;
  icon: string;
  description: string;
}
