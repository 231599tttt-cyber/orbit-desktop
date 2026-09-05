import { useEffect, useMemo } from 'react'
import { FiCommand, FiSearch, FiX } from 'react-icons/fi'
import type { OrbitApp } from '../types'
import { useI18n } from '../i18n'
import { ApplicationIcon } from './UnknownAppIcon'

type SearchBarProps = {
  apps: OrbitApp[]
  query: string
  onQueryChange: (value: string) => void
  onChoose: (app: OrbitApp) => void
  onPreview: (app: OrbitApp) => void
}

export function SearchBar({ apps, query, onQueryChange, onChoose, onPreview }: SearchBarProps) {
  const { t } = useI18n()
  const categoryLabel = (app: OrbitApp) => app.kind === 'uwp'
    ? t('applicationKind.uwp')
    : app.kind === 'executable'
      ? t('applicationKind.executable')
      : app.kind === 'shortcut'
        ? t('applicationKind.shortcut')
        : app.kind === 'developer-demo'
          ? t('applicationKind.developerDemo')
          : app.category
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return []
    return apps
      .filter((app) => `${app.name} ${app.category} ${categoryLabel(app)}`.toLocaleLowerCase().includes(normalized))
      .slice(0, 6)
  }, [apps, query, t])

  const chooseFirst = () => {
    if (results[0]) onChoose(results[0])
  }

  useEffect(() => {
    const firstResult = results[0]
    if (!query.trim() || !firstResult) return
    const timer = window.setTimeout(() => onPreview(firstResult), 220)
    return () => window.clearTimeout(timer)
  }, [onPreview, query, results])

  return (
    <div className="search-wrap">
      <div className="search-box">
        <FiSearch aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') chooseFirst()
            if (event.key === 'Escape') onQueryChange('')
          }}
          placeholder={t('search.placeholder')}
          aria-label={t('search.ariaLabel')}
          spellCheck={false}
        />
        {query ? (
          <button type="button" className="search-clear" aria-label={t('search.clear')} onClick={() => onQueryChange('')}>
            <FiX />
          </button>
        ) : (
          <span className="search-shortcut"><FiCommand /> K</span>
        )}
      </div>
      {query && (
        <div className="search-results" role="listbox">
          {results.length ? results.map((app) => {
            const Icon = app.icon
            return (
              <button type="button" key={app.id} onClick={() => onChoose(app)}>
                <span className="result-icon" style={{ color: app.color }}>
                  {app.iconDataUrl ? <ApplicationIcon src={app.iconDataUrl} size={22} /> : Icon ? <Icon /> : <ApplicationIcon size={22} />}
                </span>
                <span><strong>{app.name}</strong><small>{categoryLabel(app)}</small></span>
                <span className="result-action">{t('search.focus')}</span>
              </button>
            )
          }) : <p className="no-results">{t('search.noResults')}</p>}
        </div>
      )}
    </div>
  )
}
