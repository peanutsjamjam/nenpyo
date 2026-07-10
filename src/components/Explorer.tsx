import { useEffect, useState } from 'react'
import { Compass, X, Search } from 'lucide-react'
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
  // 最初は10件、「さらに表示」で以降20件ずつ追加取得する。
  const PAGE_FIRST = 10
  const PAGE_MORE = 20
  const [strips, setStrips] = useState<ExploreTag[] | null>(null)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  // 選択中イベント（下バーに詳細を表示）。所有者・タグ情報も併せて保持する。
  const [sel, setSel] = useState<{ ev: ExploreEvent; username: string; tagName: string; color: string } | null>(null)
  // 選択中の年表（帯）。周囲をキーカラーで囲んで示す。
  const [selStripId, setSelStripId] = useState<number | null>(null)
  // 検索入力（input）と、実際に検索を実行する確定値（query）。入力は少し遅れて query へ反映。
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')

  // 入力の変化を 300ms 遅らせて確定検索語へ反映（打鍵ごとの検索を抑える）。
  useEffect(() => {
    const id = setTimeout(() => setQuery(input.trim()), 300)
    return () => clearTimeout(id)
  }, [input])

  // 確定検索語が変わるたびに、先頭ページ（10件）を取り直す。
  useEffect(() => {
    let cancelled = false
    setStrips(null); setError('')
    api.explore(query, 0, PAGE_FIRST)
      .then((r) => { if (!cancelled) { setStrips(r.strips); setTotal(r.total) } })
      .catch((e) => { if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setStrips([]) } })
    return () => { cancelled = true }
  }, [query])

  // 「さらに表示」: 現在の件数を offset に、次の20件を取得して末尾へ足す。
  const loadMore = async () => {
    if (!strips || loadingMore) return
    setLoadingMore(true)
    try {
      const r = await api.explore(query, strips.length, PAGE_MORE)
      setStrips((prev) => [...(prev ?? []), ...r.strips])
      setTotal(r.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingMore(false)
    }
  }

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

  const hasMore = strips != null && strips.length < total

  return (
    // 帯以外（タイトル・余白など）をクリックしたら年表の選択を解除する。
    <div className="explorer" onClick={() => setSelStripId(null)}>
      <div className="explorer-head" onClick={(e) => e.stopPropagation()}>
        <h2 className="explorer-title"><Compass size={20} /> {t('explorer.title')}</h2>
        <div className="explorer-search">
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setQuery(input.trim()) }}
            placeholder={t('explorer.searchPlaceholder')}
            aria-label={t('explorer.searchPlaceholder')}
          />
          <button className="explorer-search-btn" title={t('explorer.search')} aria-label={t('explorer.search')} onClick={() => setQuery(input.trim())}>
            <Search size={18} />
          </button>
        </div>
        <button className="settings-close" onClick={onClose} title={t('common.close')} aria-label={t('common.close')}><X size={18} /></button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {strips == null ? (
        <p className="explorer-note">{t('common.loading')}</p>
      ) : strips.length === 0 ? (
        <p className="explorer-note">{query ? t('explorer.noResults') : t('explorer.empty')}</p>
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
          {hasMore && (
            <div className="explorer-more">
              <button className="explorer-more-btn" onClick={(e) => { e.stopPropagation(); loadMore() }} disabled={loadingMore}>
                {loadingMore ? t('common.loading') : t('explorer.showMore')}
              </button>
            </div>
          )}
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
