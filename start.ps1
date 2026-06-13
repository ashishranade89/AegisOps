$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

# Repair commands used by this launcher when startup state is broken:
# - Clear stale listeners on 8004/5176 with Get-NetTCPConnection + Stop-Process
# - Remove partial frontend installs with Remove-Item -Recurse -Force frontend\node_modules
# - Rebuild frontend dependencies with npm install --legacy-peer-deps --include=dev
# - Launch Vite directly from frontend\node_modules\vite\bin\vite.js with Node.js
# - Start the backend with python -m uvicorn backend.api.app:app --port 8004 --reload

function Write-Banner {
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host "  AegisOps - Starting" -ForegroundColor Cyan
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host ""
}

function Stop-PortListener {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port
  )

  $pids = @(
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique
  )

  foreach ($listenerPid in $pids) {
    Write-Host "Stopping process on port $Port (PID $listenerPid)..." -ForegroundColor Yellow
    try {
      & taskkill /PID $listenerPid /T /F | Out-Null
    } catch {
      Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
    }
  }

  $remaining = @(
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique
  )
  foreach ($listenerPid in $remaining) {
    Write-Host "Force-clearing remaining listener on port $Port (PID $listenerPid)..." -ForegroundColor Yellow
    & taskkill /PID $listenerPid /T /F | Out-Null
  }

  Start-Sleep -Milliseconds 300
}

function Start-AppProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(Mandatory = $true)]
    [string]$ArgumentList,

    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory,

    [Parameter(Mandatory = $true)]
    [string]$StdOutLog,

    [Parameter(Mandatory = $true)]
    [string]$StdErrLog
  )

  return Start-Process -FilePath $FilePath `
    -ArgumentList $ArgumentList `
    -WorkingDirectory $WorkingDirectory `
    -RedirectStandardOutput $StdOutLog `
    -RedirectStandardError $StdErrLog `
    -PassThru
}

function Get-PythonExe {
  $venvPython = Join-Path $Root ".venv\Scripts\python.exe"
  if (Test-Path $venvPython) {
    return $venvPython
  }

  $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
  if ($pythonCmd -and $pythonCmd.Path) {
    return $pythonCmd.Path
  }

  throw "Python executable not found. Expected .venv\Scripts\python.exe or python on PATH."
}

function Get-NodeExe {
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCmd -and $nodeCmd.Path) {
    return $nodeCmd.Path
  }

  throw "Node.js executable not found. Expected node on PATH."
}

function Ensure-FrontendDeps {
  $frontendDir = Join-Path $Root "frontend"
  $nodeModules = Join-Path $frontendDir "node_modules"
  $vitePackage = Join-Path $frontendDir "node_modules\vite\package.json"
  if ((Test-Path $nodeModules) -and (Test-Path $vitePackage)) {
    return
  }

  if (Test-Path $nodeModules) {
    Write-Host "Repairing incomplete frontend dependencies..." -ForegroundColor Yellow
    Remove-Item -LiteralPath $nodeModules -Recurse -Force
  } else {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
  }

  Push-Location $frontendDir
  try {
    & npm install --legacy-peer-deps --include=dev
    if ($LASTEXITCODE -ne 0) {
      throw "npm install failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function Stop-ChildProcesses {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [System.Diagnostics.Process[]]$Processes
  )

  Write-Host ""
  Write-Host "Stopping servers..." -ForegroundColor Yellow
  foreach ($process in $Processes) {
    if ($null -ne $process) {
      try {
        if (-not $process.HasExited) {
          Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
      } catch {}
    }
  }
}

Write-Banner

Stop-PortListener -Port 8004
Stop-PortListener -Port 5176

Write-Host "Starting backend -> http://localhost:8004" -ForegroundColor Green
$backendLog = Join-Path $Root "backend.log"
$backendErr = Join-Path $Root "backend.err.log"
$pythonExe = Get-PythonExe
$backend = Start-AppProcess -FilePath $pythonExe -ArgumentList "-m uvicorn backend.api.app:app --port 8004 --reload" -WorkingDirectory $Root -StdOutLog $backendLog -StdErrLog $backendErr

Write-Host -NoNewline "Waiting for backend"
$backendReady = $false
for ($i = 1; $i -le 20; $i++) {
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:8004/health" -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
      $backendReady = $true
      break
    }
  } catch {}
  Write-Host -NoNewline "."
  Start-Sleep -Milliseconds 500
}
if ($backendReady) {
  Write-Host " done" -ForegroundColor Green
} else {
  Write-Host " not ready yet" -ForegroundColor Yellow
}

Write-Host "Starting frontend -> http://localhost:5176" -ForegroundColor Green
$frontendLog = Join-Path $Root "frontend.log"
$frontendErr = Join-Path $Root "frontend.err.log"
Ensure-FrontendDeps
$nodeExe = Get-NodeExe
$viteEntry = Join-Path $Root "frontend\node_modules\vite\bin\vite.js"
$frontend = Start-AppProcess -FilePath $nodeExe -ArgumentList "`"$viteEntry`" --port 5176 --host 127.0.0.1" -WorkingDirectory (Join-Path $Root "frontend") -StdOutLog $frontendLog -StdErrLog $frontendErr

Write-Host ""
Write-Host "App running at http://localhost:5176" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop both servers." -ForegroundColor Yellow
Write-Host ""

try {
  Wait-Process -Id @($backend.Id, $frontend.Id)
} finally {
  Stop-ChildProcesses $backend, $frontend
}
