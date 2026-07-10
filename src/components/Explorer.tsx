import { useEffect, useState } from 'react'
import { Compass, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, formatRangeAD, type ExploreTag, type ExploreEvent } from '../api'
import { type WheelAction } from '../lib/settings'
import { oneLine } from '../lib/format'
import { PrimeTagStrip } from './PrimeTagStrip'

// ---- エクスプローラー（他ユーザーの年表を見ていく）--------------
export function Explorer({ onClose, username, onFollowChange, wheelPlain, wheelShift, wheelCtrl, zoomFactor, invertZoom, packLanes, rowHeight }: {
  onClose: () => void
  // ログイン中ユーザー名（ゲストを含む）。自分の年表にはフォローボタンを出さない。
  username: string
  onFollowChange?: () => void
  wheelPlain: WheelAction
  wheelShift: WheelAction
  wheelCtrl: WheelAction
  zoomFactor: number
  invertZoom: boolean
  packLanes: boolean
  rowHeight: number
}) {
  const { t } = useTranslation()
  const [strips, setStrips] = useState<ExploreTag[] | null>(null)
  const [error, setError] = useState('')
  // 選択中イベント（下バーに詳細を表示）。所有者・タグ情報も併せて保持する。
  const [sel, setSel] = useState<{ ev: ExploreEvent; username: string; tagName: string; color: string } | null>(null)
  // 選択中の年表（帯）。周囲をキーカラーで囲んで示す。
  const [selStripId, setSelStripId] = useState<number | null>(null)
  useEffect(() => {
    api.explore()
      .then(setStrips)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  // フォロー/解除して、帯の followed 状態を更新。本画面側にも反映を通知。
  const toggleFollow = async (s: ExploreTag) => {
    try {
      if (s.followed) await api.unfollow(s.tag_id); else await api.follow(s.tag_id)
      setStrips((prev) => prev && prev.map((x) => x.tag_id === s.tag_id ? { ...x, followed: !x.followed } : x))
      onFollowChange?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    // 帯以外（タイトル・余白など）をクリックしたら年表の選択を解除する。
    <div className="explorer" onClick={() => setSelStripId(null)}>
      <div className="explorer-head">
        <h2 className="explorer-title"><Compass size={20} /> {t('explorer.title')}</h2>
        <button className="settings-close" onClick={onClose} title={t('common.close')} aria-label={t('common.close')}><X size={18} /></button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {strips == null ? (
        <p className="explorer-note">{t('common.loading')}</p>
      ) : strips.length === 0 ? (
        <p className="explorer-note">{t('explorer.empty')}</p>
      ) : (
        <div className="explorer-strips">
          {strips.map((s) => (
            <PrimeTagStrip
              key={s.tag_id}
              tag={s}
              selectedId={sel?.ev.id ?? null}
              onSelect={(ev) => setSel({ ev, username: s.username, tagName: s.name, color: s.color })}
              selected={selStripId === s.tag_id}
              onSelectStrip={() => setSelStripId(s.tag_id)}
              showFollow={s.username !== username}
              onToggleFollow={() => toggleFollow(s)}
              wheelPlain={wheelPlain}
              wheelShift={wheelShift}
              wheelCtrl={wheelCtrl}
              zoomFactor={zoomFactor}
              invertZoom={invertZoom}
              packLanes={packLanes}
              rowHeight={rowHeight}
            />
          ))}
        </div>
      )}
      <div className="explorer-foot">
        {sel ? (
          <div className="chart-sel">
            <div className="chart-sel-head">
              <span className="strip-swatch" style={{ background: sel.color }} />
              <span className="chart-sel-title">{sel.ev.title || t('common.untitled')}</span>
              <span className="chart-sel-date">{formatRangeAD(sel.ev)}</span>
              <span className="chart-sel-meta">{sel.tagName}@{sel.username}</span>
            </div>
            {sel.ev.detail && <div className="chart-sel-detail">{oneLine(sel.ev.detail)}</div>}
          </div>
        ) : (
          <span className="chart-hint-text">{t('chart.selectHint')}</span>
        )}
      </div>
    </div>
  )
}
