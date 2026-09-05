import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  FiAlertTriangle,
  FiCheck,
  FiCheckCircle,
  FiRefreshCw,
  FiSearch,
  FiX,
} from 'react-icons/fi'
import type { TranslationFunction } from '../i18n'
import type { LaunchValidation, ScannedApplication } from '../types'
import { ApplicationIcon } from './UnknownAppIcon'

export type ApplicationLaunchStatus = LaunchValidation

export type ApplicationPickerItem = ScannedApplication & {
  iconStatus?: 'cached' | 'extracted' | 'missing'
  statusReason?: string
}

type ApplicationPickerProps = {
  applications: readonly ApplicationPickerItem[]
  isAdding?: boolean
  isOpen: boolean
  isScanning?: boolean
  onAdd: (applicationIds: string[]) => Promise<void> | void
  onClose: () => void
  onRescan?: () => Promise<void> | void
  selectionLimit?: number
  t: TranslationFunction
}

const isSelectable = (app: ApplicationPickerItem) => !app.alreadyAdded && app.validation !== 'invalid' && app.launchable

export function ApplicationPicker({
  applications,
  isAdding = false,
  isOpen,
  isScanning = false,
  onAdd,
  onClose,
  onRescan,
  selectionLimit = 32,
  t,
}: ApplicationPickerProps) {
  const headingId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setSelectedIds(new Set())
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus())

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
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

  const visibleApplications = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return applications
    return applications.filter((app) => app.name.toLocaleLowerCase().includes(normalized))
  }, [applications, query])

  const visibleSelectableIds = useMemo(
    () => selectionLimit > 0 ? visibleApplications.filter(isSelectable).map((app) => app.id) : [],
    [selectionLimit, visibleApplications],
  )
  const selectableTargetIds = visibleSelectableIds.slice(0, selectionLimit)
  const allVisibleSelected = selectableTargetIds.length > 0
    && selectableTargetIds.every((id) => selectedIds.has(id))

  if (!isOpen) return null

  const toggleApplication = (app: ApplicationPickerItem) => {
    if (!isSelectable(app)) return
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(app.id)) next.delete(app.id)
      else if (next.size < selectionLimit) next.add(app.id)
      return next
    })
  }

  const selectAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current)
      selectableTargetIds.forEach((id) => {
        if (next.size < selectionLimit) next.add(id)
      })
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const statusLabel = (app: ApplicationPickerItem) => {
    if (app.alreadyAdded) return t('scanner.alreadyAdded')
    if (app.validation === 'verified') return t('scanner.valid')
    if (app.validation === 'unverified') return t('scanner.unverified')
    return t('appManager.launchEntryInvalid')
  }

  const sourceLabel = (app: ApplicationPickerItem) => {
    switch (app.source) {
      case 'start-menu-user': return t('scanner.source.startMenuUser')
      case 'start-menu-system': return t('scanner.source.startMenuSystem')
      case 'desktop-user': return t('scanner.source.desktopUser')
      case 'desktop-public': return t('scanner.source.desktopPublic')
      case 'registry': return t('scanner.source.registered')
      case 'uwp': return t('scanner.source.store')
      case 'manual': return t('scanner.source.manual')
      default: return t('common.unknown')
    }
  }

  return (
    <div className="orbit-drawer-backdrop" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose()
    }}>
      <aside
        aria-labelledby={headingId}
        aria-modal="true"
        className="orbit-drawer application-picker"
        data-testid="application-picker"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="orbit-drawer__header">
          <div>
            <span className="orbit-drawer__eyebrow">{t('sidebar.localApps')}</span>
            <h2 id={headingId}>{t('scanner.title')}</h2>
            <p>{t('scanner.description', { count: applications.length })}</p>
          </div>
          <button className="orbit-drawer__close" onClick={onClose} type="button" aria-label={t('common.close')}>
            <FiX aria-hidden="true" />
          </button>
        </header>

        <div className="orbit-drawer__toolbar">
          <label className="drawer-search">
            <FiSearch aria-hidden="true" />
            <span className="sr-only">{t('common.search')}</span>
            <input
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('common.search')}
              spellCheck={false}
              type="search"
              value={query}
            />
          </label>
          {onRescan ? (
            <button className="drawer-icon-button" disabled={isScanning || isAdding} onClick={() => void onRescan()} type="button">
              <FiRefreshCw aria-hidden="true" className={isScanning ? 'is-spinning' : undefined} />
              <span>{isScanning ? t('sidebar.scanning') : t('scanner.scanAgain')}</span>
            </button>
          ) : null}
        </div>

        <div className="application-picker__summary" aria-live="polite">
          <span>{t('search.resultCount', { count: visibleApplications.length })}</span>
          <span>{t('scanner.selectedCount', { count: selectedIds.size, limit: selectionLimit })}</span>
        </div>

        <div className="application-list" role="list" aria-busy={isScanning}>
          {isScanning && applications.length === 0 ? (
            <div className="drawer-empty-state">
              <FiRefreshCw aria-hidden="true" className="is-spinning" />
              <strong>{t('sidebar.scanning')}</strong>
              <p>{t('status.scanStarted')}</p>
            </div>
          ) : visibleApplications.length === 0 ? (
            <div className="drawer-empty-state">
              <FiSearch aria-hidden="true" />
              <strong>{query ? t('search.noResults') : t('scanner.emptyTitle')}</strong>
              <p>{t('scanner.emptyDescription')}</p>
            </div>
          ) : visibleApplications.map((app) => {
            const checked = selectedIds.has(app.id)
            const selectable = selectionLimit > 0 && isSelectable(app)
            const statusClass = app.alreadyAdded ? 'is-added' : `is-${app.validation}`
            return (
              <label
                className={`application-row ${checked ? 'is-selected' : ''} ${!selectable ? 'is-disabled' : ''}`}
                key={app.id}
                role="listitem"
              >
                <input
                  checked={checked}
                  data-testid={`picker-candidate-${app.id}`}
                  disabled={!selectable || isAdding}
                  onChange={() => toggleApplication(app)}
                  type="checkbox"
                />
                <span className="application-row__check" aria-hidden="true"><FiCheck /></span>
                <span className="application-row__icon">
                  <ApplicationIcon
                    size={38}
                    src={app.iconDataUrl}
                    title={app.iconStatus === 'missing' ? t('scanner.iconUnavailable') : undefined}
                  />
                </span>
                <span className="application-row__identity">
                  <strong>{app.name}</strong>
                  <small>{sourceLabel(app)}</small>
                </span>
                <span className={`application-row__status ${statusClass}`}>
                  {app.alreadyAdded || app.validation === 'verified'
                    ? <FiCheckCircle aria-hidden="true" />
                    : <FiAlertTriangle aria-hidden="true" />}
                  {statusLabel(app)}
                </span>
              </label>
            )
          })}
        </div>

        <footer className="orbit-drawer__footer application-picker__footer">
          <div className="application-picker__selection-actions">
            <button disabled={!visibleSelectableIds.length || allVisibleSelected || isAdding} onClick={selectAllVisible} type="button">
              {t('common.selectAll')}
            </button>
            <button disabled={!selectedIds.size || isAdding} onClick={clearSelection} type="button">
              {t('common.clearSelection')}
            </button>
          </div>
          <button
            className="drawer-primary-button"
            data-testid="add-selected-apps"
            disabled={!selectedIds.size || isAdding || isScanning}
            onClick={() => void onAdd(Array.from(selectedIds))}
            type="button"
          >
            {isAdding ? t('common.loading') : t('scanner.addSelected', { count: selectedIds.size })}
          </button>
        </footer>
      </aside>
    </div>
  )
}
