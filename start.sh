#!/usr/bin/env bash
# Starts backend + frontend together. Ctrl+C kills both.
set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   AegisOps — Starting                                ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# Kill any leftover processes on our ports
for port in 8004 5176; do
  pid=$(lsof -t -i :"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo -e "${YELLOW}⚠${NC}  Clearing port $port (PID $pid)..."
    kill -9 "$pid" 2>/dev/null || true
  fi
done

# Start backend
echo -e "${GREEN}▶${NC}  Backend  → http://localhost:8004"
cd "$ROOT"
uv run uvicorn backend.api.app:app --port 8004 --reload > "$ROOT/backend.log" 2>&1 &
BACKEND_PID=$!

# Wait for backend to be ready
echo -n "   Waiting for backend"
for i in $(seq 1 20); do
  if curl -s http://localhost:8004/health >/dev/null 2>&1; then
    echo -e " ${GREEN}✔${NC}"
    break
  fi
  echo -n "."
  sleep 0.5
done

# Start frontend
echo -e "${GREEN}▶${NC}  Frontend → http://localhost:5176"
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "  ${GREEN}App running at http://localhost:5176${NC}"
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop both servers."
echo ""

# Trap Ctrl+C — kill both
cleanup() {
  echo ""
  echo -e "${YELLOW}Stopping servers...${NC}"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

wait
