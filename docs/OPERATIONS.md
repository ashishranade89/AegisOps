# Operations & Deployment Guide

This document covers everything you need to know to install, configure, use, and deploy AegisOps.

---

## 📥 Installation

### Prerequisites
- **Python 3.12+**: We recommend using `uv` for lightning-fast dependency management.
- **Node.js 18+**: Required for the Vite/React frontend.
- **API Keys**:
    - **OpenRouter (Required)**: Access to various LLMs (Gemini, GPT, Claude).
    - **Tavily (Optional)**: For enhanced web search capabilities.
    - **Slack (Optional)**: For automated incident notifications.

### Local Setup
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/hackathon/aegisops.git
    cd aegisops
    ```

2.  **Run the automated setup script**:
    ```bash
    # macOS / Linux
    chmod +x setup.sh
    ./setup.sh

    # Windows (PowerShell)
    .\setup.ps1
    ```
    *The script installs Python dependencies, npm packages, copies `.env.example` to `.env`, and installs Playwright browsers.*

---

## ⚙️ Configuration

Edit the `.env` file in the root directory to configure the system:

```env
# Core LLM Config (OpenRouter)
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=google/gemini-2.0-flash-exp  # Recommended default

# Search Tools
TAVILY_API_KEY=your_tavily_key  # Optional

# Production Security
# Incident API key headers are disabled for this app.
# Windows launcher note: `.\start.ps1` clears listeners on startup and can fall back off port 8004 if needed.
ALLOW_CLIENT_API_KEYS=true             # Set to false for internal deployments

# Log Source Monitor (optional)
API_PORT=8004                          # Port the backend listens on; monitors use this for internal triggers
```

> **Credential encryption key** — on first startup, `data/monitor.key` is
> auto-generated and used to Fernet-encrypt SSH credentials stored in the DB.
> Back this file up alongside `data/runs.db`; losing it means stored credentials
> cannot be decrypted.

---

## 💻 Usage

### Launching the Dashboard
The easiest way to use AegisOps is through the **Electron Desktop App**:
```bash
cd frontend
npm run electron:dev
```

Alternatively, you can run the components separately:
- **Backend**: `uv run uvicorn api.app:app --port 8004 --reload`
- **Frontend**: `cd frontend && npm run dev`

### Running an Investigation
1.  **Select a Scenario**: Use the "Scenario Picker" in the UI to simulate common outages (e.g., "Stripe API Timeout").
2.  **Upload Telemetry**: You can also upload your own JSON logs/metrics.
3.  **Monitor the Swarm**: Watch the real-time "Agent Feed" to see which agent is working and what tools they are using.
4.  **Approve Remediation**: If paused, review the findings and approve the remediation plan to proceed.
5.  **View Report**: Once finished, download or view the Markdown postmortem.

### Managing Log Sources

AegisOps can continuously monitor remote servers and local log files and
automatically open incident investigations when critical events are detected.

1.  **Navigate to Log Sources**: Click **Log Sources** in the sidebar.
2.  **Add a source**: Click **Add Source** and fill in the form:
    - **Name** — a human-readable label (e.g. `prod-web-01`)
    - **Type** — `SSH/SFTP`, `Syslog UDP`, `Syslog TCP`, or `Local File`
    - **Host / Port** — target server address (SSH and Syslog types)
    - **Log File Path** — remote or local path to the log file
    - **Scan Interval** — how often to poll / flush (seconds)
    - **Credentials** — SSH password or PEM private key (stored encrypted)
    - **Auto-Remediate** — when enabled, the pipeline's human-approval gate
      is bypassed and remediation runs automatically
3.  **Toggle a source on/off**: Use the **Enable/Disable** toggle on the source
    card without deleting the configuration.
4.  **Edit or delete**: Use the **Edit** (pencil) and **Delete** (trash) icons
    on each card.

> **Auto-Remediate caution**: enable this only for low-risk environments or
> when you trust the remediation playbook fully. For production, leave it off
> so a human reviews the plan before execution.

---

## 🚢 Deployment

### Docker (Recommended)
Build and run the containerized application:
```bash
docker build -t aegisops .
docker run -p 8004:8004 --env-file .env aegisops
```

### Production Considerations
-   **Security**: Ensure `ALLOW_CLIENT_API_KEYS` is set to `false` and use a strong `INCIDENT_API_KEY`.
-   **Persistence**: Mount a volume to `/app/data` to ensure the SQLite run history, RAG memory, **and the monitor encryption key** (`data/monitor.key`) are preserved between restarts. Losing `monitor.key` invalidates all stored SSH credentials.
-   **Resource Allocation**: The Browser Agent (Playwright) requires significant RAM and CPU. Ensure your host has at least 2GB of free RAM.
-   **SSH Host Verification**: The SSH monitor currently accepts any host key (`known_hosts=None`). For production deployments, replace this with a populated `known_hosts` file in `backend/monitors/ssh_monitor.py` to prevent MITM attacks.

---

## 🛠️ Troubleshooting

If something goes wrong, run the repair script:
```bash
./fix.sh
```
Common issues and fixes:
- **Port Conflicts**: `./start.sh` or `.\start.ps1` clear listeners automatically; if you are starting things manually, ensure ports 8004 and 5176 are free.
- **Missing Deps**: Run `uv sync` and `npm install` again.
- **LLM Errors**: Check your OpenRouter balance and API key validity.
