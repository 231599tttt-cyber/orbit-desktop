import { FiArrowUpRight, FiCpu, FiLayers, FiPlay } from 'react-icons/fi'
import type { OrbitApp } from '../types'
import { useI18n } from '../i18n'
import { ApplicationIcon } from './UnknownAppIcon'

type DetailPanelProps = {
  selected?: OrbitApp
  status: string
  onLaunch: () => void
  fpsLimit?: number
}

export function DetailPanel({ selected, status, onLaunch, fpsLimit = 60 }: DetailPanelProps) {
  const { t } = useI18n()
  const Icon = selected?.icon
  const category = selected?.kind === 'uwp'
    ? t('applicationKind.uwp')
    : selected?.kind === 'executable'
      ? t('applicationKind.executable')
      : selected?.kind === 'shortcut'
        ? t('applicationKind.shortcut')
        : selected?.kind === 'developer-demo'
          ? t('applicationKind.developerDemo')
          : selected?.category

  return (
    <aside className="detail-panel">
      <div className="detail-panel__header">
        <span>{t('detail.currentFocus')}</span>
        <span className="live-dot">{t('detail.live')}</span>
      </div>
      {selected ? (
        <>
          <div className="selected-app">
            <div className="selected-app__icon" style={{ color: selected.color, boxShadow: `0 0 34px ${selected.color}30` }}>
              {selected.iconDataUrl ? <ApplicationIcon src={selected.iconDataUrl} size={42} /> : Icon ? <Icon /> : <ApplicationIcon size={42} title={t('unknownApp.iconAlt')} />}
            </div>
            <div><h2 data-testid="focused-application-name">{selected.name}</h2><p>{category}</p></div>
          </div>
          <button type="button" className="launch-button" onClick={onLaunch}>
            <FiPlay /> {t('detail.launchNow')} <FiArrowUpRight />
          </button>
        </>
      ) : <p className="empty-selection">{t('detail.empty')}</p>}

      <div className="status-line" aria-live="polite">{status}</div>

      <div className="metric-grid">
        <div><FiCpu /><span><strong>{fpsLimit} FPS</strong><small>{t('detail.renderTarget')}</small></span></div>
        <div><FiLayers /><span><strong>WebGL</strong><small>{t('detail.spatialEngine')}</small></span></div>
      </div>

      <div className="depth-legend">
        <div className="depth-legend__title"><span>{t('detail.depth')}</span><span>{t('detail.realtime')}</span></div>
        <div className="depth-track"><i /><i /><i /><i /><i /></div>
        <div className="depth-labels"><span>{t('detail.far')}</span><span>{t('detail.camera')}</span></div>
      </div>
    </aside>
  )
}
