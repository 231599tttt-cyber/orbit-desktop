import { useEffect, useId, useRef, useState } from 'react'
import {
  FiActivity,
  FiBox,
  FiCheck,
  FiGithub,
  FiGlobe,
  FiInfo,
  FiCommand,
  FiMonitor,
  FiRefreshCw,
  FiSliders,
  FiX,
} from 'react-icons/fi'
import type { IconType } from 'react-icons'
import type { TranslationFunction } from '../i18n'
import { FPS_LIMITS } from '../types/settings'
import type { OrbitSettings, SupportedLanguage } from '../types/settings'

export type SettingsSection = 'general' | 'appearance' | 'interaction' | 'performance' | 'about'
export type ShortcutStatus = 'idle' | 'checking' | 'available' | 'conflict'

type LanguageOption = {
  label: string
  value: string
}

type SettingsPanelProps = {
  about: {
    githubUrl: string
    license: string
    productName: string
    version: string
  }
  capabilities?: {
    globalShortcut?: boolean
    launchAtLogin?: boolean
    updateCheck?: boolean
  }
  isOpen: boolean
  languageOptions?: readonly LanguageOption[]
  onCheckForUpdates: () => Promise<UpdateCheckFeedback> | UpdateCheckFeedback
  onClose: () => void
  onOpenGitHub: () => Promise<void> | void
  onUpdate: (patch: Partial<OrbitSettings>) => void
  settings: OrbitSettings
  shortcutStatus?: ShortcutStatus
  t: TranslationFunction
}

export type UpdateCheckFeedback = {
  status: 'up-to-date' | 'available' | 'failed'
  version?: string
}

const sections: ReadonlyArray<{ id: SettingsSection; icon: IconType }> = [
  { id: 'general', icon: FiGlobe },
  { id: 'appearance', icon: FiMonitor },
  { id: 'interaction', icon: FiSliders },
  { id: 'performance', icon: FiActivity },
  { id: 'about', icon: FiInfo },
]

const modifierKeys = new Set(['Alt', 'Control', 'Meta', 'Shift'])

function formatShortcut(event: React.KeyboardEvent<HTMLInputElement>) {
  if (modifierKeys.has(event.key)) return null
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Meta')

  let key = event.key
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()
  parts.push(key)
  return parts.join('+')
}

