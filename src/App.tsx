import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FiBox, FiMove, FiMousePointer, FiRotateCcw } from 'react-icons/fi'
import { ApplicationManager } from './components/ApplicationManager'
import { ApplicationPicker } from './components/ApplicationPicker'
import { DetailPanel } from './components/DetailPanel'
import { OrbitScene } from './components/OrbitScene'
import { SearchBar } from './components/SearchBar'
import { SettingsPanel, type ShortcutStatus } from './components/SettingsPanel'
import { Sidebar } from './components/Sidebar'
import { Titlebar } from './components/Titlebar'
import {
  limitOrbitApplications,
  MAX_ORBIT_APPLICATIONS,
  toOrbitApplication,
} from './core/applications'
import { useSettings } from './hooks/useSettings'
import { useI18n, type InterpolationValue, type TranslationKey } from './i18n'
import { platform } from './platform/adapter'
import { replaceSettings } from './settings'
import type {
  OrbitApp,
  PlatformCapabilities,
  ScannedApplication,
  ShortcutRegistrationStatus,
} from './types'
import type { OrbitSettings } from './types/settings'

const REPOSITORY_URL = (import.meta.env.VITE_ORBIT_REPOSITORY_URL || '').trim()
const ORBIT_VERSION = '0.1.0'

type StatusMessage = {
  key: TranslationKey
  params?: Record<string, InterpolationValue>
}

const browserCapabilities: PlatformCapabilities = {
  platform: 'browser',
  applicationScanning: false,
  manualApplicationSelection: false,
  globalShortcuts: false,
  launchAtLogin: false,
  uwp: false,
}

function translateStatus(
  t: ReturnType<typeof useI18n>['t'],
  status: StatusMessage,
): string {
  return (t as (key: TranslationKey, params?: Record<string, InterpolationValue>) => string)(
    status.key,
    status.params,
  )
}

function shortcutUiStatus(status: ShortcutRegistrationStatus | null): ShortcutStatus {
  if (!status) return 'idle'
  return status.ok ? 'available' : 'conflict'
}

function scanFailureStatus(error?: string): StatusMessage {
  if (error === 'scanner-timeout') return { key: 'status.scanFailedTimeout' }
  if (error === 'powershell-unavailable') return { key: 'status.scanFailedPowerShell' }
  if (error === 'scanner-script-missing') return { key: 'status.scanFailedMissingComponent' }
  return { key: 'status.scanFailed' }
}

function libraryToOrbit(applications: ScannedApplication[]): OrbitApp[] {
  return limitOrbitApplications(applications).map(toOrbitApplication)
}

function markAdded(
  applications: ScannedApplication[],
  library: readonly OrbitApp[],
): ScannedApplication[] {
  const libraryIds = new Set(library.map((application) => application.id))
  return applications.map((application) => {
    const isAdded = libraryIds.has(application.id)
    return { ...application, alreadyAdded: isAdded, isAdded }
  })
}

