import {
  FiBox,
  FiCompass,
  FiCrosshair,
  FiDatabase,
  FiMousePointer,
  FiRefreshCw,
  FiSearch,
  FiSettings,
  FiGrid,
  FiZap,
} from 'react-icons/fi'
import { useI18n } from '../i18n'

type SidebarProps = {
  appCount: number
  scanning: boolean
  onScan: () => void
  onManage: () => void
  onSettings: () => void
}

export function Sidebar({ appCount, scanning, onScan, onManage, onSettings }: SidebarProps) {
  const { t } = useI18n()
  const gestures = [
    { icon: FiCompass, title: t('sidebar.freeRotate'), detail: t('sidebar.freeRotateDetail') },
    { icon: FiCrosshair, title: t('sidebar.smoothZoom'), detail: t('sidebar.smoothZoomDetail') },
    { icon: FiMousePointer, title: t('sidebar.clickToLaunch'), detail: t('sidebar.clickToLaunchDetail') },
    { icon: FiSearch, title: t('sidebar.quickSearch'), detail: t('sidebar.quickSearchDetail') },
  ]
  return (
    <aside className="sidebar">
      <div className="hero-copy">
        <span className="eyebrow"><FiBox /> {t('brand.eyebrow')}</span>
        <h1>Orbit<br />Desktop</h1>
        <p>{t('brand.tagline')}</p>
      </div>

      <div className="sidebar-actions">
        <button data-testid="manage-apps" type="button" onClick={onManage}><FiGrid />{t('nav.manageApps')}</button>
        <button data-testid="open-settings" type="button" onClick={onSettings}><FiSettings />{t('nav.settings')}</button>
      </div>

      <div className="nav-label">{t('sidebar.interactions')}</div>
      <div className="gesture-list">
        {gestures.map(({ icon: Icon, title, detail }) => (
          <div className="gesture-row" key={title}>
            <span className="gesture-icon"><Icon /></span>
            <span><strong>{title}</strong><small>{detail}</small></span>
          </div>
        ))}
      </div>

      <div className="scan-card">
        <div className="scan-card__top">
          <span className="scan-icon"><FiDatabase /></span>
          <span><strong>{t('sidebar.localApps')}</strong><small>{t('sidebar.loadedNodes', { count: appCount })}</small></span>
        </div>
        <button data-testid="scan-apps" type="button" onClick={onScan} disabled={scanning}>
          <FiRefreshCw className={scanning ? 'is-spinning' : ''} />
          {scanning ? t('sidebar.scanning') : t('sidebar.scanLocalApps')}
        </button>
        <p><FiZap /> {t('sidebar.localOnly')}</p>
      </div>
    </aside>
  )
}
