#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  Vendor Outage Investigator — First-time Setup Script           ║
# ║  Works on macOS and Linux / WSL                                 ║
# ╚══════════════════════════════════════════════════════════════════╝
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✔${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
err()  { echo -e "${RED}✘${NC}  $*"; }
info() { echo -e "${CYAN}→${NC}  $*"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   AegisOps — Setup                                   ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Python 3.12+ ────────────────────────────────────────────────────────────
info "Checking Python version..."
PYTHON_BIN=""
for cmd in python3.13 python3.12 python3 python; do
  if command -v "$cmd" &>/dev/null; then
    VER=$($cmd --version 2>&1 | awk '{print $2}')
    MAJOR=$(echo "$VER" | cut -d. -f1)
    MINOR=$(echo "$VER" | cut -d. -f2)
    if [ "$MAJOR" -ge 3 ] && [ "$MINOR" -ge 12 ]; then
      PYTHON_BIN="$cmd"; break
    fi
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  err "Python 3.12+ not found."
  echo "  macOS:  brew install python@3.13"
  echo "  Ubuntu: sudo apt install python3.13"
  exit 1
fi
ok "Python $($PYTHON_BIN --version 2>&1 | awk '{print $2}') found ($PYTHON_BIN)"

# ── 2. uv ──────────────────────────────────────────────────────────────────────
info "Checking uv package manager..."
if ! command -v uv &>/dev/null; then
  warn "uv not found — installing via official script..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.cargo/bin:$PATH"
fi
ok "uv $(uv --version 2>&1 | awk '{print $2}') found"

# ── 3. Python dependencies ─────────────────────────────────────────────────────
info "Installing Python dependencies (uv sync)..."
cd "$ROOT"
uv sync --python "$PYTHON_BIN"
ok "Python deps installed"

# ── 4. Node.js 18+ ────────────────────────────────────────────────────────────
info "Checking Node.js version..."
if ! command -v node &>/dev/null; then
  err "Node.js not found."
  echo "  macOS:  brew install node"
  echo "  Ubuntu: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install nodejs"
  exit 1
fi
NODE_VER=$(node --version | tr -d 'v' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  err "Node.js 18+ required (found v$(node --version))"
  exit 1
fi
ok "Node.js $(node --version) found"

# ── 5. Frontend npm dependencies ──────────────────────────────────────────────
info "Installing frontend npm dependencies..."
cd "$ROOT/frontend"
npm install --legacy-peer-deps --silent
ok "npm deps installed"
cd "$ROOT"

# ── 6. Playwright browser (for Stagehand browser scraper) ─────────────────────
info "Installing Playwright Chromium (browser scraper)..."
"$ROOT/.venv/bin/python" -m playwright install chromium 2>/dev/null || \
  warn "Playwright install skipped (non-critical — browser agent has mock fallback)"

# ── 7. .env file ──────────────────────────────────────────────────────────────
info "Checking environment configuration..."
if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo ""
  echo -e "${YELLOW}  .env file created from template.${NC}"
  echo -e "  Please enter your API key (get one free at https://openrouter.ai/keys):"
  read -r -p "  OPENROUTER_API_KEY (press Enter to skip): " OR_KEY
  if [ -n "$OR_KEY" ]; then
    sed -i.bak "s|OPENROUTER_API_KEY=sk-or-...|OPENROUTER_API_KEY=${OR_KEY}|" "$ROOT/.env"
    rm -f "$ROOT/.env.bak"
    ok "OpenRouter key saved to .env"
  else
    warn "OpenRouter key not set — you can enter it in the UI when the app starts."
  fi
else
  ok ".env already exists"
  # Migrate existing .env: if ALLOW_CLIENT_API_KEYS is explicitly false, flip it to true
  # (required for the UI key gate to work correctly)
  if grep -q "^ALLOW_CLIENT_API_KEYS=false" "$ROOT/.env" 2>/dev/null; then
    sed -i.bak "s|^ALLOW_CLIENT_API_KEYS=false|ALLOW_CLIENT_API_KEYS=true|" "$ROOT/.env"
    rm -f "$ROOT/.env.bak"
    warn "Migrated ALLOW_CLIENT_API_KEYS=false → true (required for UI key entry to work)"
  fi
fi

# ── 8. Smoke test ─────────────────────────────────────────────────────────────
info "Running quick import smoke test..."
"$ROOT/.venv/bin/python" -c "
import langgraph, langchain, fastapi
import importlib.metadata
print('  langgraph:', importlib.metadata.version('langgraph'))
print('  langchain:', langchain.__version__)
print('  fastapi:  ', fastapi.__version__)
" && ok "Core Python imports pass"

# ── 9. Port check ─────────────────────────────────────────────────────────────
info "Checking for conflicting processes on ports 8004 & 5176..."
for port in 8004 5176; do
  if lsof -i :$port -sTCP:LISTEN &>/dev/null 2>&1; then
    PID=$(lsof -t -i :$port -sTCP:LISTEN)
    warn "Port $port is occupied by PID $PID."
    read -r -p "  Kill this process to free the port? [y/N] " ans
    if [[ "$ans" =~ ^[Yy]$ ]]; then
      kill -9 "$PID" && ok "Port $port cleared" || err "Failed to kill process on $port"
    fi
  fi
done

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Setup complete! Start the app:                     ║${NC}"
echo -e "${GREEN}║                                                      ║${NC}"
echo -e "${GREEN}║   Quickest — one command:                            ║${NC}"
echo -e "${GREEN}║     ./start.sh                                       ║${NC}"
echo -e "${GREEN}║                                                      ║${NC}"
echo -e "${GREEN}║   Option A — Electron desktop:                       ║${NC}"
echo -e "${GREEN}║     cd frontend && npm run electron:dev              ║${NC}"
echo -e "${GREEN}║                                                      ║${NC}"
echo -e "${GREEN}║   Option B — Browser (two terminals):                ║${NC}"
echo -e "${GREEN}║     Terminal 1: uv run uvicorn backend.api.app:app --port 8004 --reload  ║${NC}"
echo -e "${GREEN}║     Terminal 2: cd frontend && npm run dev           ║${NC}"
echo -e "${GREEN}║     Then open: http://localhost:5176                 ║${NC}"
echo -e "${GREEN}║                                                      ║${NC}"
echo -e "${GREEN}║   Stuck? Ports busy? Run: ./fix.sh                   ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
