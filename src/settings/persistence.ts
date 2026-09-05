import type { OrbitSettings, PersistedSettings } from '../types/settings'
import {
  createDefaultSettings,
  SETTINGS_STORAGE_KEY,
  SETTINGS_STORAGE_VERSION,
} from './defaults'
import { isRecord, sanitizeSettings } from './validation'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function getBrowserStorage(): StorageLike | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function unwrapLegacySettings(value: Record<string, unknown>): Record<string, unknown> {
  const settings = isRecord(value.settings) ? value.settings : value
  const general = isRecord(settings.general) ? settings.general : {}
  const appearance = isRecord(settings.appearance) ? settings.appearance : {}
  const interaction = isRecord(settings.interaction) ? settings.interaction : {}
  const performance = isRecord(settings.performance) ? settings.performance : {}

  return {
    ...settings,
    language: settings.language ?? general.language,
    launchAtLogin: settings.launchAtLogin ?? general.launchAtLogin,
    autoScan: settings.autoScan ?? settings.scanOnStartup ?? general.autoScan ?? general.scanOnStartup,
    theme: settings.theme ?? appearance.theme,
    uiScale: settings.uiScale ?? appearance.uiScale,
    backgroundEffects:
      settings.backgroundEffects ?? settings.backgroundEffect ?? appearance.backgroundEffects ?? appearance.backgroundEffect,
    rotationSensitivity: settings.rotationSensitivity ?? interaction.rotationSensitivity,
    inertiaStrength: settings.inertiaStrength ?? interaction.inertiaStrength,
    zoomSpeed: settings.zoomSpeed ?? interaction.zoomSpeed,
    globalShortcut: settings.globalShortcut ?? interaction.globalShortcut,
    fpsLimit: settings.fpsLimit ?? performance.fpsLimit,
    performanceMode: settings.performanceMode ?? performance.performanceMode,
    particles: settings.particles ?? performance.particles,
    motionLevel: settings.motionLevel ?? performance.motionLevel,
  }
}

/**
 * Migrates raw localStorage data to the current flat renderer model. Version 0 is
 * intentionally permissive so development builds using nested sections or the old
 * scanOnStartup/backgroundEffect names keep user choices.
 */
export function migrateSettings(
  raw: unknown,
  defaults: Readonly<OrbitSettings> = createDefaultSettings(),
): OrbitSettings {
  if (!isRecord(raw)) return { ...defaults }

  const rawVersion = typeof raw.version === 'number' && Number.isInteger(raw.version)
    ? raw.version
    : 0

  if (rawVersion <= SETTINGS_STORAGE_VERSION) {
    return sanitizeSettings(unwrapLegacySettings(raw), defaults)
  }

  // Forward-compatible reads preserve only fields understood by this build.
  return sanitizeSettings(isRecord(raw.settings) ? raw.settings : raw, defaults)
}

export function loadSettings(
  storage: StorageLike | undefined = getBrowserStorage(),
  defaults: Readonly<OrbitSettings> = createDefaultSettings(),
): OrbitSettings {
  if (!storage) return { ...defaults }

  try {
    const serialized = storage.getItem(SETTINGS_STORAGE_KEY)
    if (!serialized) return { ...defaults }
    return migrateSettings(JSON.parse(serialized) as unknown, defaults)
  } catch {
    return { ...defaults }
  }
}

export function saveSettings(
  settings: Readonly<OrbitSettings>,
  storage: StorageLike | undefined = getBrowserStorage(),
): boolean {
  if (!storage) return false

  const payload: PersistedSettings = {
    version: SETTINGS_STORAGE_VERSION,
    settings: { ...settings },
  }

  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

export function clearStoredSettings(
  storage: StorageLike | undefined = getBrowserStorage(),
): boolean {
  if (!storage) return false
  try {
    storage.removeItem(SETTINGS_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}
