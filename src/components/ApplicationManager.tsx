import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiFolderPlus,
  FiPlay,
  FiRefreshCw,
  FiSearch,
  FiTrash2,
  FiX,
} from 'react-icons/fi'
import type { TranslationFunction } from '../i18n'
import type { OrbitApp } from '../types'
import { ApplicationIcon } from './UnknownAppIcon'

export type ManagedApplication = OrbitApp & {
  statusReason?: string
}

type ApplicationManagerProps = {
  applications: readonly ManagedApplication[]
  isOpen: boolean
  isRescanning?: boolean
  onClose: () => void
  onLaunch?: (applicationId: string) => Promise<void> | void
  onManualAdd: () => Promise<void> | void
  onRemove: (applicationId: string) => Promise<void> | void
  onRescan: () => Promise<void> | void
  t: TranslationFunction
}

export function ApplicationManager({
  applications,
  isOpen,
  isRescanning = false,
  onClose,
  onLaunch,
  onManualAdd,
  onRemove,
  onRescan,
  t,
}: ApplicationManagerProps) {
  const headingId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const pendingRemovalRef = useRef<string | null>(null)
  const [query, setQuery] = useState('')
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  useEffect(() => {
    pendingRemovalRef.current = pendingRemovalId
  }, [pendingRemovalId])

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setPendingRemovalId(null)
    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus())

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (pendingRemovalRef.current) setPendingRemovalId(null)
        else onClose()
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

  const visibleApplications = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return applications
    return applications.filter((app) => `${app.name} ${app.category}`.toLocaleLowerCase().includes(normalized))
  }, [applications, query])

  if (!isOpen) return null

  const runAction = async (name: string, action: () => Promise<void> | void) => {
    setBusyAction(name)
    try {
      await action()
    } finally {
      setBusyAction(null)
    }
  }

  const confirmRemoval = async (app: ManagedApplication) => {
    if (pendingRemovalId !== app.id) {
      setPendingRemovalId(app.id)
      return
    }
    await runAction(`remove:${app.id}`, () => onRemove(app.id))
    setPendingRemovalId(null)
  }

  return (
    <div className="orbit-drawer-backdrop" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose()
    }}>
      <aside
        aria-labelledby={headingId}
        aria-modal="true"
        className="orbit-drawer application-manager"
        data-testid="application-manager"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="orbit-drawer__header">
          <div>
            <span className="orbit-drawer__eyebrow">{t('nav.manageApps')}</span>
            <h2 id={headingId}>{t('appManager.title')}</h2>
            <p>{t('appManager.addedCount', { count: applications.length })}</p>
          </div>
          <button className="orbit-drawer__close" onClick={onClose} type="button" aria-label={t('common.close')}>
            <FiX aria-hidden="true" />
          </button>
        </header>

        <div className="application-manager__actions">
          <button
            data-testid="manual-add-app"
            disabled={busyAction !== null}
            onClick={() => void runAction('manual', onManualAdd)}
            type="button"
          >
            <FiFolderPlus aria-hidden="true" />
            {busyAction === 'manual' ? t('common.loading') : t('appManager.manualAdd')}
          </button>
          <button
            data-testid="rescan-apps"
            disabled={busyAction !== null || isRescanning}
            onClick={() => void runAction('rescan', onRescan)}
            type="button"
          >
            <FiRefreshCw aria-hidden="true" className={isRescanning ? 'is-spinning' : undefined} />
            {isRescanning ? t('sidebar.scanning') : t('appManager.rescan')}
          </button>
        </div>

        <label className="drawer-search application-manager__search">
          <FiSearch aria-hidden="true" />
          <span className="sr-only">{t('common.search')}</span>
          <input
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('appManager.searchPlaceholder')}
            spellCheck={false}
            type="search"
            value={query}
          />
        </label>

        <div className="application-list application-manager__list" role="list">
          {visibleApplications.length === 0 ? (
            <div className="drawer-empty-state">
              <FiSearch aria-hidden="true" />
              <strong>{query ? t('appManager.noResults') : t('appManager.emptyTitle')}</strong>
              {!query ? <p>{t('appManager.emptyDescription')}</p> : null}
            </div>
          ) : visibleApplications.map((app) => {
            const launchStatus = app.validation ?? (app.launchable === false ? 'invalid' : 'verified')
            const isConfirmingRemoval = pendingRemovalId === app.id
            const isRemoving = busyAction === `remove:${app.id}`
            return (
              <article className={`managed-application ${isConfirmingRemoval ? 'is-confirming-remove' : ''}`} data-testid={`managed-app-${app.id}`} key={app.id} role="listitem">
                <span className="managed-application__icon" style={{ color: app.color }}>
                  <ApplicationIcon
                    size={40}
                    src={app.iconDataUrl}
                    title={app.iconStatus === 'missing' ? t('scanner.iconUnavailable') : undefined}
                  />
                </span>
                <span className="managed-application__identity">
                  <strong>{app.name}</strong>
                  <small className={`managed-application__status is-${launchStatus}`} title={app.statusReason}>
                    {launchStatus === 'verified' ? <FiCheckCircle aria-hidden="true" /> : <FiAlertTriangle aria-hidden="true" />}
                    {launchStatus === 'verified'
                      ? t('appManager.launchEntryValid')
                      : launchStatus === 'unverified'
                        ? t('scanner.unverified')
                        : t('appManager.launchEntryInvalid')}
                  </small>
                </span>
                <span className="managed-application__controls">
                  {onLaunch ? (
                    <button
                      aria-label={`${t('common.open')} ${app.name}`}
                      disabled={launchStatus === 'invalid' || busyAction !== null}
                      onClick={() => void runAction(`launch:${app.id}`, () => onLaunch(app.id))}
                      title={t('common.open')}
                      type="button"
                    >
                      <FiPlay aria-hidden="true" />
                    </button>
                  ) : null}
                  <button
                    aria-label={t('appManager.removeTitle', { name: app.name })}
                    className={isConfirmingRemoval ? 'is-danger' : undefined}
                    data-testid={`remove-app-${app.id}`}
                    disabled={busyAction !== null}
                    onClick={() => void confirmRemoval(app)}
                    title={isConfirmingRemoval ? t('common.confirm') : t('appManager.remove')}
                    type="button"
                  >
                    {isRemoving ? <FiRefreshCw aria-hidden="true" className="is-spinning" /> : <FiTrash2 aria-hidden="true" />}
                  </button>
                  {isConfirmingRemoval ? (
                    <button
                      aria-label={t('common.cancel')}
                      disabled={busyAction !== null}
                      onClick={() => setPendingRemovalId(null)}
                      title={t('common.cancel')}
                      type="button"
                    >
                      <FiX aria-hidden="true" />
                    </button>
                  ) : null}
                </span>
              </article>
            )
          })}
        </div>

        <footer className="orbit-drawer__footer application-manager__footer">
          <p><FiAlertTriangle aria-hidden="true" />{t('appManager.removeDescription')}</p>
        </footer>
      </aside>
    </div>
  )
}
