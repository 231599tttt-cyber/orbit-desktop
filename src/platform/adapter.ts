import type {
  ApplicationIconStatus,
  ApplicationKind,
  ApplicationSource,
  LaunchResult,
  LibraryMutationResult,
  PlatformCapabilities,
  PlatformLaunchStatus,
  PlatformSettingsResult,
  ScanResult,
  ScannedApplication,
  ShortcutRegistrationStatus,
  UpdateCheckResult,
} from '../types'
import type { OrbitSettings } from '../types/settings'

export interface PlatformAdapter {
  readonly kind: 'electron' | 'browser-preview'
  scanApplications(): Promise<ScanResult>
  getLibrary(): Promise<ScannedApplication[]>
  addApplications(ids: string[]): Promise<LibraryMutationResult>
  removeApplication(id: string): Promise<LibraryMutationResult>
  selectManualApplication(): Promise<ScannedApplication | null>
  launchApplication(id: string): Promise<LaunchResult>
  getSettings(): Promise<Partial<OrbitSettings> | null>
  updateSettings(settings: Partial<OrbitSettings>): Promise<PlatformSettingsResult>
  setGlobalShortcut(accelerator: string): Promise<ShortcutRegistrationStatus>
  getGlobalShortcutStatus(): Promise<ShortcutRegistrationStatus | null>
  getCapabilities(): Promise<PlatformCapabilities | null>
  subscribeVisibility(callback: (visible: boolean) => void): () => void
  subscribeShortcutStatus(callback: (status: ShortcutRegistrationStatus) => void): () => void
  showLauncher(): Promise<boolean>
  hideLauncher(): Promise<boolean>
  windowAction(action: 'minimize' | 'maximize' | 'close' | 'hide'): Promise<boolean>
  openExternal(url: string): Promise<{ ok: boolean; code?: string }>
  checkForUpdates(repositoryUrl: string, currentVersion: string): Promise<UpdateCheckResult>
}

const applicationKinds = new Set<ApplicationKind>(['shortcut', 'executable', 'uwp'])
const applicationSources = new Set<ApplicationSource>([
  'start-menu-user',
  'start-menu-system',
  'desktop-user',
  'desktop-public',
  'registry',
  'uwp',
  'manual',
])
const launchStatuses = new Set<PlatformLaunchStatus>(['valid', 'unverified', 'invalid'])
const iconStatuses = new Set<ApplicationIconStatus>(['cached', 'extracted', 'missing'])

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function normalizeApplication(value: unknown): ScannedApplication | null {
  const raw = record(value)
  if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null
  const id = raw.id.trim()
  const name = raw.name.trim()
  if (!id || !name) return null

  const kind = applicationKinds.has(raw.kind as ApplicationKind)
    ? raw.kind as ApplicationKind
    : null
  const source = applicationSources.has(raw.source as ApplicationSource)
    ? raw.source as ApplicationSource
    : null
  if (!kind || !source) return null

  const launchStatus = launchStatuses.has(raw.launchStatus as PlatformLaunchStatus)
    ? raw.launchStatus as PlatformLaunchStatus
    : raw.launchable === true
      ? 'valid'
      : 'invalid'
  const validation = launchStatus === 'valid' ? 'verified' : launchStatus
  const iconStatus = iconStatuses.has(raw.iconStatus as ApplicationIconStatus)
    ? raw.iconStatus as ApplicationIconStatus
    : undefined
  const isAdded = raw.isAdded === true || raw.alreadyAdded === true

  return {
    id,
    name,
    category: typeof raw.category === 'string' ? raw.category : undefined,
    iconDataUrl: typeof raw.iconDataUrl === 'string' ? raw.iconDataUrl : null,
    kind,
    source,
    launchable: raw.launchable === true && launchStatus === 'valid',
    validation,
    launchStatus,
    statusReason: typeof raw.statusReason === 'string' ? raw.statusReason : undefined,
    iconStatus,
    alreadyAdded: isAdded,
    isAdded,
  }
}

function normalizeApplications(value: unknown): ScannedApplication[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  const names = new Set<string>()
  const applications: ScannedApplication[] = []
  for (const candidate of value) {
    const application = normalizeApplication(candidate)
    if (!application) continue
    const normalizedName = application.name.toLocaleLowerCase()
    if (ids.has(application.id) || names.has(normalizedName)) continue
    ids.add(application.id)
    names.add(normalizedName)
    applications.push(application)
  }
  return applications
}

function emptyMutation(code = 'desktop_api_unavailable'): LibraryMutationResult {
  return { ok: false, code, added: [], skipped: [], library: [] }
}

function normalizeMutation(value: unknown): LibraryMutationResult {
  const raw = record(value)
  if (!raw) return emptyMutation('invalid-platform-response')
  return {
    ok: raw.ok === true,
    code: typeof raw.code === 'string' ? raw.code : undefined,
    added: Array.isArray(raw.added) ? raw.added.filter((id): id is string => typeof id === 'string') : undefined,
    skipped: Array.isArray(raw.skipped) ? raw.skipped.filter((id): id is string => typeof id === 'string') : undefined,
    library: normalizeApplications(raw.library),
  }
}

function emptyScanResult(): ScanResult {
  return {
    ok: false,
    apps: [],
    scannedSources: [],
    warnings: [],
    error: 'desktop_api_unavailable',
  }
}