export function SettingsPanel({
  about,
  capabilities,
  isOpen,
  languageOptions,
  onCheckForUpdates,
  onClose,
  onOpenGitHub,
  onUpdate,
  settings,
  shortcutStatus = 'idle',
  t,
}: SettingsPanelProps) {
  const headingId = useId()
  const panelId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const capturingShortcutRef = useRef(false)
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')
  const [capturingShortcut, setCapturingShortcut] = useState(false)
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [updateFeedback, setUpdateFeedback] = useState<UpdateCheckFeedback | null>(null)

  useEffect(() => {
    capturingShortcutRef.current = capturingShortcut
  }, [capturingShortcut])

  const resolvedLanguageOptions = languageOptions ?? [
    { value: 'zh-CN', label: t('settings.language.zhCN') },
    { value: 'en-US', label: t('settings.language.enUS') },
  ]

  useEffect(() => {
    if (!isOpen) return
    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus())

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !capturingShortcutRef.current) {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown, true)
      previouslyFocused.current?.focus()
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const setNumber = (key: keyof OrbitSettings, value: string) => onUpdate({ [key]: Number(value) })

  const runUpdateCheck = async () => {
    setCheckingUpdates(true)
    setUpdateFeedback(null)
    try {
      setUpdateFeedback(await onCheckForUpdates())
    } catch {
      setUpdateFeedback({ status: 'failed' })
    } finally {
      setCheckingUpdates(false)
    }
  }

  const renderGeneral = () => (
    <div className="settings-fields">
      <label className="settings-field">
        <span><strong>{t('settings.language')}</strong><small>{t('settings.languageDescription')}</small></span>
        <select data-testid="language-select" value={settings.language} onChange={(event) => onUpdate({ language: event.target.value as SupportedLanguage })}>
          {resolvedLanguageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className={`settings-field settings-toggle ${capabilities?.launchAtLogin === false ? 'is-disabled' : ''}`}>
        <span><strong>{t('settings.launchAtLogin')}</strong><small>{t('settings.launchAtLoginDescription')}</small></span>
        <input
          checked={settings.launchAtLogin}
          disabled={capabilities?.launchAtLogin === false}
          onChange={(event) => onUpdate({ launchAtLogin: event.target.checked })}
          type="checkbox"
        />
        <i aria-hidden="true"><FiCheck /></i>
      </label>
      <label className="settings-field settings-toggle">
        <span><strong>{t('settings.autoScan')}</strong><small>{t('settings.autoScanDescription')}</small></span>
        <input checked={settings.autoScan} onChange={(event) => onUpdate({ autoScan: event.target.checked })} type="checkbox" />
        <i aria-hidden="true"><FiCheck /></i>
      </label>
      <div className={`settings-field settings-shortcut ${capabilities?.globalShortcut === false ? 'is-disabled' : ''}`}>
        <span><strong>{t('settings.globalShortcut')}</strong><small>{t('settings.globalShortcutDescription')}</small></span>
        <div>
          <FiCommand aria-hidden="true" />
          <input
            aria-invalid={shortcutStatus === 'conflict'}
            aria-label={t('settings.globalShortcut')}
            disabled={capabilities?.globalShortcut === false}
            onBlur={() => setCapturingShortcut(false)}
            onFocus={() => setCapturingShortcut(true)}
            onKeyDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if ((event.key === 'Backspace' || event.key === 'Delete') && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
                onUpdate({ globalShortcut: '' })
                return
              }
              if (event.key === 'Escape') {
                event.currentTarget.blur()
                return
              }
              const shortcut = formatShortcut(event)
              if (shortcut) {
                onUpdate({ globalShortcut: shortcut })
                event.currentTarget.blur()
              }
            }}
            placeholder={t('settings.globalShortcut')}
            readOnly
            value={capturingShortcut ? t('settings.globalShortcutRecording') : settings.globalShortcut}
          />
        </div>
        {shortcutStatus !== 'idle' ? (
          <small className={`settings-shortcut__status is-${shortcutStatus}`} aria-live="polite">
            {shortcutStatus === 'checking' ? <FiRefreshCw aria-hidden="true" className="is-spinning" /> : shortcutStatus === 'available' ? <FiCheck aria-hidden="true" /> : <FiX aria-hidden="true" />}
            {shortcutStatus === 'checking'
              ? t('common.loading')
              : shortcutStatus === 'available'
                ? t('settings.globalShortcutRegistered', { shortcut: settings.globalShortcut })
                : t('settings.globalShortcutConflict', { shortcut: settings.globalShortcut })}
          </small>
        ) : null}
      </div>
    </div>
  )

  const renderAppearance = () => (
    <div className="settings-fields">
      <label className="settings-field">
        <span><strong>{t('settings.theme')}</strong><small>{t('settings.themeDescription')}</small></span>
        <select value={settings.theme} onChange={(event) => onUpdate({ theme: event.target.value as OrbitSettings['theme'] })}>
          {(['system', 'dark', 'light'] as const).map((value) => <option key={value} value={value}>{t(`settings.theme.${value}`)}</option>)}
        </select>
      </label>
      <label className="settings-field settings-range">
        <span><strong>{t('settings.uiScale')}</strong><small>{t('settings.uiScaleDescription')}</small></span>
        <span><input min="0.8" max="1.3" step="0.05" type="range" value={settings.uiScale} onChange={(event) => setNumber('uiScale', event.target.value)} /><output>{Math.round(settings.uiScale * 100)}%</output></span>
      </label>
      <label className="settings-field">
        <span><strong>{t('settings.backgroundEffects')}</strong><small>{t('settings.backgroundEffectsDescription')}</small></span>
        <select value={settings.backgroundEffects} onChange={(event) => onUpdate({ backgroundEffects: event.target.value as OrbitSettings['backgroundEffects'] })}>
          {(['off', 'subtle', 'full'] as const).map((value) => <option key={value} value={value}>{t(`settings.backgroundEffects.${value}`)}</option>)}
        </select>
      </label>
    </div>
  )

  const renderInteraction = () => (
    <div className="settings-fields">
      {([
        ['rotationSensitivity', 0.25, 2, 0.05],
        ['inertiaStrength', 0, 1, 0.05],
        ['zoomSpeed', 0.25, 2, 0.05],
      ] as const).map(([key, min, max, step]) => (
        <label className="settings-field settings-range" key={key}>
          <span>
            <strong>{key === 'rotationSensitivity' ? t('settings.rotationSensitivity') : key === 'inertiaStrength' ? t('settings.inertiaStrength') : t('settings.zoomSpeed')}</strong>
            <small>{key === 'rotationSensitivity' ? t('settings.rotationSensitivityDescription') : key === 'inertiaStrength' ? t('settings.inertiaStrengthDescription') : t('settings.zoomSpeedDescription')}</small>
          </span>
          <span>
            <input min={min} max={max} step={step} type="range" value={settings[key]} onChange={(event) => setNumber(key, event.target.value)} />
            <output>{settings[key].toFixed(2)}</output>
          </span>
        </label>
      ))}
    </div>
  )

  const renderPerformance = () => (
    <div className="settings-fields">
      <label className="settings-field">
        <span><strong>{t('settings.fpsLimit')}</strong><small>{t('settings.fpsLimitDescription')}</small></span>
        <select value={settings.fpsLimit} onChange={(event) => onUpdate({ fpsLimit: Number(event.target.value) as OrbitSettings['fpsLimit'] })}>
          {FPS_LIMITS.map((value) => <option key={value} value={value}>{t('settings.fpsLimitValue', { count: value })}</option>)}
        </select>
      </label>
      <label className="settings-field">
        <span><strong>{t('settings.performanceMode')}</strong><small>{t('settings.performanceModeDescription')}</small></span>
        <select value={settings.performanceMode} onChange={(event) => onUpdate({ performanceMode: event.target.value as OrbitSettings['performanceMode'] })}>
          {(['quality', 'balanced', 'performance'] as const).map((value) => <option key={value} value={value}>{t(`settings.performanceMode.${value}`)}</option>)}
        </select>
      </label>
      <label className="settings-field settings-toggle">
        <span><strong>{t('settings.particles')}</strong><small>{t('settings.particlesDescription')}</small></span>
        <input checked={settings.particles} onChange={(event) => onUpdate({ particles: event.target.checked })} type="checkbox" />
        <i aria-hidden="true"><FiCheck /></i>
      </label>
      <label className="settings-field">
        <span><strong>{t('settings.motionLevel')}</strong><small>{t('settings.motionLevelDescription')}</small></span>
        <select value={settings.motionLevel} onChange={(event) => onUpdate({ motionLevel: event.target.value as OrbitSettings['motionLevel'] })}>
          {(['off', 'reduced', 'full'] as const).map((value) => <option key={value} value={value}>{t(`settings.motionLevel.${value}`)}</option>)}
        </select>
      </label>
    </div>
  )

  const renderAbout = () => (
    <div className="settings-about">
      <div className="settings-about__identity">
        <span><FiBox aria-hidden="true" /></span>
        <div><strong>{about.productName}</strong><small>{t('about.version', { version: about.version })}</small></div>
      </div>
      <dl>
        <div><dt>{t('about.github')}</dt><dd>{about.githubUrl}</dd></div>
        <div><dt>{t('about.license')}</dt><dd>{about.license}</dd></div>
      </dl>
      <div className="settings-about__actions">
        <button onClick={() => void onOpenGitHub()} type="button"><FiGithub aria-hidden="true" />{t('about.github')}</button>
        <button
          disabled={checkingUpdates || capabilities?.updateCheck === false}
          onClick={() => void runUpdateCheck()}
          type="button"
        >
          <FiRefreshCw aria-hidden="true" className={checkingUpdates ? 'is-spinning' : undefined} />
          {checkingUpdates ? t('about.checkingUpdates') : t('about.checkUpdates')}
        </button>
      </div>
      {updateFeedback ? (
        <p className={`settings-update-status is-${updateFeedback.status}`} aria-live="polite">
          {updateFeedback.status === 'available'
            ? t('about.updateAvailable', { version: updateFeedback.version || '' })
            : updateFeedback.status === 'up-to-date'
              ? t('about.upToDate')
              : t('about.updateFailed')}
        </p>
      ) : null}
    </div>
  )

  const sectionContent: Record<SettingsSection, () => React.JSX.Element> = {
    general: renderGeneral,
    appearance: renderAppearance,
    interaction: renderInteraction,
    performance: renderPerformance,
    about: renderAbout,
  }

  return (
    <div className="orbit-drawer-backdrop" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose()
    }}>
      <aside
        aria-labelledby={headingId}
        aria-modal="true"
        className="orbit-drawer settings-panel"
        data-testid="settings-panel"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="orbit-drawer__header">
          <div>
            <span className="orbit-drawer__eyebrow">{t('nav.settings')}</span>
            <h2 id={headingId}>{t('settings.title')}</h2>
          </div>
          <button className="orbit-drawer__close" onClick={onClose} type="button" aria-label={t('common.close')}><FiX aria-hidden="true" /></button>
        </header>

        <div className="settings-panel__layout">
          <nav aria-label={t('settings.title')} className="settings-nav">
            {sections.map(({ id, icon: Icon }) => (
              <button
                aria-controls={panelId}
                aria-current={activeSection === id ? 'page' : undefined}
                className={activeSection === id ? 'is-active' : undefined}
                key={id}
                onClick={() => setActiveSection(id)}
                type="button"
              >
                <Icon aria-hidden="true" />
                {id === 'general' ? t('settings.general') : id === 'appearance' ? t('settings.appearance') : id === 'interaction' ? t('settings.interaction') : id === 'performance' ? t('settings.performance') : t('settings.about')}
              </button>
            ))}
          </nav>
          <section aria-labelledby={`${panelId}-${activeSection}`} className="settings-panel__content" id={panelId}>
            <h3 id={`${panelId}-${activeSection}`}>{activeSection === 'general' ? t('settings.general') : activeSection === 'appearance' ? t('settings.appearance') : activeSection === 'interaction' ? t('settings.interaction') : activeSection === 'performance' ? t('settings.performance') : t('settings.about')}</h3>
            {sectionContent[activeSection]()}
          </section>
        </div>
      </aside>
    </div>
  )
}
