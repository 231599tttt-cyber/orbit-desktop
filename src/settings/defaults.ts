import { detectSystemLanguage } from '../i18n/language'
import type { OrbitSettings } from '../types/settings'

export const SETTINGS_STORAGE_VERSION = 1
export const SETTINGS_STORAGE_KEY = 'orbit-desktop.settings'

const BASE_DEFAULT_SETTINGS: Omit<OrbitSettings, 'language'> = {
  launchAtLogin: false,
  autoScan: false,
  theme: 'dark',
  uiScale: 1,
  backgroundEffects: 'subtle',
  rotationSensitivity: 1,
  inertiaStrength: 0.88,
  zoomSpeed: 1,
  fpsLimit: 60,
  performanceMode: 'balanced',
  particles: true,
  motionLevel: 'full',
  globalShortcut: 'Alt+Space',
}

export function createDefaultSettings(
  preferredLanguages?: readonly string[],
): OrbitSettings {
  return {
    language: detectSystemLanguage(preferredLanguages),
    ...BASE_DEFAULT_SETTINGS,
  }
}

/** English is deterministic and safe for SSR/tests where navigator is unavailable. */
export const SERVER_DEFAULT_SETTINGS: Readonly<OrbitSettings> = Object.freeze({
  language: 'en-US',
  ...BASE_DEFAULT_SETTINGS,
})
