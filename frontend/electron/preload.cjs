/**
 * Electron preload — contextBridge surface for any native IPC calls.
 * Currently exposes only the platform string so the UI can adapt if needed.
 */
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
})
