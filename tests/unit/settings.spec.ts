import { expect, test } from '@playwright/test'
import {
  createDefaultSettings,
  SETTINGS_STORAGE_KEY,
  SETTINGS_STORAGE_VERSION,
} from '../../src/settings/defaults'
import { loadSettings, migrateSettings, saveSettings } from '../../src/settings/persistence'
import { isValidGlobalShortcut, sanitizeSettings } from '../../src/settings/validation'
import type { OrbitSettings } from '../../src/types/settings'

class MemoryStorage {
  readonly values = new Map<string, string>()

  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

test('detects Simplified Chinese and otherwise falls back to English', () => {
  expect(createDefaultSettings(['zh-CN']).language).toBe('zh-CN')
  expect(createDefaultSettings(['zh-TW']).language).toBe('zh-CN')
  expect(createDefaultSettings(['ja-JP']).language).toBe('en-US')
})

test('sanitizes unsafe settings, clamps numeric controls, and rejects invalid shortcuts', () => {
  const defaults = createDefaultSettings(['en-US'])
  const sanitized = sanitizeSettings({
    language: 'not-a-locale',
    launchAtLogin: 'yes',
    autoScan: true,
    theme: 'neon',
    uiScale: 99,
    backgroundEffects: 'expensive',
    rotationSensitivity: -12,
    inertiaStrength: Number.NaN,
    zoomSpeed: 99,
    fpsLimit: 10_000,
    performanceMode: 'turbo',
    particles: 'yes',
    motionLevel: 'maximum',
    globalShortcut: 'Space',
  }, defaults)

  expect(sanitized).toEqual({
    ...defaults,
    autoScan: true,
    uiScale: 1.5,
    rotationSensitivity: 0.25,
    zoomSpeed: 2.5,
  })
  expect(isValidGlobalShortcut('Alt+Space')).toBe(true)
  expect(isValidGlobalShortcut('Ctrl+Shift+F24')).toBe(true)
  expect(isValidGlobalShortcut('Space')).toBe(false)
  expect(isValidGlobalShortcut('Alt+Alt+Space')).toBe(false)
})

test('persists a versioned settings payload and restores all supported values', () => {
  const storage = new MemoryStorage()
  const settings: OrbitSettings = {
    ...createDefaultSettings(['en-US']),
    language: 'zh-CN',
    autoScan: true,
    theme: 'light',
    uiScale: 1.2,
    fpsLimit: 30,
    performanceMode: 'performance',
    particles: false,
    motionLevel: 'reduced',
    globalShortcut: 'Ctrl+Alt+Space',
  }

  expect(saveSettings(settings, storage)).toBe(true)
  expect(JSON.parse(storage.values.get(SETTINGS_STORAGE_KEY) ?? '{}')).toEqual({
    version: SETTINGS_STORAGE_VERSION,
    settings,
  })
  expect(loadSettings(storage, createDefaultSettings(['en-US']))).toEqual(settings)
})

test('migrates legacy nested fields and sanitizes unknown future payloads', () => {
  const defaults = createDefaultSettings(['en-US'])
  expect(migrateSettings({
    version: 0,
    settings: {
      general: { language: 'zh-CN', scanOnStartup: true },
      appearance: { backgroundEffect: 'off' },
      performance: { fpsLimit: 30 },
    },
  }, defaults)).toMatchObject({
    language: 'zh-CN',
    autoScan: true,
    backgroundEffects: 'off',
    fpsLimit: 30,
  })

  expect(migrateSettings({
    version: SETTINGS_STORAGE_VERSION + 10,
    settings: { language: 'xx-XX', uiScale: -10, injected: 'ignored' },
  }, defaults)).toEqual({ ...defaults, uiScale: 0.75 })
})
