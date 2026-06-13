#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  AegisOps — Health Check & Auto-Repair                      ║
# ╚══════════════════════════════════════════════════════════════════╝
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()    { echo -e "  ${GREEN}✔${NC} $*"; }
fail()  { echo -e "  ${RED}✘${NC} $*"; ISSUES=$((ISSUES+1)); }
warn()  { echo -e "  ${YELLOW}⚠${NC}  $*"; }
info()  { echo -e "${CYAN}▶${NC}  $*"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ISSUES=0

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Vendor Outage Investigator — fix.sh                ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

ask_fix() {
  local msg="$1"; local cmd="$2"
  echo -e "  ${YELLOW}Fix available:${NC} $cmd"
  read -r -p "  Run it now? [y/N] " ans
  if [[ "$ans" =~ ^[Yy]$ ]]; then
    eval "$cmd" && echo -e "  ${GREEN}Fixed!${NC}" || echo -e "  ${RED}Fix failed — try manually.${NC}"
  fi
}

# ── 1. Python venv ─────────────────────────────────────────────────────────────
info "Checking Python virtual environment..."
if [ -f "$ROOT/.venv/bin/python" ] || [ -f "$ROOT/.venv/Scripts/python.exe" ]; then
  ok "venv found"
else
  fail "venv missing"
  ask_fix "Create venv" "cd '$ROOT' && uv sync"
fi

# ── 2. Core Python imports ─────────────────────────────────────────────────────
info "Checking core Python imports..."
PYBIN="$ROOT/.venv/bin/python"
[ -f "$ROOT/.venv/Scripts/python.exe" ] && PYBIN="$ROOT/.venv/Scripts/python.exe"

for pkg in langgraph langchain fastapi uvicorn; do
  if "$PYBIN" -c "import $pkg" 2>/dev/null; then
    ok "$pkg importable"
  else
    fail "$pkg missing"
    ask_fix "Re-sync deps" "cd '$ROOT' && uv sync"
    break
  fi
done

# ── 3. .env file ──────────────────────────────────────────────────────────────
info "Checking .env file..."
if [ ! -f "$ROOT/.env" ]; then
  fail ".env not found"
  ask_fix "Copy .env.example → .env" "cp '$ROOT/.env.example' '$ROOT/.env'"
else
  ok ".env exists"
  if grep -q 'OPENROUTER_API_KEY=sk-or-\.\.\.' "$ROOT/.env" 2>/dev/null; then
    warn "OPENROUTER_API_KEY is still the placeholder — edit .env before running"
    ISSUES=$((ISSUES+1))
  else
    ok "OPENROUTER_API_KEY set"
  fi
fi

# ── 4. Frontend node_modules ───────────────────────────────────────────────────
info "Checking frontend node_modules..."
if [ -d "$ROOT/frontend/node_modules/.bin/vite" ] || [ -f "$ROOT/frontend/node_modules/.bin/vite" ]; then
  ok "node_modules present"
else
  fail "node_modules missing"
  ask_fix "npm install" "cd '$ROOT/frontend' && npm install --legacy-peer-deps"
fi

# ── 5. Port 8004 (backend) ────────────────────────────────────────────────────
info "Checking port 8004 (backend)..."
if lsof -i :8004 -sTCP:LISTEN &>/dev/null 2>&1; then
  PID=$(lsof -t -i :8004 -sTCP:LISTEN)
  warn "Port 8004 is occupied (PID: $PID)"
  ask_fix "Kill process on 8004" "kill -9 $PID"
else
  ok "Port 8004 is free"
fi

# ── 6. Port 5176 (frontend) ───────────────────────────────────────────────────
info "Checking port 5176 (Vite dev server)..."
if lsof -i :5176 -sTCP:LISTEN &>/dev/null 2>&1; then
  PID=$(lsof -t -i :5176 -sTCP:LISTEN)
  warn "Port 5176 is occupied (PID: $PID)"
  ask_fix "Kill process on 5176" "kill -9 $PID"
else
  ok "Port 5176 is free"
fi

# ── 7. Playwright Chromium ────────────────────────────────────────────────────
info "Checking Playwright Chromium install..."
if "$PYBIN" -m playwright install --dry-run 2>/dev/null | grep -q "chromium"; then
  warn "Playwright Chromium not fully installed (browser agent will use mock fallback)"
  ask_fix "Install Chromium" "'$PYBIN' -m playwright install chromium"
else
  ok "Playwright Chromium installed"
fi

# ── 8. ChromaDB data dir ──────────────────────────────────────────────────────
info "Checking incident memory database directory..."
DB_DIR="$ROOT/incident_memory_db"
if [ -d "$DB_DIR" ] && [ -w "$DB_DIR" ]; then
  ok "incident_memory_db is writable"
else
  fail "incident_memory_db missing or not writable"
  ask_fix "Create directory" "mkdir -p '$DB_DIR'"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
if [ "$ISSUES" -eq 0 ]; then
  echo -e "${GREEN}  All checks passed. System is healthy!${NC}"
else
  echo -e "${YELLOW}  $ISSUES issue(s) found above. Fix them and re-run ./fix.sh to confirm.${NC}"
fi
echo ""
