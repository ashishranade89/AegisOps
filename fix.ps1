# ============================================================
#  AegisOps — Health Check & Auto-Repair (Windows)
#  Run in PowerShell: .\fix.ps1
# ============================================================

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Issues = 0

function ok($msg)   { Write-Host "  [OK]   $msg" -ForegroundColor Green }
function fail($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red; $script:Issues++ }
function warn($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function info($msg) { Write-Host "--> $msg" -ForegroundColor Cyan }
function ask_fix($desc, $cmd) {
  Write-Host "  Fix: $desc" -ForegroundColor Yellow
  $ans = Read-Host "  Run it now? [y/N]"
  if ($ans -match "^[Yy]$") {
    if ($cmd -is [System.Management.Automation.ScriptBlock]) { & $cmd } else { Invoke-Expression $cmd }
    Write-Host "  Fixed!" -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "=== AegisOps Health Check (Windows) ===" -ForegroundColor Cyan
Write-Host ""

# 1. uv available
info "Checking uv..."
$uvPaths = @("$env:USERPROFILE\.local\bin", "$env:USERPROFILE\.cargo\bin")
foreach ($p in $uvPaths) {
  if ((Test-Path $p) -and ($env:PATH -notlike "*$p*")) { $env:PATH = "$p;$env:PATH" }
}
if (Get-Command uv -ErrorAction SilentlyContinue) { ok "uv found: $(uv --version 2>&1)" }
else { fail "uv not found - run .\setup.ps1 to install it" }

# 2. Python venv
info "Checking Python venv..."
if (Test-Path "$Root\.venv\Scripts\python.exe") { ok "venv found" }
else { fail "venv missing"; ask_fix "Run uv sync" "Set-Location '$Root'; uv sync" }

# 3. .env file
info "Checking .env..."
if (-not (Test-Path "$Root\.env")) {
  fail ".env not found"
  ask_fix "Copy .env.example to .env" "Copy-Item '$Root\.env.example' '$Root\.env'"
} else {
  ok ".env exists"
  $envContent = Get-Content "$Root\.env" -Raw -Encoding UTF8

  # Check for placeholder API key
  if ($envContent -match "OPENROUTER_API_KEY=sk-or-\.\.\.") {
    warn "OPENROUTER_API_KEY is still the placeholder - enter your key in the UI or edit .env"
    $script:Issues++
  } else {
    ok "OPENROUTER_API_KEY is set"
  }

  # MOST COMMON 401/400 BUG: ALLOW_CLIENT_API_KEYS=false blocks the UI from sending the key
  if ($envContent -match "(?m)^ALLOW_CLIENT_API_KEYS=false") {
    fail "ALLOW_CLIENT_API_KEYS=false blocks UI from forwarding your API key (causes 401/400 errors)"
    $fixCmd = {
      $c = Get-Content "$Root\.env" -Raw -Encoding UTF8
      $c = $c -replace "(?m)^ALLOW_CLIENT_API_KEYS=false", "ALLOW_CLIENT_API_KEYS=true"
      Set-Content "$Root\.env" -Value $c -Encoding UTF8 -NoNewline
    }
    ask_fix "Set ALLOW_CLIENT_API_KEYS=true" $fixCmd
  } else {
    ok "ALLOW_CLIENT_API_KEYS is not blocking key forwarding"
  }
}

# 4. Frontend node_modules
info "Checking frontend node_modules..."
if (Test-Path "$Root\frontend\node_modules\.bin\vite") { ok "node_modules present" }
else {
  fail "node_modules missing"
  ask_fix "npm install" "Set-Location '$Root\frontend'; npm install --legacy-peer-deps"
}

# 5. Port 8004
info "Checking port 8004 (backend)..."
$conn8004 = Get-NetTCPConnection -LocalPort 8004 -State Listen -ErrorAction SilentlyContinue
if ($conn8004) {
  $pid8004 = $conn8004.OwningProcess | Select-Object -First 1
  warn "Port 8004 is occupied (PID: $pid8004)"
  ask_fix "Kill process on port 8004" "Stop-Process -Id $pid8004 -Force"
} else { ok "Port 8004 is free" }

# 6. Port 5176
info "Checking port 5176 (frontend)..."
$conn5176 = Get-NetTCPConnection -LocalPort 5176 -State Listen -ErrorAction SilentlyContinue
if ($conn5176) {
  $pid5176 = $conn5176.OwningProcess | Select-Object -First 1
  warn "Port 5176 is occupied (PID: $pid5176)"
  ask_fix "Kill process on port 5176" "Stop-Process -Id $pid5176 -Force"
} else { ok "Port 5176 is free" }

# Summary
Write-Host ""
if ($Issues -eq 0) { Write-Host "  All checks passed!" -ForegroundColor Green }
else { Write-Host "  $Issues issue(s) found - fix them and re-run .\fix.ps1" -ForegroundColor Yellow }
Write-Host ""
