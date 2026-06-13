/**
 * Electron main process — Vendor Outage Investigator desktop wrapper.
 * Dev mode:  npm run electron:dev   (spawns uvicorn + Vite, then opens BrowserWindow)
 * Package:   npm run electron:build (stubbed, see electron-builder config in package.json)
 */
const { app, BrowserWindow, shell } = require('electron')
const path  = require('path')
const { spawn } = require('child_process')

const isDev = !app.isPackaged

let mainWindow = null
let backendProcess = null

// ── Spawn Python backend ───────────────────────────────────────────────────────
function startBackend() {
  // Resolve the project root (two levels up from frontend/electron/)
  const projectRoot = path.join(__dirname, '..', '..')
  const python = process.platform === 'win32' ? 'python' : 'python3'
  const venvPython = process.platform === 'win32'
    ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(projectRoot, '.venv', 'bin', 'python')

  // Prefer the venv python if it exists
  const fs = require('fs')
  const interpreter = fs.existsSync(venvPython) ? venvPython : python

  backendProcess = spawn(
    interpreter,
    ['-m', 'uvicorn', 'backend.api.app:app', '--host', '127.0.0.1', '--port', '8004', '--reload'],
    {
      cwd: projectRoot,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  backendProcess.stdout.on('data', (d) => process.stdout.write(`[backend] ${d}`))
  backendProcess.stderr.on('data', (d) => process.stderr.write(`[backend] ${d}`))
  backendProcess.on('error', (err) => console.error('[backend] Failed to start:', err))
}

// ── Create the main window ─────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1400,
    height: 900,
    minWidth:  900,
    minHeight: 600,
    title: 'Vendor Outage Investigator',
    backgroundColor: '#0b1726',
    webPreferences: {
      preload:        path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  })

  // Maximize the window by default
  mainWindow.maximize()

  const url = isDev
    ? 'http://127.0.0.1:5176'
    : `file://${path.join(__dirname, '../dist/index.html')}`

  // In dev, retry until Vite is ready (wait-on handles this, but add a small delay as safety)
  if (isDev) {
    setTimeout(() => mainWindow.loadURL(url), 800)
  } else {
    mainWindow.loadURL(url)
  }

  // Open external links in the default browser, not in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url: href }) => {
    if (href.startsWith('http')) shell.openExternal(href)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (isDev) {
    // Backend is expected to already be running (started by concurrently / setup.sh)
    // If you want Electron to own the backend, uncomment:
    // startBackend()
  }
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (backendProcess) {
    backendProcess.kill('SIGTERM')
    backendProcess = null
  }
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill('SIGTERM')
  }
})