function App() {
  const { settings, updateSettings } = useSettings()
  const { t } = useI18n()
  const [apps, setApps] = useState<OrbitApp[]>([])
  const [candidates, setCandidates] = useState<ScannedApplication[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusMessage>({ key: 'status.ready' })
  const [scanning, setScanning] = useState(false)
  const [adding, setAdding] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [launcherActive, setLauncherActive] = useState(document.visibilityState === 'visible')
  const [capabilities, setCapabilities] = useState<PlatformCapabilities>(browserCapabilities)
  const [shortcutStatus, setShortcutStatus] = useState<ShortcutStatus>('idle')
  const [resetSignal, setResetSignal] = useState(0)
  const launchAfterFocus = useRef<string | null>(null)
  const mounted = useRef(true)

  const selected = useMemo(
    () => apps.find((application) => application.id === selectedId),
    [apps, selectedId],
  )
  const panelOpen = pickerOpen || managerOpen || settingsOpen
  const statusText = translateStatus(t, status)

  const applyLibrary = useCallback((library: ScannedApplication[]) => {
    const next = libraryToOrbit(library)
    setApps(next)
    setSelectedId((current) => (
      current && next.some((application) => application.id === current)
        ? current
        : next[0]?.id ?? ''
    ))
    setCandidates((current) => markAdded(current, next))
    return next
  }, [])

  const runScan = useCallback(async (openPicker = true) => {
    if (!capabilities.applicationScanning && platform.kind !== 'electron') {
      setStatus({ key: 'status.scanUnavailable' })
      return [] as ScannedApplication[]
    }

    setScanning(true)
    setStatus({ key: 'status.scanStarted' })
    if (openPicker) {
      setManagerOpen(false)
      setSettingsOpen(false)
    }

    try {
      const result = await platform.scanApplications()
      if (!mounted.current) return []
      if (!result.ok) {
        setCandidates([])
        if (openPicker) setPickerOpen(false)
        setStatus(scanFailureStatus(result.error))
        return []
      }
      const discovered = markAdded(result.apps, apps)
      setCandidates(discovered)
      if (openPicker) setPickerOpen(true)
      setStatus(discovered.length
        ? { key: 'status.scanComplete', params: { count: discovered.length } }
        : { key: 'status.scanEmpty' })
      return discovered
    } catch {
      if (mounted.current) {
        if (openPicker) setPickerOpen(true)
        setStatus({ key: 'status.scanFailed' })
      }
      return []
    } finally {
      if (mounted.current) setScanning(false)
    }
  }, [apps, capabilities.applicationScanning])

  useEffect(() => {
    mounted.current = true
    let cancelled = false

    const initialize = async () => {
      const [library, platformSettings, detectedCapabilities, registeredShortcut] = await Promise.all([
        platform.getLibrary().catch(() => []),
        platform.getSettings().catch(() => null),
        platform.getCapabilities().catch(() => browserCapabilities),
        platform.getGlobalShortcutStatus().catch(() => null),
      ])
      if (cancelled) return

      const resolvedSettings = platformSettings ? replaceSettings(platformSettings) : settings
      const resolvedLibrary = applyLibrary(library)
      setCapabilities(detectedCapabilities ?? browserCapabilities)
      setShortcutStatus(shortcutUiStatus(registeredShortcut))

      if (resolvedSettings.autoScan && platform.kind === 'electron') {
        setScanning(true)
        try {
          const result = await platform.scanApplications()
          if (!cancelled) {
            if (!result.ok) {
              setCandidates([])
              setStatus(scanFailureStatus(result.error))
              return
            }
            const discovered = markAdded(result.apps, resolvedLibrary)
            setCandidates(discovered)
            setStatus(discovered.length
              ? { key: 'status.scanComplete', params: { count: discovered.length } }
              : { key: 'status.scanEmpty' })
          }
        } catch {
          if (!cancelled) setStatus({ key: 'status.scanFailed' })
        } finally {
          if (!cancelled) setScanning(false)
        }
      }
    }

    void initialize()
    return () => {
      cancelled = true
      mounted.current = false
    }
    // Initialization deliberately runs once; later settings and library changes
    // flow through their dedicated actions and subscriptions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => platform.subscribeVisibility(setLauncherActive), [])
  useEffect(() => platform.subscribeShortcutStatus((next) => {
    setShortcutStatus(shortcutUiStatus(next))
  }), [])

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const applyAppearance = () => {
      root.lang = settings.language
      root.dataset.theme = settings.theme === 'system'
        ? media.matches ? 'light' : 'dark'
        : settings.theme
      root.dataset.motion = settings.motionLevel
      root.style.setProperty('--orbit-ui-scale', String(settings.uiScale))
      root.style.setProperty('--orbit-ui-scale-inverse', String(1 / settings.uiScale))
    }
    applyAppearance()
    media.addEventListener('change', applyAppearance)
    return () => media.removeEventListener('change', applyAppearance)
  }, [settings.language, settings.motionLevel, settings.theme, settings.uiScale])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('.search-box input')?.focus()
      } else if (event.key === 'Escape' && !panelOpen) {
        event.preventDefault()
        void platform.hideLauncher()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [panelOpen])

  const focusApp = useCallback((application: OrbitApp, launchWhenReady = false, preserveQuery = false) => {
    launchAfterFocus.current = launchWhenReady ? application.id : null
    setSelectedId(application.id)
    if (!preserveQuery) setQuery('')
    setStatus(launchWhenReady
      ? { key: 'status.positioning', params: { name: application.name } }
      : { key: 'status.located', params: { name: application.name } })
  }, [])

  const previewSearchApp = useCallback((application: OrbitApp) => {
    focusApp(application, false, true)
  }, [focusApp])

  const launch = useCallback(async (application?: OrbitApp) => {
    if (!application) return
    if (platform.kind !== 'electron') {
      setStatus({ key: 'status.launchRequiresDesktop' })
      return
    }
    setStatus({ key: 'status.launching', params: { name: application.name } })
    try {
      const result = await platform.launchApplication(application.launchId ?? application.id)
      setStatus(result.ok
        ? { key: 'status.launchSucceeded', params: { name: application.name } }
        : { key: 'status.launchFailed', params: { name: application.name } })
    } catch {
      setStatus({ key: 'status.launchFailed', params: { name: application.name } })
    }
  }, [])

  const handleFocusComplete = useCallback((id: string) => {
    const application = apps.find((item) => item.id === id)
    if (!application) return
    if (launchAfterFocus.current === id) {
      launchAfterFocus.current = null
      void launch(application)
    } else {
      setStatus({ key: 'status.focused', params: { name: application.name } })
    }
  }, [apps, launch])

  const addSelected = useCallback(async (ids: string[]) => {
    const availableSlots = Math.max(0, MAX_ORBIT_APPLICATIONS - apps.length)
    const requested = ids.slice(0, availableSlots)
    if (!requested.length) return
    setAdding(true)
    try {
      const result = await platform.addApplications(requested)
      const next = applyLibrary(result.library)
      if (result.added?.length) {
        setPickerOpen(false)
        setStatus({ key: 'status.appsAdded', params: { count: result.added.length } })
        setSelectedId(next.at(-1)?.id ?? next[0]?.id ?? '')
      } else {
        setStatus({ key: 'error.generic' })
      }
    } catch {
      setStatus({ key: 'error.generic' })
    } finally {
      setAdding(false)
    }
  }, [apps.length, applyLibrary])

  const removeApplication = useCallback(async (id: string) => {
    const application = apps.find((item) => item.id === id)
    try {
      const result = await platform.removeApplication(id)
      applyLibrary(result.library)
      if (result.ok && application) {
        setStatus({ key: 'appManager.removed', params: { name: application.name } })
      }
    } catch {
      setStatus({ key: 'error.generic' })
    }
  }, [apps, applyLibrary])

  const addManualApplication = useCallback(async () => {
    if (!capabilities.manualApplicationSelection) {
      setStatus({ key: 'error.platformUnavailable' })
      return
    }
    try {
      const candidate = await platform.selectManualApplication()
      if (!candidate) return
      if (apps.some((application) => application.id === candidate.id)) {
        setStatus({ key: 'manualAdd.duplicate' })
        return
      }
      if (!candidate.launchable || candidate.validation !== 'verified') {
        setStatus({ key: 'manualAdd.invalidPath' })
        return
      }
      const result = await platform.addApplications([candidate.id])
      applyLibrary(result.library)
      if (result.added?.includes(candidate.id)) {
        setStatus({ key: 'manualAdd.success', params: { name: candidate.name } })
      }
    } catch {
      setStatus({ key: 'manualAdd.invalidPath' })
    }
  }, [apps, applyLibrary, capabilities.manualApplicationSelection])

  const updatePreferences = useCallback(async (patch: Partial<OrbitSettings>) => {
    const previous = settings
    updateSettings(patch)
    if ('globalShortcut' in patch) setShortcutStatus('checking')
    if (platform.kind !== 'electron') return

    try {
      const result = await platform.updateSettings(patch)
      if (result.ok) {
        if (result.settings) replaceSettings(result.settings)
        if (result.shortcutStatus) setShortcutStatus(shortcutUiStatus(result.shortcutStatus))
        return
      }

      const rollback = Object.fromEntries(
        Object.keys(patch).map((key) => [key, previous[key as keyof OrbitSettings]]),
      ) as Partial<OrbitSettings>
      updateSettings(rollback)
      if ('globalShortcut' in patch) setShortcutStatus('conflict')
      setStatus({ key: result.code === 'accelerator-unavailable'
        ? 'launcher.shortcutUnavailable'
        : 'error.generic' })
    } catch {
      updateSettings(previous)
      if ('globalShortcut' in patch) setShortcutStatus('conflict')
      setStatus({ key: 'error.generic' })
    }
  }, [settings, updateSettings])

  const openManager = () => {
    setPickerOpen(false)
    setSettingsOpen(false)
    setManagerOpen(true)
  }
  const openSettings = () => {
    setPickerOpen(false)
    setManagerOpen(false)
    setSettingsOpen(true)
  }

  return (
    <div className="app-shell">
      <Titlebar />
      <main className="workspace">
        <Sidebar
          appCount={apps.length}
          scanning={scanning}
          onManage={openManager}
          onScan={() => void runScan(true)}
          onSettings={openSettings}
        />

        <section className="stage">
          <div className="stage__topbar">
            <div>
              <span className="stage-kicker">{t('stage.kicker')}</span>
              <strong>{t('stage.title')}</strong>
            </div>
            <SearchBar
              apps={apps}
              onChoose={(application) => focusApp(application)}
              onPreview={previewSearchApp}
              onQueryChange={setQuery}
              query={query}
            />
            <button
              className="reset-button"
              onClick={() => {
                launchAfterFocus.current = null
                setResetSignal((value) => value + 1)
                setStatus({ key: 'status.viewReset' })
              }}
              type="button"
            >
              <FiRotateCcw /> {t('stage.resetView')}
            </button>
          </div>

          <div className="scene-wrap">
            <OrbitScene
              active={launcherActive && !panelOpen}
              apps={apps}
              backgroundEffects={settings.backgroundEffects}
              fpsLimit={settings.fpsLimit}
              inertiaStrength={settings.inertiaStrength}
              motionLevel={settings.motionLevel}
              onFocusComplete={handleFocusComplete}
              onSelect={(application) => focusApp(application, true)}
              particles={settings.particles}
              performanceMode={settings.performanceMode}
              resetSignal={resetSignal}
              rotationSensitivity={settings.rotationSensitivity}
              selectedId={selectedId}
              zoomSpeed={settings.zoomSpeed}
            />
            <div className="scene-vignette" />
            {!apps.length ? (
              <div className="orbit-empty-state" data-testid="empty-library">
                <FiBox aria-hidden="true" />
                <h2>{t('appManager.emptyTitle')}</h2>
                <p>{t('appManager.emptyDescription')}</p>
                <button data-testid="empty-scan-apps" onClick={() => void runScan(true)} type="button">
                  {t('sidebar.scanLocalApps')}
                </button>
              </div>
            ) : null}
            <div className="scene-hint">
              <span><FiMove /> {t('stage.dragHint')}</span>
              <i />
              <span><FiMousePointer /> {t('stage.zoomHint')}</span>
            </div>
            <div className="orbit-index">
              <span>{String(apps.length).padStart(2, '0')}</span>
              <small>{t('stage.activeNodes')}</small>
            </div>
          </div>
        </section>

        <DetailPanel
          fpsLimit={settings.fpsLimit}
          onLaunch={() => void launch(selected)}
          selected={selected}
          status={statusText}
        />
      </main>

      <ApplicationPicker
        applications={candidates}
        isAdding={adding}
        isOpen={pickerOpen}
        isScanning={scanning}
        onAdd={addSelected}
        onClose={() => setPickerOpen(false)}
        onRescan={() => runScan(true).then(() => undefined)}
        selectionLimit={Math.max(0, MAX_ORBIT_APPLICATIONS - apps.length)}
        t={t}
      />
      <ApplicationManager
        applications={apps}
        isOpen={managerOpen}
        isRescanning={scanning}
        onClose={() => setManagerOpen(false)}
        onLaunch={(id) => launch(apps.find((application) => application.id === id))}
        onManualAdd={addManualApplication}
        onRemove={removeApplication}
        onRescan={() => runScan(true).then(() => undefined)}
        t={t}
      />
      <SettingsPanel
        about={{
          githubUrl: REPOSITORY_URL || t('common.unavailable'),
          license: 'MIT',
          productName: 'Orbit Desktop',
          version: ORBIT_VERSION,
        }}
        capabilities={{
          globalShortcut: capabilities.globalShortcuts,
          launchAtLogin: capabilities.launchAtLogin,
          updateCheck: Boolean(REPOSITORY_URL),
        }}
        isOpen={settingsOpen}
        onCheckForUpdates={async () => {
          if (!REPOSITORY_URL) {
            setStatus({ key: 'about.updateFailed' })
            return { status: 'failed' }
          }
          const result = await platform.checkForUpdates(REPOSITORY_URL, ORBIT_VERSION)
          if (result.ok && result.updateAvailable && result.version) {
            setStatus({ key: 'about.updateAvailable', params: { version: result.version } })
            return { status: 'available', version: result.version }
          }
          if (result.ok) {
            setStatus({ key: 'about.upToDate' })
            return { status: 'up-to-date' }
          }
          setStatus({ key: 'about.updateFailed' })
          return { status: 'failed' }
        }}
        onClose={() => setSettingsOpen(false)}
        onOpenGitHub={() => {
          if (REPOSITORY_URL) {
            void platform.openExternal(REPOSITORY_URL).then((result) => {
              if (!result.ok) setStatus({ key: 'error.platformUnavailable' })
            })
          } else setStatus({ key: 'error.platformUnavailable' })
        }}
        onUpdate={(patch) => void updatePreferences(patch)}
        settings={settings}
        shortcutStatus={shortcutStatus}
        t={t}
      />
    </div>
  )
}

export default App
