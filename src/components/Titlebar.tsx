import { FiMaximize2, FiMinus, FiX } from 'react-icons/fi'
import { useI18n } from '../i18n'
import { platform } from '../platform/adapter'

export function Titlebar() {
  const { t } = useI18n()
  const perform = (action: 'minimize' | 'maximize' | 'close') => {
    void platform.windowAction(action)
  }

  return (
    <header className="titlebar">
      <div className="titlebar__brand" aria-label={t('brand.name')}>
        <span className="titlebar__mark">O</span>
        <span>{t('brand.name')}</span>
      </div>
      <div className="titlebar__controls" aria-label={t('titlebar.windowControls')}>
        <button type="button" aria-label={t('titlebar.minimize')} onClick={() => perform('minimize')}><FiMinus /></button>
        <button type="button" aria-label={t('titlebar.maximizeRestore')} onClick={() => perform('maximize')}><FiMaximize2 /></button>
        <button type="button" className="titlebar__close" aria-label={t('titlebar.close')} onClick={() => perform('close')}><FiX /></button>
      </div>
    </header>
  )
}
