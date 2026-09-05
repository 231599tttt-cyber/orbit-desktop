export const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US'] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const THEMES = ['system', 'dark', 'light'] as const
export type Theme = (typeof THEMES)[number]

export const BACKGROUND_EFFECT_LEVELS = ['off', 'subtle', 'full'] as const
export type BackgroundEffects = (typeof BACKGROUND_EFFECT_LEVELS)[number]

export const PERFORMANCE_MODES = ['quality', 'balanced', 'performance'] as const
export type PerformanceMode = (typeof PERFORMANCE_MODES)[number]

export const MOTION_LEVELS = ['off', 'reduced', 'full'] as const
export type MotionLevel = (typeof MOTION_LEVELS)[number]

export const FPS_LIMITS = [30, 60, 90, 120, 144] as const
export type FpsLimit = (typeof FPS_LIMITS)[number]

/**
 * Renderer-owned settings. Platform-specific side effects (for example registering
 * a global shortcut) are deliberately handled by the platform adapter, not here.
 */
export interface OrbitSettings {
  language: SupportedLanguage
  launchAtLogin: boolean
  autoScan: boolean
  theme: Theme
  uiScale: number
  backgroundEffects: BackgroundEffects
  rotationSensitivity: number
  inertiaStrength: number
  zoomSpeed: number
  fpsLimit: FpsLimit
  performanceMode: PerformanceMode
  particles: boolean
  motionLevel: MotionLevel
  globalShortcut: string
}

export type SettingsKey = keyof OrbitSettings

export type SettingsPatch = Partial<OrbitSettings>

export type SettingsUpdater =
  | SettingsPatch
  | ((current: Readonly<OrbitSettings>) => SettingsPatch | OrbitSettings)

export interface PersistedSettings {
  version: number
  settings: OrbitSettings
}
