import type {
  OrbitSettings,
  SettingsKey,
  SettingsUpdater,
} from '../types/settings'
import {
  createDefaultSettings,
  SERVER_DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
} from './defaults'
import { loadSettings, saveSettings } from './persistence'
import { sanitizeSettings } from './validation'

type SettingsListener = () => void

const listeners = new Set<SettingsListener>()
let settingsSnapshot: OrbitSettings | undefined
let storageListenerAttached = false

function notify(): void {
  for (const listener of listeners) listener()
}

function attachStorageListener(): void {
  if (storageListenerAttached || typeof window === 'undefined') return
  storageListenerAttached = true

  window.addEventListener('storage', (event) => {
    if (event.key !== SETTINGS_STORAGE_KEY) return
    settingsSnapshot = loadSettings()
    notify()
  })
}

export function getSettings(): OrbitSettings {
  if (!settingsSnapshot) settingsSnapshot = loadSettings()
  attachStorageListener()
  return settingsSnapshot
}

export function getServerSettings(): Readonly<OrbitSettings> {
  return SERVER_DEFAULT_SETTINGS
}

export function subscribeSettings(listener: SettingsListener): () => void {
  listeners.add(listener)
  attachStorageListener()
  return () => listeners.delete(listener)
}

export function replaceSettings(candidate: unknown): OrbitSettings {
  settingsSnapshot = sanitizeSettings(candidate, createDefaultSettings())
  saveSettings(settingsSnapshot)
  notify()
  return settingsSnapshot
}

export function updateSettings(updater: SettingsUpdater): OrbitSettings {
  const current = getSettings()
  const patch = typeof updater === 'function' ? updater(current) : updater
  return replaceSettings({ ...current, ...patch })
}

export function setSetting<Key extends SettingsKey>(
  key: Key,
  value: OrbitSettings[Key],
): OrbitSettings {
  return updateSettings({ [key]: value } as Pick<OrbitSettings, Key>)
}

export function resetSettings(): OrbitSettings {
  settingsSnapshot = createDefaultSettings()
  saveSettings(settingsSnapshot)
  notify()
  return settingsSnapshot
}

/** Test helper; avoids exporting mutable state in the production API. */
export function reloadSettingsFromStorage(): OrbitSettings {
  settingsSnapshot = loadSettings()
  notify()
  return settingsSnapshot
}
