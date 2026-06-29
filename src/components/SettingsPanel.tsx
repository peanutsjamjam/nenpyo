import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type Lang } from '../i18n'
import { type AppSettings, type Theme, type WheelAction, WHEEL_ACTIONS, ZOOM_FACTORS } from '../lib/settings'

// ---- 設定画面（メイン領域に表示） ------------------------------------------
export function SettingsPanel({ settings, setSettings, onClose }: {
  settings: AppSettings
  setSettings: (updater: (s: AppSettings) => AppSettings) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  // どの修飾キーにも「拡大縮小」が割り当てられていなければ、倍率・反転は無効化
  const zoomUsed = settings.wheelPlain === 'zoom' || settings.wheelShift === 'zoom' || settings.wheelCtrl === 'zoom'
  return (
    <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
      <div className="settings-head">
        <h2 className="settings-title">{t('settings.title')}</h2>
        <button className="settings-close" onClick={onClose} title={t('common.close')} aria-label={t('common.close')}><X size={18} /></button>
      </div>

      <section className="settings-section">
        <h3 className="settings-label">{t('settings.language')}</h3>
        <div className="settings-section-body">
        <div className="lang-options">
          {([
            { code: 'ja' as Lang, label: '日本語', flag: 'jp.jpg' },
            { code: 'en' as Lang, label: 'English', flag: 'gb.jpg' },
          ]).map((l) => (
            <button
              key={l.code}
              className={'lang-option' + (settings.lang === l.code ? ' selected' : '')}
              onClick={() => setSettings((s) => ({ ...s, lang: l.code }))}
            >
              <img className="lang-flag" src={`${import.meta.env.BASE_URL}flags/${l.flag}`} alt="" />
              <span>{l.label}</span>
            </button>
          ))}
        </div>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-label">{t('settings.theme')}</h3>
        <div className="settings-section-body">
        <div className="theme-options">
          {(['light', 'dark'] as Theme[]).map((th) => (
            <button
              key={th}
              className={'theme-option' + (settings.theme === th ? ' selected' : '')}
              onClick={() => setSettings((s) => ({ ...s, theme: th }))}
            >
              {th === 'light' ? t('settings.light') : t('settings.dark')}
            </button>
          ))}
        </div>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-label">{t('settings.wheel.section')}</h3>
        <div className="settings-section-body">
        {([
          ['wheelPlain', 'settings.wheel.plain'],
          ['wheelShift', 'settings.wheel.shift'],
          ['wheelCtrl', 'settings.wheel.ctrl'],
        ] as [keyof AppSettings, string][]).map(([key, labelKey]) => (
          <div className="wheel-row" key={key}>
            <span className="wheel-row-label">{t(labelKey)}</span>
            <select
              className="wheel-select"
              value={settings[key] as WheelAction}
              onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value as WheelAction }))}
            >
              {WHEEL_ACTIONS.map((a) => (
                <option key={a} value={a}>{t(`settings.action.${a}`)}</option>
              ))}
            </select>
          </div>
        ))}
        <div className={'wheel-row' + (zoomUsed ? '' : ' disabled')}>
          <span className="wheel-row-label">{t('settings.wheel.zoomFactor')}</span>
          <select
            className="wheel-select"
            disabled={!zoomUsed}
            value={settings.zoomFactor}
            onChange={(e) => setSettings((s) => ({ ...s, zoomFactor: Number(e.target.value) }))}
          >
            {ZOOM_FACTORS.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </div>
        <label className={'settings-toggle' + (zoomUsed ? '' : ' disabled')}>
          <span>{t('settings.wheel.invert')}</span>
          <input
            type="checkbox"
            disabled={!zoomUsed}
            checked={settings.invertZoom}
            onChange={(e) => setSettings((s) => ({ ...s, invertZoom: e.target.checked }))}
          />
        </label>
        <p className="settings-note">
          {t('settings.wheel.note')}
        </p>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-label">{t('settings.eventList')}</h3>
        <div className="settings-section-body">
          <label className="settings-toggle">
            <span>{t('settings.moveIntoView')}</span>
            <input
              type="checkbox"
              checked={settings.moveClickedIntoView}
              onChange={(e) => setSettings((s) => ({ ...s, moveClickedIntoView: e.target.checked }))}
            />
          </label>
        </div>
      </section>

      <p className="settings-note">{t('settings.savedNote')}</p>
    </div>
  )
}
