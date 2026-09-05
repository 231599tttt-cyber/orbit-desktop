import { resolveLanguage } from '../i18n/language'
import {
  BACKGROUND_EFFECT_LEVELS,
  FPS_LIMITS,
  MOTION_LEVELS,
  PERFORMANCE_MODES,
  THEMES,
  type OrbitSettings,
} from '../types/settings'

type UnknownRecord = Record<string, unknown>

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readEnum<const Values extends readonly (string | number)[]>(
  value: unknown,
  allowed: Values,
  fallback: Values[number],
): Values[number] {
  return allowed.includes(value as Values[number]) ? value as Values[number] : fallback
}

function readNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

const MODIFIER_KEYS = new Set([
  'alt',
  'option',
  'control',
  'ctrl',
  'command',
  'cmd',
  'commandorcontrol',
  'cmdorctrl',
  'shift',
  'super',
  'meta',
])

const NAMED_KEYS = new Set([
  'space',
  'tab',
  'enter',
  'return',
  'escape',
  'esc',
  'backspace',
  'delete',
  'insert',
  'home',
  'end',
  'pageup',
  'pagedown',
  'up',
  'down',
  'left',
  'right',
  'plus',
  'minus',
])

export function isValidGlobalShortcut(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 64) return false
  const parts = value.split('+').map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2 || new Set(parts.map((part) => part.toLowerCase())).size !== parts.length) {
    return false
  }

  const key = parts.at(-1)?.toLowerCase() ?? ''
  const modifiers = parts.slice(0, -1)
  const isFunctionKey = /^f(?:[1-9]|1\d|2[0-4])$/.test(key)
  const isSingleKey = /^[a-z0-9]$/.test(key)

  return modifiers.every((modifier) => MODIFIER_KEYS.has(modifier.toLowerCase()))
    && (NAMED_KEYS.has(key) || isFunctionKey || isSingleKey)
}

export function sanitizeSettings(
  candidate: unknown,
  defaults: Readonly<OrbitSettings>,
): OrbitSettings {
  const value = isRecord(candidate) ? candidate : {}
  const shortcut = typeof value.globalShortcut === 'string'
    ? value.globalShortcut.trim()
    : defaults.globalShortcut

  return {
    language: typeof value.language === 'string'
      ? resolveLanguage(value.language)
      : defaults.language,
    launchAtLogin: readBoolean(value.launchAtLogin, defaults.launchAtLogin),
    autoScan: readBoolean(value.autoScan, defaults.autoScan),
    theme: readEnum(value.theme, THEMES, defaults.theme),
    uiScale: readNumber(value.uiScale, defaults.uiScale, 0.75, 1.5),
    backgroundEffects: readEnum(
      value.backgroundEffects,
      BACKGROUND_EFFECT_LEVELS,
      defaults.backgroundEffects,
    ),
    rotationSensitivity: readNumber(
      value.rotationSensitivity,
      defaults.rotationSensitivity,
      0.25,
      2.5,
    ),
    inertiaStrength: readNumber(value.inertiaStrength, defaults.inertiaStrength, 0, 1),
    zoomSpeed: readNumber(value.zoomSpeed, defaults.zoomSpeed, 0.25, 2.5),
    fpsLimit: readEnum(value.fpsLimit, FPS_LIMITS, defaults.fpsLimit),
    performanceMode: readEnum(
      value.performanceMode,
      PERFORMANCE_MODES,
      defaults.performanceMode,
    ),
    particles: readBoolean(value.particles, defaults.particles),
    motionLevel: readEnum(value.motionLevel, MOTION_LEVELS, defaults.motionLevel),
    globalShortcut: isValidGlobalShortcut(shortcut) ? shortcut : defaults.globalShortcut,
  }
}
