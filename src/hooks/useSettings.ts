import { useCallback, useSyncExternalStore } from 'react'
import {
  getServerSettings,
  getSettings,
  resetSettings as resetSettingsStore,
  setSetting as setSettingStore,
  subscribeSettings,
  updateSettings as updateSettingsStore,
} from '../settings'
import type {
  OrbitSettings,
  SettingsKey,
  SettingsUpdater,
} from '../types/settings'

export interface UseSettingsResult {
  settings: OrbitSettings
  setSetting: <Key extends SettingsKey>(key: Key, value: OrbitSettings[Key]) => void
  updateSettings: (updater: SettingsUpdater) => void
  resetSettings: () => void
}

export function useSettings(): UseSettingsResult {
  const settings = useSyncExternalStore(
    subscribeSettings,
    getSettings,
    getServerSettings,
  )

  const setSetting = useCallback(<Key extends SettingsKey>(
    key: Key,
    value: OrbitSettings[Key],
  ) => {
    setSettingStore(key, value)
  }, [])

  const updateSettings = useCallback((updater: SettingsUpdater) => {
    updateSettingsStore(updater)
  }, [])

  const resetSettings = useCallback(() => {
    resetSettingsStore()
  }, [])

  return { settings, setSetting, updateSettings, resetSettings }
}
