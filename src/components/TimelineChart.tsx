import { useEffect, useState, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { formatRangeAD, type EventItem } from '../api'
import { type WheelAction } from '../lib/settings'
import { oneLine } from '../lib/format'
import {
  fracYear, eventSpan, barEndClasses, buildGridLines, buildCenturyMarks, packLanesOf, packLanesSemiOf, type LaneMode,
  DAY, MIN_YEARS, MAX_YEARS, LABEL_FONT_PX, MAX_GRID_LINES_AT_1000PX, NOW_FADE_PX, BAR_CLAMP,
} from '../lib/timeline'

// ---- 期間バーによる年表表示（項目未選択時にメイン画面へ表示） ----------------
// 中心年(centerYear)と表示幅(yearsVisible)で決まるビューポートに入る項目だけを表示する。
// 単クリック: その行を選択（縁取り表示）するだけ。
// タイトル文字をダブルクリック: その項目の編集画面へ遷移。
// Shift+ホイール: 表示幅（スケール）を拡大・縮小。
export function TimelineChart({ events, selectedId, onSelect, onEdit, centerYear, setCenterYear, yearsVisible, setYearsVisible, invertZoom, wheelPlain, wheelShift, wheelCtrl, zoomFactor, centerRequest, tagColors, laneMode, rowHeight }: {
  events: EventItem[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  onEdit: (e: EventItem) => void
  centerYear: number
  setCenterYear: (updater: (v: number) => number) => void
  yearsVisible: number
  setYearsVisible: (updater: (v: number) => number) => void
  invertZoom: boolean
  wheelPlain: WheelAction
  wheelShift: WheelAction
  wheelCtrl: WheelAction
  zoomFactor: number
  centerRequest: { id: number; n: number } | null
  tagColors: Map<number, string>
  laneMode: LaneMode
  rowHeight: number
}) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const hbarRef = useRef<HTMLDivElement>(null)
  // ネイティブの wheel ハンドラから最新の中心・表示幅を読むための ref
  const viewRef = useRef({ centerYear, yearsVisible })
  viewRef.current = { centerYear, yearsVisible }
  // チャート描画域の幅・高さ（px）。幅はタイトルの端固定、高さは下方向の余白計算に使う。
  const [chartW, setChartW] = useState(0)
  const [chartH, setChartH] = useState(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => { setChartW(el.clientWidth); setChartH(el.clientHeight) }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // タイトル文字幅の概算（px）。CJK は約1em、その他は約0.6em。少し大きめに見積もる。
  const estCacheRef = useRef(new Map<string, number>())
  const estLabelPx = (text: string): number => {
    const cached = estCacheRef.current.get(text)
    if (cached != null) return cached
    let em = 0
    for (const ch of text) em += ch.charCodeAt(0) > 0x2e7f ? 1.0 : 0.6
    const px = em * LABEL_FONT_PX + 10 // 余白・縁取りぶん
    estCacheRef.current.set(text, px)
    return px
  }

  // ホイール操作は設定（修飾キー別の割り当て）に従う。
  // passive:false でページスクロールを抑止するため native で登録。
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (ev: WheelEvent) => {
      // 押されている修飾キーに割り当てられた動作を選ぶ（Ctrl 優先、次に Shift、無ければ修飾なし）
      const action = ev.ctrlKey ? wheelCtrl : ev.shiftKey ? wheelShift : wheelPlain
      // pan / zoom 以外（上下スクロール・なし）はアプリ側で何もせず、ブラウザ既定に任せる
      if (action !== 'pan' && action !== 'zoom') return
      ev.preventDefault()
      // Shift 押下時はブラウザが deltaY を deltaX に変換することがあるため、大きい方を使う
      const delta = Math.abs(ev.deltaY) >= Math.abs(ev.deltaX) ? ev.deltaY : ev.deltaX
      if (delta === 0) return
      const { centerYear: cy, yearsVisible: yv } = viewRef.current
      if (action === 'zoom') {
        // 拡大・縮小。奥に回す(delta>0)と縮小表示。設定で方向を反転できる。
        const zoomOut = invertZoom ? delta < 0 : delta > 0
        const factor = zoomOut ? zoomFactor : 1 / zoomFactor
        const newYV = Math.min(MAX_YEARS, Math.max(MIN_YEARS, yv * factor))
        // カーソルが指す日付（座標）を固定したまま拡大縮小する
        const rect = el.getBoundingClientRect()
        const w = el.clientWidth
        const f = w > 0 ? Math.min(Math.max((ev.clientX - rect.left) / w, 0), 1) : 0.5
        const cursorPos = (cy - yv / 2) + f * yv
        const newCenter = cursorPos - f * newYV + newYV / 2
        viewRef.current = { centerYear: newCenter, yearsVisible: newYV }
        setYearsVisible(() => newYV)
        setCenterYear(() => newCenter)
      } else {
        // 左右にパン。移動量は表示幅に比例させる。
        const newCenter = cy + (delta > 0 ? 1 : -1) * yv / 10
        viewRef.current = { centerYear: newCenter, yearsVisible: yv }
        setCenterYear(() => newCenter)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setYearsVisible, setCenterYear, invertZoom, wheelPlain, wheelShift, wheelCtrl, zoomFactor])

  // 行に複数イベントが載りうるモード（詰め／中間）。off-screen ラベルの省略表示に使う。
  const packed = laneMode !== 'unpacked'
  // レーン構成（行ごとのイベント配列）。
  //   unpacked … 1イベント=1行 / middle … 年表ごとに詰めて縦積み / packed … 全体を詰める
  const lanes = laneMode === 'packed' ? packLanesOf(events)
    : laneMode === 'middle' ? packLanesSemiOf(events, (e) => e.nenpyo_id)
    : events.map((e) => [e])
  // イベント id -> 行（レーン）番号。中央へ移動の縦スクロール計算に使う。
  const laneIndexRef = useRef<Map<number, number>>(new Map())
  const laneIndex = new Map<number, number>()
  lanes.forEach((lane, i) => lane.forEach((e) => laneIndex.set(e.id, i)))
  laneIndexRef.current = laneIndex

  // イベントリストからの「中央へ移動」リクエスト。横はイベント期間の中央を centerYear に、
  // 縦はその行を表示域の中央へスクロール（ズームは変えない）。バークリックでは発生しない。
  useEffect(() => {
    if (!centerRequest) return
    const ev = events.find((x) => x.id === centerRequest.id)
    if (!ev) return
    const { s, end } = eventSpan(ev)
    setCenterYear(() => (s + end) / 2)
    const row = laneIndexRef.current.get(centerRequest.id) ?? 0
    const el = scrollRef.current
    if (el) el.scrollTop = Math.max(0, row * rowHeight + rowHeight / 2 - el.clientHeight / 2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerRequest])

  const rangeStart = centerYear - yearsVisible / 2
  const rangeEnd = centerYear + yearsVisible / 2
  const pct = (y: number) => ((y - rangeStart) / yearsVisible) * 100
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

  // 現在日時の帯（赤）。表示範囲内のときだけ引く。幅はその時のスケールでの「1日」ぶん。
  const now = new Date()
  const nowPos = fracYear(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const nowInView = nowPos >= rangeStart && nowPos <= rangeEnd
  // 帯幅がメイン領域に占める割合（0〜1）。太いほど赤を薄く（透明度を上げる）。
  const nowWidthFrac = DAY / yearsVisible
  // 帯の実ピクセル幅から透明度を決める（割合だと極端にズームインするまで効かないため）。
  // 2px までは濃い赤、NOW_FADE_PX に近づくほど薄く、下限 0.12。
  const nowPxWidth = nowWidthFrac * (chartW || 1000)
  const nowAlpha = Math.max(0.3, 1 - Math.max(0, nowPxWidth - 2) / NOW_FADE_PX)
  // 確定精度ごとの端フェード用に、1日／1月／1年ぶんの実ピクセル幅を CSS 変数で渡す
  // （chartW 未計測時は 0 で、フェードなしにフォールバック）。
  const yearPx = chartW / yearsVisible
  const dayPx = nowWidthFrac * chartW
  const monthPx = yearPx / 12

  // 画面あたりの最大縦線数。メイン領域の横幅 1000px で 25 本、横幅に比例させる。
  const maxGridLines = Math.max(2, Math.round(MAX_GRID_LINES_AT_1000PX * (chartW || 1000) / 1000))
  const { gridLines, bandMarks } = buildGridLines(rangeStart, rangeEnd, yearsVisible, maxGridLines)
  const centuryMarks = buildCenturyMarks(rangeStart, rangeEnd, yearsVisible)

  // 下部の水平スクロールバー: 全イベントの範囲内を左右にパンする。
  let contentMin = Infinity
  let contentMax = -Infinity
  for (const e of events) {
    const { s, end } = eventSpan(e)
    if (s < contentMin) contentMin = s
    if (end > contentMax) contentMax = end
  }
  const hasContent = isFinite(contentMin) && contentMax > contentMin
  const total = hasContent ? contentMax - contentMin : yearsVisible
  const thumbW = Math.max(2, Math.min(100, (yearsVisible / total) * 100)) // つまみ幅(%)
  const panRange = total - yearsVisible                                   // 動ける幅(年)
  const thumbF = panRange > 0 ? clamp((rangeStart - contentMin) / panRange, 0, 1) : 0
  const thumbLeft = thumbF * (100 - thumbW)
  // トラック（つまみ以外＝白くない部分）クリックで、その方向へ1ページ分まとめてスクロール。
  const pageHPan = (e: ReactMouseEvent) => {
    e.preventDefault()
    if (panRange <= 0) return
    const track = hbarRef.current?.getBoundingClientRect()
    if (!track || track.width <= 0) return
    const clickF = (e.clientX - track.left) / track.width // トラック内 0..1
    const thumbStart = thumbLeft / 100
    const thumbEnd = (thumbLeft + thumbW) / 100
    const dir = clickF < thumbStart ? -1 : clickF > thumbEnd ? 1 : 0
    if (!dir) return
    const c = clamp(centerYear + dir * yearsVisible, contentMin + yearsVisible / 2, contentMax - yearsVisible / 2)
    setCenterYear(() => c)
  }
  const startHPan = (e: ReactMouseEvent) => {
    e.preventDefault()
    e.stopPropagation() // つまみのドラッグとトラックのページ送りを二重発火させない
    const track = hbarRef.current?.getBoundingClientRect()
    if (!track || panRange <= 0) return
    const usablePx = track.width * (1 - thumbW / 100)
    if (usablePx <= 0) return
    const startX = e.clientX
    const startCenter = centerYear
    const onMove = (ev: MouseEvent) => {
      const df = (ev.clientX - startX) / usablePx
      const c = clamp(startCenter + df * panRange, contentMin + yearsVisible / 2, contentMax - yearsVisible / 2)
      setCenterYear(() => c)
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

  // キー操作: メイン領域をクリック（フォーカス）した後、矢印キーまたは hjkl でスクロールする。
  //   ← / h … 左へパン、→ / l … 右へパン（ホイールのパンと同じ量。centerYear を動かす）
  //   ↑ / k … 上へ、↓ / j … 下へ縦スクロール（1行ぶん。native の scrollTop を動かす）
  // ブラウザ既定のスクロール（フォーカスした要素の上下移動やページスクロール）は抑止する。
  const onChartKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    // 矢印キーと vim 風 hjkl を同じ方向にまとめる。
    const dir = ({ ArrowLeft: 'left', h: 'left', ArrowRight: 'right', l: 'right',
      ArrowUp: 'up', k: 'up', ArrowDown: 'down', j: 'down' } as const)[e.key]
    if (!dir) return
    const { centerYear: cy, yearsVisible: yv } = viewRef.current
    if (dir === 'left' || dir === 'right') {
      e.preventDefault()
      const nc = cy + (dir === 'right' ? 1 : -1) * yv / 10
      viewRef.current = { centerYear: nc, yearsVisible: yv }
      setCenterYear(() => nc)
    } else {
      const el = scrollRef.current
      if (!el) return
      e.preventDefault()
      el.scrollTop += (dir === 'down' ? 1 : -1) * rowHeight
    }
  }

  // 選択中のイベント（下バーに詳細を表示する）
  const selectedEvent = selectedId != null ? events.find((e) => e.id === selectedId) ?? null : null

  return (
    <div className="chart">
      <div className="chart-head">
        <div className="chart-axis">
          {centuryMarks.map((c, i) => (
            <span key={'c' + i} className="axis-century" style={{ left: `${c.left}%` }}>{c.label}</span>
          ))}
          {bandMarks.map((b, i) => (
            <span key={'b' + i} className="axis-band" style={{ left: `${b.left}%` }}>{b.label}</span>
          ))}
          {gridLines.map((g, i) => (
            <span
              key={i}
              className={g.major ? 'axis-tick major' : 'axis-tick'}
              style={{ left: `${g.left}%` }}
            >
              <span className="axis-unit">{g.bottomLabel}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="chart-mid">
      <div
        className="chart-scroll"
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={onChartKeyDown}
        onClick={() => onSelect(null)}
      >
        {/* 下端に「ビューポート高さ − 1行」の余白を足し、最下段のバーも画面最上部まで上げられるようにする */}
        <div className="chart-body" style={{ paddingBottom: Math.max(0, chartH - rowHeight), ['--day-px' as never]: `${dayPx}px`, ['--month-px' as never]: `${monthPx}px`, ['--year-px' as never]: `${yearPx}px` }}>
          <div className="chart-grid">
            {gridLines.map((g, i) => (
              <div
                key={i}
                className={g.major ? 'chart-grid-line major' : 'chart-grid-line'}
                style={{ left: `${g.left}%` }}
              />
            ))}
            {nowInView && <div className="chart-now-line" style={{ left: `${pct(nowPos)}%`, width: `${nowWidthFrac * 100}%`, background: `rgba(226, 59, 59, ${nowAlpha})` }} />}
          </div>
          {/* レーンごとに1行。通常は1行=1イベント、表示方法トグルが packed/middle の
              ときは重ならないイベントを同じ行にまとめる。バーが画面外でも行は残す。 */}
          {lanes.map((lane, laneIdx) => (
            <div className="chart-row" key={laneIdx}>
              <div className="chart-track">
                {lane.map((e) => {
                  const { s, end } = eventSpan(e)
                  const left = pct(s)
                  const right = pct(end)
                  // バー要素の実描画範囲はビューポート±BAR_CLAMP% に収める（巨大要素対策）。
                  const barLeft = Math.max(left, -BAR_CLAMP)
                  const barWidth = Math.max(0.4, Math.min(right, 100 + BAR_CLAMP) - barLeft)
                  // 色はイベントが属する年表のもの。
                  const barColor = e.nenpyo_id != null ? tagColors.get(e.nenpyo_id) : undefined
                  const title = e.title || t('common.untitled')
                  // バーが完全に画面外なら矢印で方向を示す。
                  // レーン詰め表示（packed/middle）時は文字の重なりを避けるため三角だけ表示。
                  const offLeft = end < rangeStart
                  const offRight = s > rangeEnd
                  const labelText = offLeft
                    ? (packed ? '◀' : `◀ ${title}`)
                    : offRight
                      ? (packed ? '▶' : `${title} ▶`)
                      : title
                  // タイトルの中心位置: 基本はバー中央。ただしタイトル全体が画面内に収まるよう、
                  // また可能ならバーの範囲内に収まるよう左右に「貼り付く」（端で固定される）。
                  const halfPct = chartW > 0 ? (estLabelPx(labelText) / 2) / chartW * 100 : 0
                  const barCenter = (left + right) / 2
                  const lo = Math.max(halfPct, left + halfPct)        // 画面左端・バー左端より内側
                  const hi = Math.min(100 - halfPct, right - halfPct) // 画面右端・バー右端より内側
                  const labelLeft = lo <= hi
                    ? clamp(barCenter, lo, hi)
                    : clamp(barCenter, halfPct, 100 - halfPct)        // バーがタイトルより短いときは画面内に収めるだけ
                  const tip = `${title}（${formatRangeAD(e)}）`
                  const sel = e.id === selectedId
                  // 端の確定精度で見た目を変える（日=ガント風キャップ / 月=軽い角丸 / 年=丸）。
                  const endCls = barEndClasses(e)
                  return (
                    <span key={e.id}>
                      {/* 反応するのは期間バーとタイトルだけ。バー外の余白は無反応。 */}
                      {!offLeft && !offRight && (
                        <div
                          className={'chart-bar' + (sel ? ' selected' : '') + endCls}
                          style={{ left: `${barLeft}%`, width: `${barWidth}%`, ...(barColor ? { background: barColor } : {}) }}
                          title={tip}
                          onClick={(ev) => { ev.stopPropagation(); onSelect(e.id) }}
                        />
                      )}
                      <span
                        className="chart-bar-label"
                        style={{ left: `${labelLeft}%` }}
                        title={tip}
                        onClick={(ev) => { ev.stopPropagation(); onSelect(e.id) }}
                        onDoubleClick={(ev) => { ev.stopPropagation(); onEdit(e) }}
                      >{labelText}</span>
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {hasContent && (
        <div className="chart-hbar" ref={hbarRef} title="ドラッグ／クリックで左右に移動" onMouseDown={pageHPan}>
          <div className="chart-hthumb" style={{ left: `${thumbLeft}%`, width: `${thumbW}%` }} onMouseDown={startHPan} />
        </div>
      )}
      </div>

      <div className="chart-hint hint">
        {selectedEvent ? (
          <div className="chart-sel">
            <div className="chart-sel-head">
              <span className="chart-sel-title">{selectedEvent.title || t('common.untitled')}</span>
              <span className="chart-sel-date">{formatRangeAD(selectedEvent)}</span>
            </div>
            {selectedEvent.detail && <div className="chart-sel-detail">{oneLine(selectedEvent.detail)}</div>}
          </div>
        ) : (
          <span className="chart-hint-text">{t('chart.selectHint')}</span>
        )}
      </div>
    </div>
  )
}
