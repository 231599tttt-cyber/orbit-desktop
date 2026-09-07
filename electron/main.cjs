const {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  session,
  shell,
  Tray,
} = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const {
  scanWindowsApplications,
  applicationFromManualPath,
  revalidateUwpApplications,
  statusFor,
  validateStoredApplication,
} = require('./platform/windows/applications.cjs')
const { IconCache, UNKNOWN_ICON_DATA_URL } = require('./services/icon-cache.cjs')
const { PersistentStore } = require('./services/persistent-store.cjs')
const { createDefaultSettings, sanitizeSettings, sanitizeSettingsPatch } = require('./services/settings.cjs')
const { mainText } = require('./services/locale.cjs')
const { checkGitHubRelease, githubRepository } = require('./services/github-release.cjs')

const MAX_LIBRARY_APPLICATIONS = 32
const DEFAULT_DEVELOPMENT_URL = 'http://127.0.0.1:5173/'

let mainWindow = null
let tray = null
let isQuitting = false
let store = null
let iconCache = null
let settings = null
let shortcutStatus = { ok: false, accelerator: 'Alt+Space', code: 'not-registered' }
let activeShortcut = null

const libraryRegistry = new Map()
const candidateRegistry = new Map()

function applicationExists(filePath) {
  if (!filePath || !path.isAbsolute(filePath)) return false
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function trustedRenderer(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) return false
  try {
    const frameUrl = new URL(event.senderFrame.url)
    if (app.isPackaged) return frameUrl.protocol === 'file:'
    return frameUrl.origin === new URL(DEFAULT_DEVELOPMENT_URL).origin
  } catch {
    return false
  }
}

function internalDescriptor(application) {
  return {
    id: application.id,
    name: application.name,
    kind: application.kind,
    source: application.source,
    shortcutPath: application.shortcutPath || '',
    targetPath: application.targetPath || '',
    arguments: application.arguments || '',
    workingDirectory: application.workingDirectory || '',
    iconLocation: application.iconLocation || '',
    aumid: application.aumid || '',
    logoPath: application.logoPath || '',
    iconCachePath: application.iconCachePath || '',
    addedAt: application.addedAt || Date.now(),
  }
}

function publicDescriptor(application, isAdded = libraryRegistry.has(application.id)) {
  return {
    id: application.id,
    name: application.name,
    kind: application.kind,
    source: application.source,
    launchable: Boolean(application.launchable),
    launchStatus: application.launchStatus,
    statusReason: application.statusReason,
    iconDataUrl: application.iconDataUrl || UNKNOWN_ICON_DATA_URL,
    iconStatus: application.iconStatus || 'missing',
    isAdded,
  }
}

async function withIcons(applications, concurrency = 6) {
  const result = new Array(applications.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < applications.length) {
      const index = nextIndex++
      const application = applications[index]
      const icon = await iconCache.resolve(application)
      result[index] = { ...application, ...icon }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, applications.length || 1) }, () => worker()))
  return result
}

function persistLibrary() {
  store.writeLibrary([...libraryRegistry.values()].map(internalDescriptor))
}

async function hydrateLibrary() {
  libraryRegistry.clear()
  const rawLibrary = store.readLibrary()
  const stored = rawLibrary.map(validateStoredApplication).filter(Boolean).slice(0, MAX_LIBRARY_APPLICATIONS)
  const revalidated = await revalidateUwpApplications(stored)
  const applications = await withIcons(revalidated)
  for (const application of applications) libraryRegistry.set(application.id, application)
  if (applications.length !== rawLibrary.length) persistLibrary()
}

async function scanApplications() {
  candidateRegistry.clear()
  const result = await scanWindowsApplications()
  if (!result.ok) return { ok: false, apps: [], warnings: [], error: result.error }
  const applications = await withIcons(result.applications)
  for (const application of applications) candidateRegistry.set(application.id, application)
  return {
    ok: true,
    apps: applications.map((application) => publicDescriptor(application)),
    warnings: [],
  }
}

function normalizedIds(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((id) => typeof id === 'string' && /^app-[a-f0-9]{24}$/.test(id)))].slice(0, MAX_LIBRARY_APPLICATIONS)
}

