import type { IconType } from 'react-icons'
import type { OrbitSettings } from './types/settings'

export type ApplicationKind = 'shortcut' | 'executable' | 'uwp' | 'developer-demo'

export type ApplicationSource =
  | 'start-menu-user'
  | 'start-menu-system'
  | 'desktop-user'
  | 'desktop-public'
  | 'registry'
  | 'uwp'
  | 'manual'
  | 'developer-demo'

export type LaunchValidation = 'verified' | 'unverified' | 'invalid'
export type PlatformLaunchStatus = 'valid' | 'unverified' | 'invalid'
export type ApplicationIconStatus = 'cached' | 'extracted' | 'missing'

/** Safe renderer-facing data. Launch commands and paths stay in Electron main. */
export type ScannedApplication = {
  id: string
  name: string
  category?: string
  iconDataUrl?: string | null
  kind: ApplicationKind
  source: ApplicationSource
  launchable: boolean
  validation: LaunchValidation
  launchStatus: PlatformLaunchStatus
  statusReason?: string
  iconStatus?: ApplicationIconStatus
  alreadyAdded: boolean
  isAdded: boolean
}

export type OrbitApp = {
  id: string
  name: string
  category: string
  color: string
  iconDataUrl?: string | null
  icon?: IconType
  isSystemApp?: boolean
  launchId?: string
  kind?: ApplicationKind
  source?: ApplicationSource
  launchable?: boolean
  validation?: LaunchValidation
  launchStatus?: PlatformLaunchStatus
  statusReason?: string
  iconStatus?: ApplicationIconStatus
  alreadyAdded?: boolean
  isAdded?: boolean
  addedAt?: string
}

export type ScanResult = {
  ok: boolean
  apps: ScannedApplication[]
  scannedSources: ApplicationSource[]
  warnings: string[]
  error?: string
}

export type LaunchResult = {
  ok: boolean
  code?: string
  message?: string
}

export type LibraryMutationResult = {
  ok: boolean
  code?: string
  added?: string[]
  skipped?: string[]
  library: ScannedApplication[]
}

export type ShortcutRegistrationStatus = {
  ok: boolean
  accelerator?: string
  activeAccelerator?: string | null
  code?: string
}

export type PlatformSettingsResult = {
  ok: boolean
  code?: string
  settings?: Partial<OrbitSettings>
  shortcutStatus?: ShortcutRegistrationStatus
}

export type UpdateCheckResult = {
  ok: boolean
  code?: string
  updateAvailable?: boolean
  version?: string
  url?: string
}

export type PlatformCapabilities = {
  platform: string
  applicationScanning: boolean
  manualApplicationSelection: boolean
  globalShortcuts: boolean
  launchAtLogin: boolean
  uwp: boolean
}

export type LauncherVisibilityEvent = {
  visible: boolean
  reason?: string
}

declare global {
  interface Window {
    orbit?: {
      launchApp: (id: string) => Promise<LaunchResult>
      scanApplications: () => Promise<unknown>
      getLibrary: () => Promise<unknown[]>
      addApplications: (ids: string[]) => Promise<unknown>
      saveLibrary: (ids: string[]) => Promise<unknown>
      removeApplication: (id: string) => Promise<unknown>
      selectManualApplication: () => Promise<unknown | null>
      getSettings: () => Promise<Partial<OrbitSettings> | null>
      updateSettings: (patch: Partial<OrbitSettings>) => Promise<PlatformSettingsResult>
      setGlobalShortcut: (accelerator: string) => Promise<ShortcutRegistrationStatus>
      getGlobalShortcutStatus: () => Promise<ShortcutRegistrationStatus | null>
      getPlatformCapabilities: () => Promise<PlatformCapabilities | null>
      showLauncher: () => Promise<boolean>
      hideLauncher: () => Promise<boolean>
      windowAction: (action: 'minimize' | 'maximize' | 'close' | 'hide') => Promise<boolean>
      openExternal: (url: string) => Promise<{ ok: boolean; code?: string }>
      checkForUpdates: (repositoryUrl: string, currentVersion: string) => Promise<UpdateCheckResult>
      onVisibilityChanged: (callback: (event: LauncherVisibilityEvent) => void) => () => void
      onGlobalShortcutStatusChanged: (callback: (status: ShortcutRegistrationStatus) => void) => () => void
    }
  }
}
