# ============================================================
#  AegisOps — Start Backend + Frontend (Windows)
#  Run in PowerShell: .\start.ps1
# ============================================================

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ErrorActionPreference = "Stop"

function ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function warn($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function info($msg) { Write-Host "--> $msg" -ForegroundColor Cyan }

Write-Host ""
Write-Host "=== AegisOps - Starting ===" -ForegroundColor Cyan
Write-Host ""

# Ensure uv is in PATH (may not be present after fresh install without restart)
$uvPaths = @(
  "$env:USERPROFILE\.local\bin",
  "$env:USERPROFILE\.cargo\bin"
)
foreach ($p in $uvPaths) {
  if ((Test-Path $p) -and ($env:PATH -notlike "*$p*")) {
    $env:PATH = "$p;$env:PATH"
  }
}

# Kill any processes already using our ports
foreach ($port in @(8004, 5176)) {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($conn) {
    $pid = $conn.OwningProcess | Select-Object -First 1
    warn "Port $port occupied (PID $pid) — stopping it..."
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
  }
}

# Start backend in a new window
info "Starting backend on http://127.0.0.1:8004 ..."
$backendJob = Start-Process -FilePath "powershell" `
  -ArgumentList "-NoExit", "-Command", "Set-Location '$Root'; uv run uvicorn backend.api.app:app --host 127.0.0.1 --port 8004 --reload" `
  -PassThru

# Wait for backend to be ready (up to 20 seconds)
Write-Host "   Waiting for backend" -NoNewline
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8004/health" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) { $ready = $true; break }
  } catch {}
  Write-Host "." -NoNewline
}
if ($ready) { Write-Host " [OK]" -ForegroundColor Green }
else { warn "`nBackend didn't respond yet — check the backend window for errors." }

# Start frontend
info "Starting frontend on http://localhost:5176 ..."
$frontendJob = Start-Process -FilePath "powershell" `
  -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\frontend'; npm run dev" `
  -PassThru

Write-Host ""
ok "App starting at http://localhost:5176"
Write-Host "  Two new windows opened — close them to stop the servers." -ForegroundColor Yellow
Write-Host ""
Write-Host "  If you see errors:" -ForegroundColor Cyan
Write-Host "    1. Check that ALLOW_CLIENT_API_KEYS=true is in your .env"
Write-Host "    2. Run .\setup.ps1 to auto-fix common issues"
Write-Host "    3. Enter your OpenRouter key in the UI when the app loads"
Write-Host ""
