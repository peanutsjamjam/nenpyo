import { useState } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { type Lang } from '../i18n'
import { type AppSettings, type WheelAction, WHEEL_ACTIONS, ZOOM_FACTORS, BAR_HEIGHT, ROW_HEIGHT, LABEL_FONT } from '../lib/settings'
import { type ColorScheme } from '../api'

export type SettingsTab = 'appearance' | 'account' | 'behavior'

// ---- 設定画面（メイン領域に表示） ------------------------------------------
// 「アカウント(Account)」はアカウントに関する操作、「表示(Appearance)」「動作(Behavior)」は
// ブラウザ(localStorage)に保存される設定。内容の性質が違うのでタブで切り替える。
// どのタブを開くかは呼び出し側が決める（歯車→表示 / ユーザー名→アカウント）。
// ゲスト（isGuest）ではアカウントタブを出さず、表示・動作だけを扱う。
export function SettingsPanel({ settings, setSettings, colorSchemes, onClose, username, email, isGuest, tab, onTabChange, onChangePassword, onDeleteAccount }: {
  settings: AppSettings
  setSettings: (updater: (s: AppSettings) => AppSettings) => void
  colorSchemes: ColorScheme[]
  onClose: () => void
  username: string
  email: string | null
  isGuest: boolean
  tab: SettingsTab
  onTabChange: (t: SettingsTab) => void
  onChangePassword: () => void
  onDeleteAccount: () => void
}) {
  const { t } = useTranslation()
  // アカウント欄の入力（保存処理は今後実装。今は入力状態の保持のみ）。
  const [accBio, setAccBio] = useState('')
  // どの修飾キーにも「拡大縮小」が割り当てられていなければ、倍率・反転は無効化
  const zoomUsed = settings.wheelPlain === 'zoom' || settings.wheelShift === 'zoom' || settings.wheelCtrl === 'zoom'
  return (
    <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
      <div className="settings-head">
        <h2 className="settings-title">{t('settings.title')}</h2>
        <button className="settings-close" onClick={onClose} title={t('common.close')} aria-label={t('common.close')}><X size={18} /></button>
      </div>

      <div className="settings-tabs" role="tablist">
        {!isGuest && (
          <button role="tab" aria-selected={tab === 'account'} className={tab === 'account' ? 'active' : ''} onClick={() => onTabChange('account')}>{t('settings.tabAccount')}</button>
        )}
        <button role="tab" aria-selected={tab === 'appearance'} className={tab === 'appearance' ? 'active' : ''} onClick={() => onTabChange('appearance')}>{t('settings.tabAppearance')}</button>
        <button role="tab" aria-selected={tab === 'behavior'} className={tab === 'behavior' ? 'active' : ''} onClick={() => onTabChange('behavior')}>{t('settings.tabBehavior')}</button>
      </div>

      {tab === 'appearance' && (<>
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
        <div className="scheme-select-row">
          <select
            className="scheme-select"
            // 未選択（null）のときは一覧の先頭（表示順で一番上）を選択状態として見せる。
            value={settings.schemeId ?? colorSchemes[0]?.id ?? ''}
            onChange={(e) => setSettings((s) => ({ ...s, schemeId: Number(e.target.value) }))}
          >
            {colorSchemes.map((sc) => (
              <option key={sc.id} value={sc.id}>{sc.name}</option>
            ))}
          </select>
          {(() => {
            const sc = colorSchemes.find((x) => x.id === settings.schemeId) ?? colorSchemes[0]
            if (!sc) return null
            return (
              <span className="scheme-preview">
                {sc.colors.map((c) => (
                  <span key={c.id} className="scheme-preview-chip" style={{ background: c.color }} title={c.color} />
                ))}
              </span>
            )
          })()}
        </div>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-label">{t('settings.rowHeight')}</h3>
        <div className="settings-section-body">
          <div className="bar-height-row">
            <input
              type="range"
              min={ROW_HEIGHT.min}
              max={ROW_HEIGHT.max}
              step={ROW_HEIGHT.step}
              value={settings.rowHeight}
              // 行を縮めたらバーも行に収まるよう同時に詰める。
              onChange={(e) => { const rh = Number(e.target.value); setSettings((s) => ({ ...s, rowHeight: rh, barHeight: Math.min(s.barHeight, rh) })) }}
            />
            <span className="bar-height-value">{settings.rowHeight}px</span>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-label">{t('settings.barHeight')}</h3>
        <div className="settings-section-body">
          <div className="bar-height-row">
            <input
              type="range"
              min={BAR_HEIGHT.min}
              max={settings.rowHeight}
              step={BAR_HEIGHT.step}
              value={Math.min(settings.barHeight, settings.rowHeight)}
              onChange={(e) => setSettings((s) => ({ ...s, barHeight: Number(e.target.value) }))}
            />
            <span className="bar-height-value">{Math.min(settings.barHeight, settings.rowHeight)}px</span>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-label">{t('settings.labelFont')}</h3>
        <div className="settings-section-body">
          <div className="bar-height-row">
            <input
              type="range"
              min={LABEL_FONT.min}
              max={LABEL_FONT.max}
              step={LABEL_FONT.step}
              value={settings.labelFont}
              onChange={(e) => setSettings((s) => ({ ...s, labelFont: Number(e.target.value) }))}
            />
            <span className="bar-height-value">{settings.labelFont}px</span>
          </div>
        </div>
      </section>

      <p className="settings-note">{t('settings.savedNote')}</p>
      </>)}

      {tab === 'behavior' && (<>
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
      </>)}

      {tab === 'account' && !isGuest && (<>
      <section className="settings-section">
        <h3 className="settings-label">{t('settings.account.email')}</h3>
        <div className="settings-section-body">
          <div className="account-readonly">{email ?? '—'}</div>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-label">{t('settings.account.username')}</h3>
        <div className="settings-section-body">
          <div className="account-readonly">{username}</div>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-label">{t('settings.account.changePassword')}</h3>
        <div className="settings-section-body">
          <button className="account-action-btn" onClick={onChangePassword}>{t('settings.account.changePasswordButton')}</button>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-label">{t('settings.account.bio')}</h3>
        <div className="settings-section-body">
          <textarea className="account-input account-bio" value={accBio} onChange={(e) => setAccBio(e.target.value)} maxLength={1000} />
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-label">{t('settings.account.deleteAccount')}</h3>
        <div className="settings-section-body">
          <button className="account-delete-btn" onClick={onDeleteAccount}>{t('settings.account.deleteAccount')}</button>
        </div>
      </section>
      </>)}
    </div>
  )
}