function currentPublicLibrary() {
  return [...libraryRegistry.values()].map((application) => publicDescriptor(application, true))
}

function addApplications(ids) {
  const added = []
  const skipped = []
  for (const id of normalizedIds(ids)) {
    if (libraryRegistry.has(id)) continue
    const application = candidateRegistry.get(id)
    if (!application || application.launchStatus !== 'valid' || libraryRegistry.size >= MAX_LIBRARY_APPLICATIONS) {
      skipped.push(id)
      continue
    }
    libraryRegistry.set(id, { ...application, addedAt: Date.now() })
    added.push(id)
  }
  persistLibrary()
  return { ok: skipped.length === 0, added, skipped, library: currentPublicLibrary() }
}

function saveLibrary(ids) {
  const nextLibrary = new Map()
  const skipped = []
  for (const id of normalizedIds(ids)) {
    const application = libraryRegistry.get(id) || candidateRegistry.get(id)
    if (!application || application.launchStatus !== 'valid') {
      skipped.push(id)
      continue
    }
    nextLibrary.set(id, { ...application, addedAt: application.addedAt || Date.now() })
  }
  libraryRegistry.clear()
  for (const [id, application] of nextLibrary) libraryRegistry.set(id, application)
  persistLibrary()
  return { ok: skipped.length === 0, skipped, library: currentPublicLibrary() }
}

function removeApplication(id) {
  if (typeof id !== 'string') return { ok: false, code: 'invalid-id', library: currentPublicLibrary() }
  const removed = libraryRegistry.delete(id)
  if (removed) persistLibrary()
  return { ok: removed, code: removed ? 'removed' : 'not-found', library: currentPublicLibrary() }
}

function notifyVisibility(visible, reason) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('orbit:visibility-changed', { visible, reason })
  }
}

function showLauncher(reason = 'requested') {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  if (settings.fullscreenLauncher && !mainWindow.isFullScreen()) mainWindow.setFullScreen(true)
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  notifyVisibility(true, reason)
  return true
}

function hideLauncher(reason = 'requested') {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  mainWindow.hide()
  notifyVisibility(false, reason)
  return true
}

function toggleLauncher() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isVisible() && mainWindow.isFocused()) hideLauncher('global-shortcut')
  else showLauncher('global-shortcut')
}

function validAccelerator(accelerator) {
  if (typeof accelerator !== 'string' || accelerator.length < 3 || accelerator.length > 80) return false
  const parts = accelerator.split('+').map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2 || parts.length > 5) return false
  const modifiers = new Set(['alt', 'option', 'ctrl', 'control', 'command', 'cmd', 'commandorcontrol', 'cmdorctrl', 'shift', 'super', 'meta'])
  const key = parts.at(-1)
  const safeKey = /^(?:[a-z0-9]|f(?:[1-9]|1\d|2[0-4])|space|tab|home|end|insert|delete|pageup|pagedown|left|right|up|down)$/i
  const meaningfulModifiers = new Set(['alt', 'option', 'ctrl', 'control', 'command', 'cmd', 'commandorcontrol', 'cmdorctrl', 'super', 'meta'])
  return parts.slice(0, -1).every((part) => modifiers.has(part.toLowerCase()))
    && parts.slice(0, -1).some((part) => meaningfulModifiers.has(part.toLowerCase()))
    && safeKey.test(key)
}

function notifyShortcutStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('orbit:global-shortcut-status', shortcutStatus)
  }
}

