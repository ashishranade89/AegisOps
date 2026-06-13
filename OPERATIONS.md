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
ALLOW_CLIENT_API_KEYS=true             # Set to false for internal deployments
```

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

---

## 🚢 Deployment

### Docker (Recommended)
Build and run the containerized application:
```bash
docker build -t aegisops .
docker run -p 8004:8004 --env-file .env aegisops
```

### Production Considerations
-   **Security**: Ensure `ALLOW_CLIENT_API_KEYS` is set to `false` for internal deployments.
-   **Persistence**: Mount a volume to `/app/data` to ensure the SQLite run history and RAG memory are preserved between restarts.
-   **Resource Allocation**: The Browser Agent (Playwright) requires significant RAM and CPU. Ensure your host has at least 2GB of free RAM.

---

## 🛠️ Troubleshooting

If something goes wrong, run the repair script:
```bash
./fix.sh
```
Common issues and fixes:
- **Port Conflicts**: Ensure ports 8004 and 5176 are free.
- **Missing Deps**: Run `uv sync` and `npm install` again.
- **LLM Errors**: Check your OpenRouter balance and API key validity.
