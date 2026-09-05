const { contextBridge, ipcRenderer } = require('electron')

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {}
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('orbit', {
  launchApp: (id) => ipcRenderer.invoke('orbit:launch-app', id),
  scanApplications: () => ipcRenderer.invoke('orbit:scan-applications'),
  getLibrary: () => ipcRenderer.invoke('orbit:get-library'),
  addApplications: (ids) => ipcRenderer.invoke('orbit:add-applications', ids),
  saveLibrary: (ids) => ipcRenderer.invoke('orbit:save-library', ids),
  removeApplication: (id) => ipcRenderer.invoke('orbit:remove-application', id),
  selectManualApplication: () => ipcRenderer.invoke('orbit:select-manual-application'),
  getSettings: () => ipcRenderer.invoke('orbit:get-settings'),
  updateSettings: (patch) => ipcRenderer.invoke('orbit:update-settings', patch),
  setGlobalShortcut: (accelerator) => ipcRenderer.invoke('orbit:set-global-shortcut', accelerator),
  getGlobalShortcutStatus: () => ipcRenderer.invoke('orbit:get-global-shortcut-status'),
  getPlatformCapabilities: () => ipcRenderer.invoke('orbit:get-platform-capabilities'),
  showLauncher: () => ipcRenderer.invoke('orbit:show-launcher'),
  hideLauncher: () => ipcRenderer.invoke('orbit:hide-launcher'),
  windowAction: (action) => ipcRenderer.invoke('orbit:window-action', action),
  openExternal: (url) => ipcRenderer.invoke('orbit:open-external', url),
  checkForUpdates: (repositoryUrl, currentVersion) => ipcRenderer.invoke('orbit:check-for-updates', repositoryUrl, currentVersion),
  onVisibilityChanged: (callback) => subscribe('orbit:visibility-changed', callback),
  onGlobalShortcutStatusChanged: (callback) => subscribe('orbit:global-shortcut-status', callback),
})