export function normalizeScanResult(value: unknown): ScanResult {
  if (Array.isArray(value)) {
    const apps = normalizeApplications(value)
    return {
      ok: true,
      apps,
      scannedSources: [...new Set(apps.map((application) => application.source))],
      warnings: [],
    }
  }

  const raw = record(value)
  if (!raw) return { ...emptyScanResult(), error: 'scanner-invalid-response' }
  const apps = normalizeApplications(raw.apps)
  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings.filter((warning): warning is string => typeof warning === 'string').slice(0, 20)
    : []
  const error = typeof raw.error === 'string' ? raw.error : undefined
  return {
    ok: raw.ok === true && !error,
    apps,
    scannedSources: [...new Set(apps.map((application) => application.source))],
    warnings,
    error: error || (raw.ok === true ? undefined : 'scanner-invalid-response'),
  }
}

const browserCapabilities: PlatformCapabilities = {
  platform: 'browser',
  applicationScanning: false,
  manualApplicationSelection: false,
  globalShortcuts: false,
  launchAtLogin: false,
  uwp: false,
}

class BrowserPreviewAdapter implements PlatformAdapter {
  readonly kind = 'browser-preview' as const
  async scanApplications() { return emptyScanResult() }
  async getLibrary() { return [] }
  async addApplications(_ids: string[]) { return emptyMutation() }
  async removeApplication(_id: string) { return emptyMutation() }
  async selectManualApplication() { return null }
  async launchApplication(_id: string) { return { ok: false, code: 'desktop_api_unavailable' } }
  async getSettings() { return null }
  async updateSettings(_settings: Partial<OrbitSettings>) { return { ok: false, code: 'desktop_api_unavailable' } }
  async setGlobalShortcut(accelerator: string) { return { ok: false, accelerator, code: 'desktop_api_unavailable' } }
  async getGlobalShortcutStatus() { return null }
  async getCapabilities() { return browserCapabilities }
  subscribeVisibility(callback: (visible: boolean) => void) {
    const listener = () => callback(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', listener)
    return () => document.removeEventListener('visibilitychange', listener)
  }
  subscribeShortcutStatus(_callback: (status: ShortcutRegistrationStatus) => void) { return () => {} }
  async showLauncher() { return false }
  async hideLauncher() { return false }
  async windowAction(_action: 'minimize' | 'maximize' | 'close' | 'hide') { return false }
  async openExternal(url: string) {
    try {
      const target = new URL(url)
      if (target.protocol !== 'https:' || target.hostname !== 'github.com') return { ok: false, code: 'url-not-allowed' }
      window.open(target.toString(), '_blank', 'noopener,noreferrer')
      return { ok: true }
    } catch {
      return { ok: false, code: 'invalid-url' }
    }
  }
  async checkForUpdates(_repositoryUrl: string, _currentVersion: string) {
    return { ok: false, code: 'desktop_api_unavailable' }
  }
}

class ElectronPlatformAdapter implements PlatformAdapter {
  readonly kind = 'electron' as const

  async scanApplications(): Promise<ScanResult> {
    return normalizeScanResult(await window.orbit!.scanApplications())
  }

  async getLibrary() { return normalizeApplications(await window.orbit!.getLibrary()) }
  async addApplications(ids: string[]) { return normalizeMutation(await window.orbit!.addApplications(ids)) }
  async removeApplication(id: string) { return normalizeMutation(await window.orbit!.removeApplication(id)) }
  async selectManualApplication() { return normalizeApplication(await window.orbit!.selectManualApplication()) }
  async launchApplication(id: string) { return window.orbit!.launchApp(id) }
  async getSettings() { return window.orbit!.getSettings() }
  async updateSettings(settings: Partial<OrbitSettings>) { return window.orbit!.updateSettings(settings) }
  async setGlobalShortcut(accelerator: string) { return window.orbit!.setGlobalShortcut(accelerator) }
  async getGlobalShortcutStatus() { return window.orbit!.getGlobalShortcutStatus() }
  async getCapabilities() { return window.orbit!.getPlatformCapabilities() }
  subscribeVisibility(callback: (visible: boolean) => void) {
    const unsubscribePlatform = window.orbit!.onVisibilityChanged((event) => callback(event.visible))
    const listener = () => callback(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', listener)
    return () => {
      unsubscribePlatform()
      document.removeEventListener('visibilitychange', listener)
    }
  }
  subscribeShortcutStatus(callback: (status: ShortcutRegistrationStatus) => void) {
    return window.orbit!.onGlobalShortcutStatusChanged(callback)
  }
  async showLauncher() { return window.orbit!.showLauncher() }
  async hideLauncher() { return window.orbit!.hideLauncher() }
  async windowAction(action: 'minimize' | 'maximize' | 'close' | 'hide') {
    return window.orbit!.windowAction(action)
  }
  async openExternal(url: string) { return window.orbit!.openExternal(url) }
  async checkForUpdates(repositoryUrl: string, currentVersion: string) {
    return window.orbit!.checkForUpdates(repositoryUrl, currentVersion)
  }
}

export const platform: PlatformAdapter = window.orbit
  ? new ElectronPlatformAdapter()
  : new BrowserPreviewAdapter()