function registerLauncherShortcut(accelerator, { persist = false } = {}) {
  if (!validAccelerator(accelerator)) {
    shortcutStatus = { ok: false, accelerator, code: 'invalid-accelerator' }
    notifyShortcutStatus()
    return shortcutStatus
  }

  const previousAccelerator = activeShortcut
  if (previousAccelerator === accelerator && globalShortcut.isRegistered(accelerator)) {
    shortcutStatus = { ok: true, accelerator, code: 'registered' }
    notifyShortcutStatus()
    return shortcutStatus
  }
  if (previousAccelerator) globalShortcut.unregister(previousAccelerator)

  let registered = false
  try {
    registered = globalShortcut.register(accelerator, toggleLauncher)
  } catch {}

  if (!registered) {
    let restored = false
    if (previousAccelerator) {
      try { restored = globalShortcut.register(previousAccelerator, toggleLauncher) } catch {}
    }
    activeShortcut = restored ? previousAccelerator : null
    shortcutStatus = { ok: false, accelerator, code: 'accelerator-unavailable', activeAccelerator: activeShortcut }
    notifyShortcutStatus()
    return shortcutStatus
  }

  activeShortcut = accelerator
  shortcutStatus = { ok: true, accelerator, code: 'registered' }
  if (persist) {
    settings.globalShortcut = accelerator
    store.writeSettings(settings)
  }
  notifyShortcutStatus()
  return shortcutStatus
}

function configureLaunchAtLogin(enabled) {
  if (!app.isPackaged && enabled) return { ok: false, code: 'unavailable-in-development' }
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: enabled, args: enabled ? ['--hidden'] : [] })
    const applied = app.getLoginItemSettings().openAtLogin === enabled
    return { ok: applied, code: applied ? 'updated' : 'operating-system-rejected' }
  } catch {
    return { ok: false, code: 'operating-system-error' }
  }
}

async function launchApplication(application) {
  if (application.kind === 'uwp') {
    const [revalidated] = await revalidateUwpApplications([application])
    if (!revalidated || revalidated.launchStatus !== 'valid') {
      if (revalidated) libraryRegistry.set(revalidated.id, revalidated)
      return {
        ok: false,
        code: revalidated?.statusReason || 'uwp-registration-check-failed',
        message: mainText(settings.language, 'launch.unverified', { name: application.name }),
      }
    }
    application = revalidated
    libraryRegistry.set(application.id, application)
  }

  const currentStatus = statusFor(application)
  if (currentStatus.launchStatus !== 'valid') {
    return { ok: false, code: currentStatus.statusReason, message: mainText(settings.language, 'launch.unverified', { name: application.name }) }
  }

  if (application.kind === 'shortcut') {
    const errorMessage = await shell.openPath(application.shortcutPath)
    if (errorMessage) return { ok: false, code: 'shortcut-launch-failed', message: mainText(settings.language, 'launch.failed', { name: application.name }) }
    return { ok: true, code: 'launched', message: mainText(settings.language, 'launch.starting', { name: application.name }) }
  }

  if (application.kind === 'uwp') {
    const errorMessage = await shell.openPath(`shell:AppsFolder\\${application.aumid}`)
    if (errorMessage) return { ok: false, code: 'uwp-launch-failed', message: mainText(settings.language, 'launch.failed', { name: application.name }) }
    return { ok: true, code: 'launched', message: mainText(settings.language, 'launch.starting', { name: application.name }) }
  }

  const executable = application.targetPath
  const args = []

  if (!applicationExists(executable)) {
    return { ok: false, code: 'executable-missing', message: mainText(settings.language, 'launch.unverified', { name: application.name }) }
  }

  return new Promise((resolve) => {
    let settled = false
    const child = spawn(executable, args, {
      cwd: application.workingDirectory && fs.existsSync(application.workingDirectory)
        ? application.workingDirectory
        : undefined,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })
    child.once('spawn', () => {
      if (settled) return
      settled = true
      child.unref()
      resolve({ ok: true, code: 'launched', message: mainText(settings.language, 'launch.starting', { name: application.name }) })
    })
    child.once('error', () => {
      if (settled) return
      settled = true
      resolve({ ok: false, code: 'process-launch-failed', message: mainText(settings.language, 'launch.failed', { name: application.name }) })
    })
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    frame: false,
    fullscreen: Boolean(settings.fullscreenLauncher),
    fullscreenable: true,
    backgroundColor: '#030611',
    title: 'Orbit Desktop',
    backgroundThrottling: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      spellcheck: false,
      backgroundThrottling: true,
    },
  })

  const allowedUrl = app.isPackaged
    ? new URL(`file://${path.join(__dirname, '..', 'dist', 'index.html').replace(/\\/g, '/')}`)
    : new URL(DEFAULT_DEVELOPMENT_URL)

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault())
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const destination = new URL(url)
      const allowed = app.isPackaged
        ? destination.protocol === 'file:' && destination.pathname === allowedUrl.pathname
        : destination.origin === allowedUrl.origin
      if (!allowed) event.preventDefault()
    } catch {
      event.preventDefault()
    }
  })
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault()
      hideLauncher('escape')
    }
  })
  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    hideLauncher('close-button')
  })
  mainWindow.on('show', () => notifyVisibility(true, 'window-show'))
  mainWindow.on('hide', () => notifyVisibility(false, 'window-hide'))
  mainWindow.on('minimize', () => notifyVisibility(false, 'window-minimize'))
  mainWindow.on('restore', () => notifyVisibility(true, 'window-restore'))
  mainWindow.webContents.once('did-finish-load', () => {
    notifyShortcutStatus()
    notifyVisibility(mainWindow.isVisible(), 'initial-state')
  })
  mainWindow.once('ready-to-show', () => {
    const startHidden = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAtLogin
    if (!startHidden) showLauncher('startup')
  })

  if (app.isPackaged) mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  else mainWindow.loadURL(DEFAULT_DEVELOPMENT_URL)
}

