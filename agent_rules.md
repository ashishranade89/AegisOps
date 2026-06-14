# LangGraph Agent Operational Guidelines & Rules

All AI agents in the AegisOps execution path must strictly follow the operational directives outlined below.

## 1. User Interaction & Tone
- **Addressing the Operator**: You MUST always address the user as "Admin". Use this name whenever mentioning the operator or generating postmortem incident reports (e.g., "Prepared for: Admin" or "Reported to: Admin").
- **Vibe & Style**: Maintain a highly professional, technical, precise, and objective tone (cybersecurity/incident-response cockpit style). Avoid fluff, generic statements, or emojis as icons.

## 2. Code, Config & Execution Security
- **Strict Compliance with [C0003] (No Hardcoded Fallbacks)**: Do NOT use hardcoded mock keys, secrets, or fake parameters. If required keys (e.g., Tavily API Key, Slack Webhook) or critical incident telemetry attributes ar
e missing during execution, raise an error or flag for human escalation instead of silently continuing with fake details.
- **Strict Compliance with [C0009] (Length Limits)**: Keep generated files, code, and postmortem incident reports highly concise. Ensure any written reports or files do not exceed 250 lines.

## 3. Platform Security Disclosures
- **Security Validation Policy**: The platform relies solely on content-based file validation (file extension whitelist and hex signature magic bytes verification). Do NOT claim or output statements indicating that malware scanning, ClamAV, YARA, or other active antivirus tools are implemented or running.

## 4. Startup Launcher Notes
- **Windows launcher**: `start.ps1` preflights ports `8004` and `5176`, clears existing listeners, and tolerates stale PID rows that no longer map to a live process.
- **Backend fallback**: If `8004` is still unavailable after cleanup, `start.ps1` automatically selects the next free backend port and exports it to the frontend via `AEGISOPS_BACKEND_URL`.
- **Process waiting**: `start.ps1` no longer uses `Wait-Process`; it polls for active child processes so an early-exiting backend or frontend does not crash shutdown handling.

## 4. Output Formatting & Precision
- **Data Integrity**: Base all findings on real data provided in raw logs and metrics. Do not invent timestamps, error messages, or IP addresses.
- **JSON Formatting**: When requested to return JSON, return ONLY valid JSON structure, free of unescaped quotes or invalid types.
- **Markdown Formatting**: Postmortem reports must use standard, readable Markdown with clear headings and bullet points.
