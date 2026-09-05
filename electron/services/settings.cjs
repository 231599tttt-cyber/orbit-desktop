const SUPPORTED_LANGUAGES = new Set(['zh-CN', 'en-US'])
const THEMES = new Set(['dark', 'light', 'system'])
const BACKGROUND_EFFECTS = new Set(['off', 'subtle', 'full'])
const PERFORMANCE_MODES = new Set(['quality', 'balanced', 'performance'])
const MOTION_LEVELS = new Set(['full', 'reduced', 'off'])

function defaultLanguage(locale) {
  return String(locale || '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

function createDefaultSettings(locale) {
  return {
    language: defaultLanguage(locale),
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
    fullscreenLauncher: true,
  }
}

function finiteRange(value, minimum, maximum) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
}

function sanitizeSettings(input, defaults) {
  const value = input && typeof input === 'object' ? input : {}
  const result = { ...defaults }

  if (SUPPORTED_LANGUAGES.has(value.language)) result.language = value.language
  if (typeof value.launchAtLogin === 'boolean') result.launchAtLogin = value.launchAtLogin
  if (typeof value.autoScan === 'boolean') result.autoScan = value.autoScan
  else if (typeof value.autoScanOnStartup === 'boolean') result.autoScan = value.autoScanOnStartup
  if (THEMES.has(value.theme)) result.theme = value.theme
  if (finiteRange(value.uiScale, 0.75, 1.5)) result.uiScale = value.uiScale
  if (BACKGROUND_EFFECTS.has(value.backgroundEffects)) result.backgroundEffects = value.backgroundEffects
  else if (typeof value.backgroundEffects === 'boolean') result.backgroundEffects = value.backgroundEffects ? 'subtle' : 'off'
  if (finiteRange(value.rotationSensitivity, 0.25, 3)) result.rotationSensitivity = value.rotationSensitivity
  if (finiteRange(value.inertiaStrength, 0, 1)) result.inertiaStrength = value.inertiaStrength
  if (finiteRange(value.zoomSpeed, 0.25, 3)) result.zoomSpeed = value.zoomSpeed
  if ([30, 60, 90, 120, 144].includes(value.fpsLimit)) result.fpsLimit = value.fpsLimit
  if (PERFORMANCE_MODES.has(value.performanceMode)) result.performanceMode = value.performanceMode
  if (typeof value.particles === 'boolean') result.particles = value.particles
  if (MOTION_LEVELS.has(value.motionLevel)) result.motionLevel = value.motionLevel
  if (typeof value.globalShortcut === 'string' && value.globalShortcut.length <= 80) result.globalShortcut = value.globalShortcut
  if (typeof value.fullscreenLauncher === 'boolean') result.fullscreenLauncher = value.fullscreenLauncher

  return result
}

function sanitizeSettingsPatch(input, current) {
  const allowedKeys = new Set(Object.keys(current))
  const filtered = {}
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const [key, value] of Object.entries(input)) {
      if (allowedKeys.has(key)) filtered[key] = value
    }
  }
  const sanitized = sanitizeSettings({ ...current, ...filtered }, current)
  return Object.fromEntries(Object.keys(filtered).map((key) => [key, sanitized[key]]))
}

module.exports = {
  createDefaultSettings,
  sanitizeSettings,
  sanitizeSettingsPatch,
}
