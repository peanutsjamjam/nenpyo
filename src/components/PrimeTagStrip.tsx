import { useEffect, useState, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { formatRangeAD, type ExploreTag, type ExploreEvent } from '../api'
import { type WheelAction } from '../lib/settings'
import {
  fracYear, eventSpan, barEndClasses, eventsExtent, buildGridLines, buildCenturyMarks, packLanesOf,
  MIN_YEARS, MAX_YEARS, MAX_GRID_LINES_AT_1000PX, BAR_CLAMP,
} from '../lib/timeline'

// ---- プライムイベント表示領域（上バー＋期間バーのみ。下バーなし）--------------
// あるユーザーの、ある年表に含まれるイベントだけを期間バーで表示する。
// 表示範囲はイベント群にフィット（左右に少し余白）。各帯は独立した小さな年表。
export function PrimeTagStrip({ tag, selectedId, onSelect, selected, onSelectStrip, showFollow, onToggleFollow, wheelPlain, wheelShift, wheelCtrl, zoomFactor, invertZoom, packLanes, rowHeight }: {
  tag: ExploreTag
  selectedId: number | null
  onSelect: (ev: ExploreEvent) => void
  selected: boolean
  onSelectStrip: () => void
  // フォローボタンを出すか（自分の年表と、未ログインでは出さない）。
  showFollow: boolean
  onToggleFollow: () => void
  wheelPlain: WheelAction
  wheelShift: WheelAction
  wheelCtrl: WheelAction
  zoomFactor: number
  invertZoom: boolean
  packLanes: boolean
  rowHeight: number
}) {
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  // 選択中だけ操作できる表示ビュー（パン・ズーム）。null のときはイベントにフィット。
  const [view, setView] = useState<{ center: number; yearsVisible: number } | null>(null)
  const viewRef = useRef({ center: 0, yearsVisible: 0 })

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const update = () => setW(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 選択が外れたらフィット表示に戻す。
  useEffect(() => { if (!selected) setView(null) }, [selected])

  // ホイール: 非選択はエクスプローラー全体のスクロールへ転送、選択中は設定の割り当て
  // （メイン画面と同じ：plain/Shift/Ctrl にスクロール/パン/拡大縮小を割り当て）に従う。
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const onWheel = (ev: WheelEvent) => {
      if (!selected) {
        const scroller = el.closest('.explorer-strips') as HTMLElement | null
        if (!scroller) return
        ev.preventDefault()
        const factor = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? scroller.clientHeight : 1
        scroller.scrollTop += ev.deltaY * factor
        return
      }
      const action = ev.ctrlKey ? wheelCtrl : ev.shiftKey ? wheelShift : wheelPlain
      if (action !== 'pan' && action !== 'zoom') return // scroll/none はブラウザ既定に任せる
      ev.preventDefault()
      const delta = Math.abs(ev.deltaY) >= Math.abs(ev.deltaX) ? ev.deltaY : ev.deltaX
      if (delta === 0) return
      const { center: cy, yearsVisible: yv } = viewRef.current
      if (action === 'zoom') {
        const zoomOut = invertZoom ? delta < 0 : delta > 0
        const f = zoomOut ? zoomFactor : 1 / zoomFactor
        const newYV = Math.min(MAX_YEARS, Math.max(MIN_YEARS, yv * f))
        const rect = el.getBoundingClientRect()
        const wpx = el.clientWidth
        const frac = wpx > 0 ? Math.min(Math.max((ev.clientX - rect.left) / wpx, 0), 1) : 0.5
        const cursorPos = (cy - yv / 2) + frac * yv
        setView({ center: cursorPos - frac * newYV + newYV / 2, yearsVisible: newYV })
      } else {
        setView({ center: cy + (delta > 0 ? 1 : -1) * yv / 10, yearsVisible: yv })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [selected, wheelPlain, wheelShift, wheelCtrl, zoomFactor, invertZoom])

  const events = tag.events
  // イベント群にフィットする既定ビュー
  const ext = eventsExtent(events)
  const fitSpan = ext ? Math.max(MIN_YEARS, (ext.max - ext.min) || 1) : 200
  const fitYV = Math.min(MAX_YEARS, Math.max(MIN_YEARS, fitSpan * 1.2)) // 左右に約1割の余白
  const fitCenter = ext ? (ext.min + ext.max) / 2 : fracYear(1, 1, 1)
  // 実際に使う表示ビュー（操作中は view、未操作はフィット）
  const yearsVisible = view ? view.yearsVisible : fitYV
  const center = view ? view.center : fitCenter
  viewRef.current = { center, yearsVisible }

  const rangeStart = center - yearsVisible / 2
  const rangeEnd = center + yearsVisible / 2
  const pct = (y: number) => ((y - rangeStart) / yearsVisible) * 100
  const maxGridLines = Math.max(2, Math.round(MAX_GRID_LINES_AT_1000PX * (w || 800) / 1000))
  const { gridLines, bandMarks } = buildGridLines(rangeStart, rangeEnd, yearsVisible, maxGridLines)
  const centuryMarks = buildCenturyMarks(rangeStart, rangeEnd, yearsVisible)
  // レーン構成。packed のとき重ならないイベントを同じ行にまとめる。
  const lanes = packLanes ? packLanesOf(events) : events.map((e) => [e])
  const rowsVisible = Math.min(Math.max(lanes.length, 1), 5) // 5行を超えたら帯内を縦スクロール

  // 選択中の帯に出す横スクロールバー（本体チャートと同じ仕組み）。
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
  const hbarRef = useRef<HTMLDivElement>(null)
  const contentMin = ext ? ext.min : center
  const contentMax = ext ? ext.max : center
  const total = ext && ext.max > ext.min ? ext.max - ext.min : yearsVisible
  const thumbW = Math.max(2, Math.min(100, (yearsVisible / total) * 100))
  const panRange = total - yearsVisible
  const thumbF = panRange > 0 ? clamp((rangeStart - contentMin) / panRange, 0, 1) : 0
  const thumbLeft = thumbF * (100 - thumbW)
  const setCenter = (c: number) => setView({ center: c, yearsVisible })
  const pageHPan = (e: ReactMouseEvent) => {
    e.preventDefault()
    if (panRange <= 0) return
    const track = hbarRef.current?.getBoundingClientRect()
    if (!track || track.width <= 0) return
    const clickF = (e.clientX - track.left) / track.width
    const dir = clickF < thumbLeft / 100 ? -1 : clickF > (thumbLeft + thumbW) / 100 ? 1 : 0
    if (!dir) return
    setCenter(clamp(center + dir * yearsVisible, contentMin + yearsVisible / 2, contentMax - yearsVisible / 2))
  }
  const startHPan = (e: ReactMouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const track = hbarRef.current?.getBoundingClientRect()
    if (!track || panRange <= 0) return
    const usablePx = track.width * (1 - thumbW / 100)
    if (usablePx <= 0) return
    const startX = e.clientX
    const startCenter = center
    const onMove = (ev: MouseEvent) => {
      const df = (ev.clientX - startX) / usablePx
      setCenter(clamp(startCenter + df * panRange, contentMin + yearsVisible / 2, contentMax - yearsVisible / 2))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className={'strip' + (selected ? ' selected' : '')} onClick={(e) => { e.stopPropagation(); onSelectStrip() }}>
      <div className="strip-head">
        <span className="strip-swatch" style={{ background: tag.color }} />
        <span className="strip-tag">{tag.name}</span>
        <span className="strip-user">@{tag.username}</span>
        <span className="strip-count">{t('common.itemCount', { n: events.length })}</span>
        {showFollow && (
          <button
            className={'strip-follow' + (tag.followed ? ' on' : '')}
            onClick={(e) => { e.stopPropagation(); onToggleFollow() }}
            title={tag.followed ? t('explorer.unfollowTip') : t('explorer.followTip')}
          >
            {tag.followed ? t('explorer.following') : t('explorer.follow')}
          </button>
        )}
      </div>
      <div className="chart-head">
        <div className="chart-axis">
          {centuryMarks.map((c, i) => (
            <span key={'c' + i} className="axis-century" style={{ left: `${c.left}%` }}>{c.label}</span>
          ))}
          {bandMarks.map((b, i) => (
            <span key={'b' + i} className="axis-band" style={{ left: `${b.left}%` }}>{b.label}</span>
          ))}
          {gridLines.map((g, i) => (
            <span key={i} className={g.major ? 'axis-tick major' : 'axis-tick'} style={{ left: `${g.left}%` }}>
              <span className="axis-unit">{g.bottomLabel}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="strip-body" ref={bodyRef} style={{ height: rowsVisible * rowHeight }}>
        <div className="strip-content">
          <div className="chart-grid">
            {gridLines.map((g, i) => (
              <div key={i} className={g.major ? 'chart-grid-line major' : 'chart-grid-line'} style={{ left: `${g.left}%` }} />
            ))}
          </div>
          {events.length === 0 ? (
            <p className="strip-empty">{t('explorer.noEvents')}</p>
          ) : lanes.map((lane, laneIdx) => (
            <div className="chart-row" key={laneIdx}>
              <div className="chart-track">
                {lane.map((e) => {
                  const { s, end } = eventSpan(e)
                  const left = pct(s)
                  const right = pct(end)
                  const barLeft = Math.max(left, -BAR_CLAMP)
                  const barWidth = Math.max(0.4, Math.min(right, 100 + BAR_CLAMP) - barLeft)
                  const title = e.title || t('common.untitled')
                  const tip = `${title}（${formatRangeAD(e)}）`
                  const sel = e.id === selectedId
                  const endCls = barEndClasses(e)
                  return (
                    <span key={e.id}>
                      <div className={'chart-bar' + (sel ? ' selected' : '') + endCls} style={{ left: `${barLeft}%`, width: `${barWidth}%`, background: tag.color }} title={tip} onClick={(ev) => { ev.stopPropagation(); onSelect(e) }} />
                      <span className="chart-bar-label" style={{ left: `${(left + right) / 2}%` }} title={tip} onClick={(ev) => { ev.stopPropagation(); onSelect(e) }}>{title}</span>
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* 選択中の帯だけ、下部に横スクロールバーを表示（ドラッグ／クリックで左右移動）。 */}
      {selected && panRange > 0 && (
        <div className="chart-hbar strip-hbar" ref={hbarRef} onMouseDown={pageHPan}>
          <div className="chart-hthumb" style={{ left: `${thumbLeft}%`, width: `${thumbW}%` }} onMouseDown={startHPan} />
        </div>
      )}
    </div>
  )
}
