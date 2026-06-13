# =============================================================
#  Vendor Outage Investigator — First-time Setup (Windows)
#  Run in PowerShell as a regular user (no admin required)
# =============================================================

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

function ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function warn($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function err($msg)  { Write-Host "  [ERR] $msg" -ForegroundColor Red; exit 1 }
function info($msg) { Write-Host "--> $msg" -ForegroundColor Cyan }

Write-Host ""
Write-Host "=== Vendor Outage Investigator - Windows Setup ===" -ForegroundColor Cyan
Write-Host ""

# 1. Python 3.12+
info "Checking Python..."
$pyCmd = $null
foreach ($cmd in @("python3.13","python3.12","python3","python")) {
  try {
    $ver = & $cmd --version 2>&1
    if ($ver -match "(\d+)\.(\d+)") {
      if ([int]$Matches[1] -ge 3 -and [int]$Matches[2] -ge 12) {
        $pyCmd = $cmd; break
      }
    }
  } catch {}
}
if (-not $pyCmd) { err "Python 3.12+ not found. Install from https://python.org/downloads" }
ok "Python found: $pyCmd ($(&$pyCmd --version 2>&1))"

# 2. uv
info "Checking uv..."
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  warn "uv not found - installing..."
  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
  $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
}
ok "uv found: $(uv --version 2>&1)"

# 3. Python deps
info "Installing Python dependencies..."
Set-Location $Root
uv sync --python $pyCmd
ok "Python deps installed"

# 4. Node.js 18+
info "Checking Node.js..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  err "Node.js not found. Install from https://nodejs.org/en/download"
}
$nodeVer = [int]((node --version) -replace 'v','').Split('.')[0]
if ($nodeVer -lt 18) { err "Node.js 18+ required" }
ok "Node.js found: $(node --version)"

# 5. Frontend npm deps
info "Installing frontend npm dependencies..."
Set-Location "$Root\frontend"
npm install --legacy-peer-deps --silent
ok "npm deps installed"
Set-Location $Root

# 6. Playwright
info "Installing Playwright Chromium..."
try {
  & "$Root\.venv\Scripts\python.exe" -m playwright install chromium
  ok "Playwright Chromium installed"
} catch {
  warn "Playwright install skipped (browser agent has mock fallback)"
}

# 7. .env file
info "Checking .env..."
if (-not (Test-Path "$Root\.env")) {
  Copy-Item "$Root\.env.example" "$Root\.env"
  warn ".env created from template"
  $key = Read-Host "  Enter OPENROUTER_API_KEY (press Enter to skip)"
  if ($key) {
    (Get-Content "$Root\.env") -replace 'OPENROUTER_API_KEY=sk-or-\.\.\.', "OPENROUTER_API_KEY=$key" |
      Set-Content "$Root\.env"
    ok "Key saved to .env"
  }
} else { ok ".env already exists" }

Write-Host ""
Write-Host "=== Setup complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "  Start the app (Electron):"
Write-Host "    cd frontend && npm run electron:dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Or two terminals:"
Write-Host "    Terminal 1:  uv run uvicorn backend.api.app:app --port 8004 --reload"
Write-Host "    Terminal 2:  cd frontend && npm run dev"
Write-Host "    Then open:   http://localhost:5176"
Write-Host ""
Write-Host "  Stuck? Ports busy? Run: ./fix.sh (WSL) or check processes manually."
Write-Host ""