async function createTray() {
  let trayImage = nativeImage.createFromDataURL(UNKNOWN_ICON_DATA_URL)
  try {
    const executableIcon = await app.getFileIcon(process.execPath, { size: 'small' })
    if (!executableIcon.isEmpty()) trayImage = executableIcon
  } catch {}

  tray = new Tray(trayImage.resize({ width: 16, height: 16 }))
  tray.setToolTip('Orbit Desktop')
  tray.on('double-click', toggleLauncher)
  rebuildTrayMenu()
}

function rebuildTrayMenu() {
  if (!tray) return
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: mainText(settings.language, 'tray.show'), click: () => showLauncher('tray') },
    { label: mainText(settings.language, 'tray.hide'), click: () => hideLauncher('tray') },
    { type: 'separator' },
    {
      label: mainText(settings.language, 'tray.quit'),
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ]))
}

function registerIpcHandlers() {
  ipcMain.handle('orbit:window-action', (event, action) => {
    if (!trustedRenderer(event) || !['minimize', 'maximize', 'close', 'hide'].includes(action)) return false
    if (action === 'minimize') mainWindow.minimize()
    if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
    if (action === 'close' || action === 'hide') hideLauncher(action)
    return true
  })

  ipcMain.handle('orbit:show-launcher', (event) => trustedRenderer(event) && showLauncher('renderer'))
  ipcMain.handle('orbit:hide-launcher', (event) => trustedRenderer(event) && hideLauncher('renderer'))
  ipcMain.handle('orbit:open-external', async (event, url) => {
    if (!trustedRenderer(event)) return { ok: false, code: 'untrusted-renderer' }
    const repository = githubRepository(url)
    if (!repository) return { ok: false, code: 'url-not-allowed' }
    try {
      await shell.openExternal(repository.url)
      return { ok: true, code: 'opened' }
    } catch {
      return { ok: false, code: 'open-failed' }
    }
  })
  ipcMain.handle('orbit:check-for-updates', (event, repositoryUrl, currentVersion) => (
    trustedRenderer(event)
      ? checkGitHubRelease(repositoryUrl, currentVersion)
      : { ok: false, code: 'untrusted-renderer' }
  ))

  ipcMain.handle('orbit:scan-applications', async (event) => trustedRenderer(event)
    ? scanApplications()
    : { ok: false, apps: [], warnings: [], error: 'untrusted-renderer' })
  ipcMain.handle('orbit:get-library', async (event) => trustedRenderer(event) ? currentPublicLibrary() : [])
  ipcMain.handle('orbit:add-applications', (event, ids) => trustedRenderer(event)
    ? addApplications(ids)
    : { ok: false, added: [], skipped: [], library: [] })
  ipcMain.handle('orbit:save-library', (event, ids) => trustedRenderer(event)
    ? saveLibrary(ids)
    : { ok: false, skipped: [], library: [] })
  ipcMain.handle('orbit:remove-application', (event, id) => trustedRenderer(event)
    ? removeApplication(id)
    : { ok: false, code: 'untrusted-renderer', library: [] })

  ipcMain.handle('orbit:select-manual-application', async (event) => {
    if (!trustedRenderer(event)) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: mainText(settings.language, 'manual.chooseTitle'),
      properties: ['openFile'],
      filters: [{ name: mainText(settings.language, 'manual.windowsApplications'), extensions: ['exe', 'lnk'] }],
    })
    if (result.canceled || result.filePaths.length !== 1) return null
    const application = await applicationFromManualPath(result.filePaths[0], shell)
    if (!application) return null
    const [withIcon] = await withIcons([application], 1)
    candidateRegistry.set(withIcon.id, withIcon)
    return publicDescriptor(withIcon)
  })

  ipcMain.handle('orbit:launch-app', async (event, id) => {
    if (!trustedRenderer(event) || typeof id !== 'string') {
      return { ok: false, code: 'invalid-request', message: mainText(settings.language, 'launch.invalidRequest') }
    }
    const application = libraryRegistry.get(id)
    if (!application) return { ok: false, code: 'not-in-library', message: mainText(settings.language, 'launch.notInLibrary') }
    return launchApplication(application)
  })

  ipcMain.handle('orbit:get-settings', (event) => trustedRenderer(event) ? settings : null)
  ipcMain.handle('orbit:update-settings', (event, patch) => {
    if (!trustedRenderer(event)) return { ok: false, code: 'untrusted-renderer', settings }
    const sanitizedPatch = sanitizeSettingsPatch(patch, settings)

    if (Object.hasOwn(sanitizedPatch, 'globalShortcut') && sanitizedPatch.globalShortcut !== settings.globalShortcut) {
      const status = registerLauncherShortcut(sanitizedPatch.globalShortcut, { persist: false })
      if (!status.ok) return { ok: false, code: status.code, settings, shortcutStatus: status }
    }
    if (Object.hasOwn(sanitizedPatch, 'launchAtLogin') && sanitizedPatch.launchAtLogin !== settings.launchAtLogin) {
      const status = configureLaunchAtLogin(sanitizedPatch.launchAtLogin)
      if (!status.ok) return { ok: false, code: status.code, settings, shortcutStatus }
    }

    settings = { ...settings, ...sanitizedPatch }
    store.writeSettings(settings)
    if (Object.hasOwn(sanitizedPatch, 'language')) rebuildTrayMenu()
    return { ok: true, code: 'updated', settings, shortcutStatus }
  })

  ipcMain.handle('orbit:set-global-shortcut', (event, accelerator) => trustedRenderer(event)
    ? registerLauncherShortcut(accelerator, { persist: true })
    : { ok: false, code: 'untrusted-renderer' })
  ipcMain.handle('orbit:get-global-shortcut-status', (event) => trustedRenderer(event) ? shortcutStatus : null)
  ipcMain.handle('orbit:get-platform-capabilities', (event) => trustedRenderer(event) ? {
    platform: process.platform,
    applicationScanning: process.platform === 'win32',
    manualApplicationSelection: process.platform === 'win32',
    globalShortcuts: true,
    launchAtLogin: app.isPackaged,
    uwp: process.platform === 'win32',
  } : null)
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => showLauncher('second-instance'))
  app.whenReady().then(async () => {
    app.setAppUserModelId('com.orbitdesktop.mvp')
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    session.defaultSession.setPermissionCheckHandler(() => false)

    store = new PersistentStore(app.getPath('userData'))
    iconCache = new IconCache(store.iconDirectory)
    const defaults = createDefaultSettings(app.getLocale())
    settings = sanitizeSettings(store.readSettings(defaults), defaults)
    store.writeSettings(settings)
    await hydrateLibrary()

    registerIpcHandlers()
    createWindow()
    await createTray()
    registerLauncherShortcut(settings.globalShortcut)
  })
}

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  else showLauncher('activate')
})

app.on('before-quit', () => {
  isQuitting = true
  globalShortcut.unregisterAll()
  activeShortcut = null
})

app.on('window-all-closed', () => {})
