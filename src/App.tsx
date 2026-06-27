import { useEffect, useState, useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { ScrollText, Plus, Trash2, LogOut, ChevronRight, ChevronDown, ChevronUp, Settings, X, Pencil, Palette, Compass, FlaskConical } from 'lucide-react'
import { api, formatRangeAD, parseDateText, dateToText, type EventItem, type EventInput, type Tag, type ExploreTag, type ExploreEvent } from './api'
import './App.css'

// 開発用ボタンの表示フラグ。本番で隠す／不要になったら false に（または削除）。
const DEV_BUTTON = true

// ---- ユーザー設定（ブラウザの localStorage に保存。端末ごと） ----------------
type Theme = 'light' | 'dark'
// マウスホイール（修飾キー別）に割り当てる動作
type WheelAction = 'scroll' | 'pan' | 'zoom' | 'none'
const WHEEL_ACTION_LABELS: Record<WheelAction, string> = {
  scroll: '上下スクロール',
  pan: '左右スクロール（パン）',
  zoom: '拡大縮小',
  none: 'なし',
}
// 拡大縮小の倍率（1ノッチあたり）の選択肢
const ZOOM_FACTORS = [1.05, 1.1, 1.2, 1.3, 1.5]
type AppSettings = {
  theme: Theme
  invertZoom: boolean
  wheelPlain: WheelAction
  wheelShift: WheelAction
  wheelCtrl: WheelAction
  zoomFactor: number
  moveClickedIntoView: boolean
}
const SETTINGS_KEY = 'nenpyo-settings'

function loadSettings(): AppSettings {
  const defaults: AppSettings = {
    theme: window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    invertZoom: false,
    wheelPlain: 'scroll',
    wheelShift: 'pan',
    wheelCtrl: 'zoom',
    zoomFactor: 1.2,
    moveClickedIntoView: false,
  }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...defaults, ...JSON.parse(raw) }
  } catch { /* 壊れていたら既定値 */ }
  return defaults
}

export default function App() {
  const [username, setUsername] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.me()
      .then((u) => setUsername(u.username))
      .catch(() => setUsername(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="splash">読み込み中…</div>
  if (!username) return <AuthView onAuthed={setUsername} />
  return <Timeline username={username} onLogout={() => setUsername(null)} />
}

// ---- ログイン / 新規登録 ----------------------------------------------------
function AuthView({ onAuthed }: { onAuthed: (username: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)

  const switchMode = (m: 'login' | 'register') => {
    setMode(m)
    setError('')
    setPassword2('')
    usernameRef.current?.focus()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (mode === 'register' && password !== password2) {
      setError('パスワードが一致しません')
      return
    }
    setBusy(true)
    try {
      const fn = mode === 'login' ? api.login : api.register
      const u = await fn(username, password)
      onAuthed(u.username)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo"><ScrollText size={28} /> <span>nenpyo</span></div>
        <p className="auth-sub">自分だけの歴史年表をつくろう</p>

        <div className="auth-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>ログイン</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>新規登録</button>
        </div>

        <label>ユーザー名
          <input ref={usernameRef} value={username} maxLength={50} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
        </label>
        <label>パスワード
          <input type="password" value={password} maxLength={128} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </label>
        {mode === 'register' && (
          <label>パスワード（確認）
            <input type="password" value={password2} maxLength={128} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
          </label>
        )}

        {error && <div className="auth-error">{error}</div>}

        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'ログイン' : '登録してはじめる'}
        </button>
      </form>
    </div>
  )
}

// ---- 暦（1582年より前はユリウス暦、以降はグレゴリオ暦でうるう年判定）------------
// 月ごとに実際の日数を持つ（2月は平年28日・閏年29日）。
// 注: グレゴリオ改暦(1582/10)で消えた10日間のズレ自体はモデル化していない（閏年判定のみ切替）。
function isLeap(year: number): boolean {
  if (year < 1582) return year % 4 === 0 // ユリウス暦: 4で割り切れれば閏年
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 // グレゴリオ暦
}
function daysInYear(year: number): number { return isLeap(year) ? 366 : 365 }
function monthLengths(year: number): number[] {
  return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
}
function daysInMonth(year: number, month: number): number { return monthLengths(year)[month - 1] }

// 年月日を「時間軸の座標」に変換（バー・グリッドの位置計算用）。単位は「年」。
// 西暦0年は存在しないので AD1/1/1 を座標 0 とし、AD と BC を隙間なく連続させる。
// 年内は通算日(0始まり)をその年の実日数で割った割合で表す（=各月が実際の長さを持つ）。
//   AD年(>=1): pos = (year-1) + 年内割合 / BC年(<=-1): pos = year + 年内割合
// 月日が無ければ年頭扱い。
function fracYear(year: number, month: number | null, day: number | null): number {
  const ml = monthLengths(year)
  let doy = (day ?? 1) - 1                 // 0 始まりの通算日
  const m = (month ?? 1) - 1
  for (let i = 0; i < m; i++) doy += ml[i]
  const base = year >= 1 ? year - 1 : year
  return base + doy / daysInYear(year)
}

// 時間軸の座標 → 年・月・日（fracYear の逆変換）。
function posToYMD(pos: number): { year: number; month: number; day: number } {
  const base = Math.floor(pos)                       // AD: year-1, BC: year
  const year = pos >= 0 ? base + 1 : base
  const diy = daysInYear(year)
  let doy = Math.round((pos - base) * diy)            // 0 始まりの通算日
  if (doy < 0) doy = 0
  if (doy >= diy) doy = diy - 1                       // 丸めで翌年頭に出ないよう抑える
  const ml = monthLengths(year)
  let month = 1
  for (let i = 0; i < 12; i++) {
    if (doy < ml[i]) { month = i + 1; break }
    doy -= ml[i]
  }
  return { year, month, day: doy + 1 }
}
// 時間軸の座標 → 年・月（日は捨てる）。
function posToYM(pos: number): { year: number; month: number } {
  const { year, month } = posToYMD(pos)
  return { year, month }
}

// 上バー（グリッド線）用の年表記。BC の前／AD の後ろの空白を詰める。1000年以上は AD なし。
function gridYearLabel(year: number): string {
  if (year < 0) return `${-year}BC`
  if (year >= 1000) return `${year}`
  return `AD${year}`
}

// グリッド刻みとズーム範囲（座標=年単位）。最小は1日、最大は10万年スケール。
const DAY = 1 / 366                   // 公称1日（刻み選択・最小ズーム・現在帯幅用。実日幅は年で可変）
const MONTH = 1 / 12                  // 公称1ヶ月（刻み選択用）
const GRID_STEPS = [DAY, MONTH, 1, 5, 10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000]
const MIN_YEARS = DAY                 // 表示幅の下限（約1日）
const MAX_YEARS = 40000               // 表示幅の上限
const LABEL_FONT_PX = 14              // 期間バー内タイトルの文字サイズ（CSS と一致させる）
const ROW_PX = 34                    // 1行（期間バー行）の高さ（CSS .chart-row と一致させる）
const MAX_GRID_LINES_AT_1000PX = 25  // メイン領域の横幅 1000px あたりの縦線の最大本数（幅に比例）
const NOW_FADE_PX = 24               // 現在帯（赤）がこのpx幅に近づくほど薄くする（小さいほど早く薄くなる）

// 指定された最も細かい単位の「座標上の幅」（日=1/年日数、月=その月の実日数/年日数、年=1）
function unitWidth(year: number, month: number | null, day: number | null): number {
  if (day != null) return 1 / daysInYear(year)
  if (month != null) return daysInMonth(year, month) / daysInYear(year)
  return 1
}
// バー位置計算に必要な日付フィールドだけの構造的な型（EventItem も ExploreEvent も満たす）。
type EventDates = {
  start_year: number; start_month: number | null; start_day: number | null
  end_year: number | null; end_month: number | null; end_day: number | null
}
// バーの占有区間 [s, end)。終了は「その単位の終わり＝次の単位の頭」まで広げる。
function eventSpan(e: EventDates): { s: number; end: number } {
  const s = fracYear(e.start_year, e.start_month, e.start_day)
  const end = e.end_year == null
    ? s + unitWidth(e.start_year, e.start_month, e.start_day)
    : fracYear(e.end_year, e.end_month, e.end_day) + unitWidth(e.end_year, e.end_month, e.end_day)
  return { s, end }
}

type GridLine = { left: number; major: boolean; topLabel: string; bottomLabel: string }
// 上バー（グリッド線）の本数・ラベルを、表示範囲から計算する。
// 線が maxGridLines 以内に収まる最も細かい刻みを選び、年/月/日のラベルを付ける。
function buildGridLines(rangeStart: number, rangeEnd: number, yearsVisible: number, maxGridLines: number): GridLine[] {
  const lineCap = maxGridLines + 8 // 安全用の打ち切り
  const pct = (y: number) => ((y - rangeStart) / yearsVisible) * 100
  let gridStep = GRID_STEPS[GRID_STEPS.length - 1]
  for (const iv of GRID_STEPS) {
    if (yearsVisible / iv <= maxGridLines - 1) { gridStep = iv; break }
  }
  const gridLines: GridLine[] = []
  if (gridStep >= 1) {
    // 年グリッド: 「丸い年（刻みの倍数）」＋ AD1 に線を引く（西暦0年は無い）。
    const step = gridStep
    const yStart = posToYM(rangeStart).year
    const yEnd = posToYM(rangeEnd).year
    const years = new Set<number>()
    for (let y = Math.floor(yStart / step) * step - step; y <= Math.ceil(yEnd / step) * step + step; y += step) {
      if (y !== 0) years.add(y) // 0年は存在しない
    }
    years.add(1) // AD1 は常に
    for (const y of Array.from(years).sort((a, b) => a - b)) {
      const p = y >= 1 ? y - 1 : y // その年の頭の座標（AD は -1 補正）
      if (p < rangeStart || p > rangeEnd || gridLines.length >= lineCap) continue
      gridLines.push({ left: pct(p), major: y === 1, topLabel: '', bottomLabel: gridYearLabel(y) })
    }
  } else if (gridStep >= MONTH) {
    // 月グリッド: 実際の各月1日に線を引く（月幅は実際の長さに比例）。1月の上に年。
    const start = posToYMD(rangeStart)
    let y = start.year, m = start.month
    while (gridLines.length < lineCap) {
      const p = fracYear(y, m, 1)
      if (p > rangeEnd) break
      if (p >= rangeStart) {
        gridLines.push({
          left: pct(p), major: y === 1 && m === 1,
          topLabel: m === 1 ? gridYearLabel(y) : '', bottomLabel: `${m}月`,
        })
      }
      m++; if (m > 12) { m = 1; y++; if (y === 0) y = 1 } // 西暦0年は飛ばす
    }
  } else {
    // 日グリッド: 実際の各日に線を引く（その月の実日数まで＝偽の29/30/31日は出ない）。
    const start = posToYMD(rangeStart)
    let y = start.year, m = start.month, d = start.day
    while (gridLines.length < lineCap) {
      const p = fracYear(y, m, d)
      if (p > rangeEnd) break
      if (p >= rangeStart) {
        let topLabel = ''
        if (d === 1) topLabel = m === 1 ? `${gridYearLabel(y)} 1月` : `${m}月`
        gridLines.push({ left: pct(p), major: y === 1 && m === 1 && d === 1, topLabel, bottomLabel: `${d}日` })
      }
      d++
      if (d > daysInMonth(y, m)) { d = 1; m++; if (m > 12) { m = 1; y++; if (y === 0) y = 1 } }
    }
  }
  return gridLines
}

// イベント群の占有範囲（座標）。空なら null。
function eventsExtent(events: EventDates[]): { min: number; max: number } | null {
  let min = Infinity, max = -Infinity
  for (const e of events) {
    const { s, end } = eventSpan(e)
    if (s < min) min = s
    if (end > max) max = end
  }
  return isFinite(min) && max > min ? { min, max } : (isFinite(min) ? { min, max: min } : null)
}

// 改行を空白1つに置き換えて1行化する（下バーの詳細表示用。一覧性を上げる）。
const oneLine = (s: string) => s.replace(/\r\n|\r|\n/g, ' ')

// ---- 期間バーによる年表表示（項目未選択時にメイン画面へ表示） ----------------
// 中心年(centerYear)と表示幅(yearsVisible)で決まるビューポートに入る項目だけを表示する。
// 単クリック: その行を選択（縁取り表示）するだけ。
// タイトル文字をダブルクリック: その項目の編集画面へ遷移。
// Shift+ホイール: 表示幅（スケール）を拡大・縮小。
function TimelineChart({ events, selectedId, onSelect, onEdit, centerYear, setCenterYear, yearsVisible, setYearsVisible, invertZoom, wheelPlain, wheelShift, wheelCtrl, zoomFactor, devOverlay, centerRequest, tagColors }: {
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
  devOverlay: boolean
  centerRequest: { id: number; n: number } | null
  tagColors: Map<number, string>
}) {
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

  // イベントリストからの「中央へ移動」リクエスト。横はイベント期間の中央を centerYear に、
  // 縦はその行を表示域の中央へスクロール（ズームは変えない）。バークリックでは発生しない。
  useEffect(() => {
    if (!centerRequest) return
    const idx = events.findIndex((ev) => ev.id === centerRequest.id)
    if (idx < 0) return
    const { s, end } = eventSpan(events[idx])
    setCenterYear(() => (s + end) / 2)
    const el = scrollRef.current
    if (el) el.scrollTop = Math.max(0, idx * ROW_PX + ROW_PX / 2 - el.clientHeight / 2)
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

  // 画面あたりの最大縦線数。メイン領域の横幅 1000px で 25 本、横幅に比例させる。
  const maxGridLines = Math.max(2, Math.round(MAX_GRID_LINES_AT_1000PX * (chartW || 1000) / 1000))
  const gridLines = buildGridLines(rangeStart, rangeEnd, yearsVisible, maxGridLines)

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

  // 選択中のイベント（下バーに詳細を表示する）
  const selectedEvent = selectedId != null ? events.find((e) => e.id === selectedId) ?? null : null

  return (
    <div className="chart">
      <div className="chart-head">
        {devOverlay && <div className="dev-box"><span className="dev-label">上バー</span></div>}
        <div className="chart-axis">
          {gridLines.map((g, i) => (
            <span
              key={i}
              className={g.major ? 'axis-tick major' : 'axis-tick'}
              style={{ left: `${g.left}%` }}
            >
              {g.topLabel && <span className="axis-year">{g.topLabel}</span>}
              <span className="axis-unit">{g.bottomLabel}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="chart-mid">
        {devOverlay && <div className="dev-box"><span className="dev-label">メイン領域</span></div>}
      <div
        className="chart-scroll"
        ref={scrollRef}
        onClick={() => onSelect(null)}
      >
        {/* 下端に「ビューポート高さ − 1行」の余白を足し、最下段のバーも画面最上部まで上げられるようにする */}
        <div className="chart-body" style={{ paddingBottom: Math.max(0, chartH - ROW_PX) }}>
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
          {/* 全イベントを常に1行ずつ表示（並び順固定）。バーが画面外でも行は残し、
              タイトルは近い側の端に寄せて表示する。 */}
          {events.map((e) => {
            const { s, end } = eventSpan(e)
            const left = pct(s)
            const right = pct(end)
            const width = Math.max(0.4, right - left)
            // 色はイベントが属する年表のもの。tag_ids から最初に見つかった年表の色を使う。
            const barColor = e.tag_ids.map((id) => tagColors.get(id)).find(Boolean)
            const title = e.title || '（無題）'
            // バーが完全に画面外なら矢印で方向を示す
            const offLeft = end < rangeStart
            const offRight = s > rangeEnd
            const labelText = offLeft ? `◀ ${title}` : offRight ? `${title} ▶` : title
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
            return (
              <div
                className={e.id === selectedId ? 'chart-row selected' : 'chart-row'}
                key={e.id}
              >
                <div className="chart-track">
                  {/* 反応するのは期間バーとタイトルだけ。バー外の余白は無反応。 */}
                  {!offLeft && !offRight && (
                    <div
                      className="chart-bar"
                      style={{ left: `${left}%`, width: `${width}%`, ...(barColor ? { background: barColor } : {}) }}
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
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {hasContent && (
        <div className="chart-hbar" ref={hbarRef} title="ドラッグ／クリックで左右に移動" onMouseDown={pageHPan}>
          <div className="chart-hthumb" style={{ left: `${thumbLeft}%`, width: `${thumbW}%` }} onMouseDown={startHPan} />
        </div>
      )}
      </div>

      <div className="chart-hint hint">
        {devOverlay && <div className="dev-box"><span className="dev-label">下バー</span></div>}
        {selectedEvent ? (
          <div className="chart-sel">
            <div className="chart-sel-head">
              <span className="chart-sel-title">{selectedEvent.title || '（無題）'}</span>
              <span className="chart-sel-date">{formatRangeAD(selectedEvent)}</span>
            </div>
            {selectedEvent.detail && <div className="chart-sel-detail">{oneLine(selectedEvent.detail)}</div>}
          </div>
        ) : (
          <span className="chart-hint-text">イベントを選択すると詳細を表示します</span>
        )}
      </div>
    </div>
  )
}

// ---- 設定画面（メイン領域に表示） ------------------------------------------
function SettingsPanel({ settings, setSettings, onClose }: {
  settings: AppSettings
  setSettings: (updater: (s: AppSettings) => AppSettings) => void
  onClose: () => void
}) {
  // どの修飾キーにも「拡大縮小」が割り当てられていなければ、倍率・反転は無効化
  const zoomUsed = settings.wheelPlain === 'zoom' || settings.wheelShift === 'zoom' || settings.wheelCtrl === 'zoom'
  return (
    <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
      <div className="settings-head">
        <h2 className="settings-title">設定</h2>
        <button className="settings-close" onClick={onClose}>閉じる</button>
      </div>

      <section className="settings-section">
        <h3 className="settings-label">テーマ</h3>
        <div className="settings-section-body">
        <div className="theme-options">
          {(['light', 'dark'] as Theme[]).map((t) => (
            <button
              key={t}
              className={'theme-option' + (settings.theme === t ? ' selected' : '')}
              onClick={() => setSettings((s) => ({ ...s, theme: t }))}
            >
              {t === 'light' ? 'ライトモード' : 'ダークモード'}
            </button>
          ))}
        </div>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-label">マウスホイール</h3>
        <div className="settings-section-body">
        {([
          ['wheelPlain', 'マウスホイール'],
          ['wheelShift', 'Shift＋マウスホイール'],
          ['wheelCtrl', 'Ctrl＋マウスホイール'],
        ] as [keyof AppSettings, string][]).map(([key, label]) => (
          <div className="wheel-row" key={key}>
            <span className="wheel-row-label">{label}</span>
            <select
              className="wheel-select"
              value={settings[key] as WheelAction}
              onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value as WheelAction }))}
            >
              {(Object.keys(WHEEL_ACTION_LABELS) as WheelAction[]).map((a) => (
                <option key={a} value={a}>{WHEEL_ACTION_LABELS[a]}</option>
              ))}
            </select>
          </div>
        ))}
        <div className={'wheel-row' + (zoomUsed ? '' : ' disabled')}>
          <span className="wheel-row-label">拡大縮小の倍率</span>
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
          <span>拡大・縮小の向きを逆にする</span>
          <input
            type="checkbox"
            disabled={!zoomUsed}
            checked={settings.invertZoom}
            onChange={(e) => setSettings((s) => ({ ...s, invertZoom: e.target.checked }))}
          />
        </label>
        <p className="settings-note">
          ホイールを手前に回すと拡大します（チェックで反転）。
        </p>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-label">イベントリスト</h3>
        <div className="settings-section-body">
          <label className="settings-toggle">
            <span>クリックしたイベントを画面内に移動させる</span>
            <input
              type="checkbox"
              checked={settings.moveClickedIntoView}
              onChange={(e) => setSettings((s) => ({ ...s, moveClickedIntoView: e.target.checked }))}
            />
          </label>
        </div>
      </section>

      <p className="settings-note">テーマ・操作の設定はこのブラウザに保存されます。</p>
    </div>
  )
}

// ---- プライムイベント表示領域（上バー＋期間バーのみ。下バーなし）--------------
// あるユーザーの、ある年表に含まれるイベントだけを期間バーで表示する。
// 表示範囲はイベント群にフィット（左右に少し余白）。各帯は独立した小さな年表。
function PrimeTagStrip({ tag, selectedId, onSelect, selected, onSelectStrip }: {
  tag: ExploreTag
  selectedId: number | null
  onSelect: (ev: ExploreEvent) => void
  selected: boolean
  onSelectStrip: () => void
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const update = () => setW(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 非選択の帯は、ホイールで帯内をスクロールさせない。スクロールバーは見せたままにし、
  // ホイール量はエクスプローラー全体（.explorer-strips）のスクロールへ転送する。
  useEffect(() => {
    const el = bodyRef.current
    if (!el || selected) return // 選択中はブラウザ既定（帯内スクロール）に任せる
    const onWheel = (ev: WheelEvent) => {
      const scroller = el.closest('.explorer-strips') as HTMLElement | null
      if (!scroller) return
      ev.preventDefault()
      const factor = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? scroller.clientHeight : 1
      scroller.scrollTop += ev.deltaY * factor
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [selected])

  const events = tag.events
  const ext = eventsExtent(events)
  const span = ext ? Math.max(MIN_YEARS, (ext.max - ext.min) || 1) : 200
  const yearsVisible = Math.min(MAX_YEARS, Math.max(MIN_YEARS, span * 1.2)) // 左右に約1割の余白
  const center = ext ? (ext.min + ext.max) / 2 : fracYear(1, 1, 1)
  const rangeStart = center - yearsVisible / 2
  const rangeEnd = center + yearsVisible / 2
  const pct = (y: number) => ((y - rangeStart) / yearsVisible) * 100
  const maxGridLines = Math.max(2, Math.round(MAX_GRID_LINES_AT_1000PX * (w || 800) / 1000))
  const gridLines = buildGridLines(rangeStart, rangeEnd, yearsVisible, maxGridLines)
  const rowsVisible = Math.min(Math.max(events.length, 1), 5) // 5行を超えたら帯内を縦スクロール

  return (
    <div className={'strip' + (selected ? ' selected' : '')} onClick={(e) => { e.stopPropagation(); onSelectStrip() }}>
      <div className="strip-head">
        <span className="strip-swatch" style={{ background: tag.color }} />
        <span className="strip-tag">{tag.name}</span>
        <span className="strip-user">{tag.username}</span>
        <span className="strip-count">{events.length}件</span>
      </div>
      <div className="chart-head">
        <div className="chart-axis">
          {gridLines.map((g, i) => (
            <span key={i} className={g.major ? 'axis-tick major' : 'axis-tick'} style={{ left: `${g.left}%` }}>
              {g.topLabel && <span className="axis-year">{g.topLabel}</span>}
              <span className="axis-unit">{g.bottomLabel}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="strip-body" ref={bodyRef} style={{ height: rowsVisible * ROW_PX }}>
        <div className="strip-content">
          <div className="chart-grid">
            {gridLines.map((g, i) => (
              <div key={i} className={g.major ? 'chart-grid-line major' : 'chart-grid-line'} style={{ left: `${g.left}%` }} />
            ))}
          </div>
          {events.length === 0 ? (
            <p className="strip-empty">イベントなし</p>
          ) : events.map((e) => {
            const { s, end } = eventSpan(e)
            const left = pct(s)
            const right = pct(end)
            const width = Math.max(0.4, right - left)
            const title = e.title || '（無題）'
            const tip = `${title}（${formatRangeAD(e)}）`
            return (
              <div className={'chart-row' + (e.id === selectedId ? ' selected' : '')} key={e.id}>
                <div className="chart-track">
                  <div className="chart-bar" style={{ left: `${left}%`, width: `${width}%`, background: tag.color }} title={tip} onClick={() => onSelect(e)} />
                  <span className="chart-bar-label" style={{ left: `${(left + right) / 2}%` }} title={tip} onClick={() => onSelect(e)}>{title}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---- エクスプローラー（他ユーザーの年表を見ていく）--------------
function Explorer({ onClose }: { onClose: () => void }) {
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

  return (
    <div className="explorer">
      <div className="explorer-head">
        <h2 className="explorer-title"><Compass size={20} /> エクスプローラー</h2>
        <button className="settings-close" onClick={onClose} title="閉じる" aria-label="閉じる"><X size={18} /></button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {strips == null ? (
        <p className="explorer-note">読み込み中…</p>
      ) : strips.length === 0 ? (
        <p className="explorer-note">表示できる年表がありません。</p>
      ) : (
        <div className="explorer-strips" onClick={() => setSelStripId(null)}>
          {strips.map((s) => (
            <PrimeTagStrip
              key={s.tag_id}
              tag={s}
              selectedId={sel?.ev.id ?? null}
              onSelect={(ev) => setSel({ ev, username: s.username, tagName: s.name, color: s.color })}
              selected={selStripId === s.tag_id}
              onSelectStrip={() => setSelStripId(s.tag_id)}
            />
          ))}
        </div>
      )}
      <div className="explorer-foot">
        {sel ? (
          <div className="chart-sel">
            <div className="chart-sel-head">
              <span className="strip-swatch" style={{ background: sel.color }} />
              <span className="chart-sel-title">{sel.ev.title || '（無題）'}</span>
              <span className="chart-sel-date">{formatRangeAD(sel.ev)}</span>
              <span className="chart-sel-meta">{sel.username} / {sel.tagName}</span>
            </div>
            {sel.ev.detail && <div className="chart-sel-detail">{oneLine(sel.ev.detail)}</div>}
          </div>
        ) : (
          <span className="chart-hint-text">イベントを選択すると詳細を表示します</span>
        )}
      </div>
    </div>
  )
}

// ---- 年表本体 --------------------------------------------------------------
function Timeline({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [events, setEvents] = useState<EventItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [chartSelectedId, setChartSelectedId] = useState<number | null>(null)
  // 年表チャートの表示ビュー。中心はデフォルトで西暦1年1月1日（= 小数年 1.0）。
  const [centerYear, setCenterYear] = useState(fracYear(1, 1, 1))
  const [yearsVisible, setYearsVisible] = useState(2000)
  // 開始・終了は1つのテキストとして編集し、保存時に年月日へ解析する
  const [startText, setStartText] = useState('')
  const [endText, setEndText] = useState('')
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [isNew, setIsNew] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDeleteTagId, setConfirmDeleteTagId] = useState<number | null>(null)
  // タグ一覧と、編集中イベントに付けるタグID
  const [tags, setTags] = useState<Tag[]>([])
  const [formTagIds, setFormTagIds] = useState<number[]>([])
  const [addingTag, setAddingTag] = useState(false) // 「タグの追加」モーダルを開いているか
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState<string | null>(null) // null=色なし(prime=false)
  const [editingTagId, setEditingTagId] = useState<number | null>(null)
  const [editTagName, setEditTagName] = useState('')
  // 左サイドバーの一覧の畳み状態
  const [timelinesCollapsed, setTimelinesCollapsed] = useState(false)
  // 年表ごとの「配下イベントを展開しているか」（年表 id の集合）
  const [expandedTimelines, setExpandedTimelines] = useState<Set<number>>(new Set())
  const toggleTimelineOpen = (id: number) => setExpandedTimelines((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  // 開発用: メイン領域を可視化するオーバーレイ
  const [devOverlay, setDevOverlay] = useState(false)
  // イベントリストのクリックでチャートを中央へ寄せるリクエスト（n でトリガー）
  const [centerReq, setCenterReq] = useState<{ id: number; n: number } | null>(null)
  // エクスプローラー（他ユーザーの年表を探す）画面の表示
  const [showExplorer, setShowExplorer] = useState(false)
  // 設定画面の表示と、ユーザー設定（テーマ等）
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(loadSettings)

  // 左サイドバーの幅（ドラッグで変更、localStorage に保存）
  const SIDEBAR_KEY = 'nenpyo-sidebar-width'
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const v = Number(localStorage.getItem(SIDEBAR_KEY))
    return v >= 180 && v <= 800 ? v : 320
  })
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, String(Math.round(sidebarWidth))) } catch { /* 無視 */ }
  }, [sidebarWidth])

  // 仕切りをドラッグして左欄の幅を変える
  const startResize = (e: ReactMouseEvent) => {
    e.preventDefault()
    const onMove = (ev: MouseEvent) => {
      const rect = bodyRef.current?.getBoundingClientRect()
      if (!rect) return
      // 左欄は最小180px、メイン側に最低280px残す
      const w = Math.min(Math.max(ev.clientX - rect.left, 180), rect.width - 280)
      setSidebarWidth(w)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // tag_id -> 色 の対応（期間バー・ドットの着色に使う）。年表はすべて色を持つ。
  const tagColors = new Map(tags.map((t) => [t.id, t.color]))
  // 年表一覧（ユーザーが決めた並び順 sort_order）。
  const timelines = [...tags].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)

  // イベントが属する年表の id（最大1つ）。無ければ undefined。
  const timelineIdOf = (e: EventItem) => e.tag_ids.find((id) => tagColors.has(id))

  // 年表ごとの所属イベント（開始順。events はバックエンドで開始順）。
  const eventsByTimeline = new Map<number, EventItem[]>()
  for (const e of events) {
    const id = timelineIdOf(e)
    if (id != null) {
      const arr = eventsByTimeline.get(id)
      if (arr) arr.push(e); else eventsByTimeline.set(id, [e])
    }
  }
  // 左の一覧の並び: 年表ごとにまとめ、その後に未所属。
  const listEvents = [
    ...timelines.flatMap((t) => events.filter((e) => timelineIdOf(e) === t.id)),
    ...events.filter((e) => timelineIdOf(e) == null),
  ]

  // 設定をドキュメントへ反映＆ localStorage に保存
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme)
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* 無視 */ }
  }, [settings])

  const resetForm = (s = '', e = '', t = '', d = '') => {
    setStartText(s); setEndText(e); setTitle(t); setDetail(d)
  }

  const reload = useCallback(async () => {
    try {
      setEvents(await api.listEvents())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const reloadTags = useCallback(async () => {
    try {
      setTags(await api.listTags())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => { reload(); reloadTags() }, [reload, reloadTags])

  // ---- 自動保存 ------------------------------------------------------------
  // テキスト欄はフォーカスが外れたとき、タグはクリックされたときに 0.5 秒後を予約し、
  // その時点のフォーム内容で作成/更新する。予約が重なれば最後のものだけ走る（デバウンス）。
  const saveTimer = useRef<number | null>(null)
  const savingRef = useRef(false)
  const autoSaveRef = useRef<() => void>(() => {})

  const scheduleSave = useCallback(() => {
    if (saveTimer.current != null) clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null
      autoSaveRef.current()
    }, 500)
  }, [])

  const autoSave = useCallback(async () => {
    let input: EventInput
    try {
      const start = parseDateText(startText)
      const end = parseDateText(endText)
      if (start.year == null) {
        // 開始年が無いと保存できない。新規で未入力ならそっと無視、入力途中ならエラー表示。
        if (startText.trim() !== '') setError('開始の年は必須です')
        return
      }
      setError('')
      input = {
        start_year: start.year, start_month: start.month, start_day: start.day,
        end_year: end.year, end_month: end.month, end_day: end.day,
        title, detail, tag_ids: formTagIds,
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return
    }
    if (savingRef.current) { scheduleSave(); return } // 進行中なら完了後にやり直す
    savingRef.current = true
    try {
      if (isNew) {
        const created = await api.createEvent(input)
        // 以後は更新扱いに。入力途中のテキストは保持したいので resetForm はしない。
        setSelectedId(created.id)
        setIsNew(false)
        setFormTagIds(created.tag_ids)
        await reload()
      } else if (selectedId != null) {
        await api.updateEvent(selectedId, input)
        await reload()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      savingRef.current = false
    }
  }, [startText, endText, title, detail, formTagIds, isNew, selectedId, reload, scheduleSave])

  useEffect(() => { autoSaveRef.current = autoSave }, [autoSave])

  // 別イベントへ切り替える/閉じる前に、予約済みの保存があれば即実行して取りこぼしを防ぐ。
  const flushSave = () => {
    if (saveTimer.current != null) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      autoSaveRef.current()
    }
  }
  // 予約済みの保存を破棄する（削除時など、保存させたくないとき）。
  const cancelSave = () => {
    if (saveTimer.current != null) { clearTimeout(saveTimer.current); saveTimer.current = null }
  }

  const selectEvent = (e: EventItem) => {
    flushSave()
    setShowSettings(false)
    setSelectedId(e.id)
    setIsNew(false)
    setConfirmDelete(false)
    setFormTagIds(e.tag_ids)
    resetForm(
      dateToText(e.start_year, e.start_month, e.start_day),
      dateToText(e.end_year, e.end_month, e.end_day),
      e.title, e.detail,
    )
  }

  // 新規イベント追加。年表 id を渡すと、その年表に属する状態で開く。
  const startNew = (timelineId?: number) => {
    flushSave()
    setShowSettings(false)
    setSelectedId(null)
    setIsNew(true)
    setConfirmDelete(false)
    setFormTagIds(timelineId != null ? [timelineId] : [])
    resetForm()
  }

  // 入力・編集画面を閉じて年表チャートへ戻る
  const closeEditor = () => {
    flushSave()
    setSelectedId(null)
    setIsNew(false)
    setConfirmDelete(false)
    setError('')
    setFormTagIds([])
    resetForm()
  }

  // 年表編集中に色見本をクリックして色を選んだとき: 色を設定（即時保存）
  const pickTagColor = async (t: Tag, color: string) => {
    try {
      await api.updateTag(t.id, { name: t.name, color })
      await reloadTags()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // 年表の並びを上(-1)/下(+1)へ入れ替えて保存する
  const moveTimeline = async (id: number, dir: -1 | 1) => {
    const ids = timelines.map((t) => t.id)
    const i = ids.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    try {
      setTags(await api.reorderTags(ids))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const deleteTag = async (id: number) => {
    if (tagSaveTimer.current != null) { clearTimeout(tagSaveTimer.current); tagSaveTimer.current = null }
    try {
      await api.deleteTag(id)
      setFormTagIds((ids) => ids.filter((x) => x !== id))
      setEditingTagId(null)
      await reloadTags()
      await reload() // イベントの tag_ids も更新される
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const startEditTag = (t: Tag) => {
    setError('')
    setAddingTag(false)
    setEditingTagId(t.id)
    setEditTagName(t.name)
  }

  // タグの追加/編集モーダルのタグ名: フォーカスが外れた 0.5 秒後にその内容で保存する（デバウンス）。
  const tagSaveTimer = useRef<number | null>(null)
  const tagAutoSaveRef = useRef<() => void>(() => {})

  const scheduleTagSave = useCallback(() => {
    if (tagSaveTimer.current != null) clearTimeout(tagSaveTimer.current)
    tagSaveTimer.current = window.setTimeout(() => {
      tagSaveTimer.current = null
      tagAutoSaveRef.current()
    }, 500)
  }, [])

  const autoSaveTag = useCallback(async () => {
    if (addingTag) {
      // 追加モード: 名前があれば作成し、以後はそのタグの編集として扱う（イベント追加と同じ流れ）。
      const name = newTagName.trim()
      if (name === '') return
      try {
        const created = await api.createTag({ name, color: newTagColor ?? '#9a6b3f' })
        await reloadTags()
        setAddingTag(false)
        setEditingTagId(created.id)
        setEditTagName(created.name)
        setNewTagName(''); setNewTagColor(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
      return
    }
    if (editingTagId == null) return
    const t = tags.find((x) => x.id === editingTagId)
    if (!t) return
    const name = editTagName.trim()
    if (name === '' || name === t.name) return // 空・変更なしは何もしない
    try {
      // 名前のみ変更。色は現状を維持して送る。
      await api.updateTag(t.id, { name, color: t.color })
      await reloadTags()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [addingTag, newTagName, newTagColor, editingTagId, editTagName, tags, reloadTags])

  useEffect(() => { tagAutoSaveRef.current = autoSaveTag }, [autoSaveTag])

  // タグの追加/編集モーダルを閉じる。
  const closeTagEditor = () => {
    const pending = tagSaveTimer.current != null
    if (pending) { clearTimeout(tagSaveTimer.current!); tagSaveTimer.current = null }
    if (addingTag) {
      // 追加中に閉じる: 名前があれば作成だけして終わる（編集モードへは移行しない）。
      const name = newTagName.trim()
      if (name !== '') {
        api.createTag({ name, color: newTagColor ?? '#9a6b3f' })
          .then(() => reloadTags())
          .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      }
    } else if (pending) {
      tagAutoSaveRef.current() // 編集中の保留保存を取りこぼさない
    }
    setAddingTag(false)
    setEditingTagId(null)
    setNewTagName(''); setNewTagColor(null)
  }

  // 「＋」から年表の追加モーダルを開く（年表は必ず色を持つ）。
  const startAddTimeline = () => {
    setError('')
    setEditingTagId(null)
    setNewTagName('')
    setNewTagColor('#9a6b3f')
    setAddingTag(true)
  }

  const doDelete = async () => {
    cancelSave() // 削除するので予約済みの保存は捨てる
    if (selectedId == null) return
    try {
      await api.deleteEvent(selectedId)
      setSelectedId(null)
      setIsNew(false)
      setConfirmDelete(false)
      resetForm()
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const logout = async () => {
    try { await api.logout() } catch { /* ignore */ }
    onLogout()
  }

  const editing = isNew || selectedId != null

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand" onClick={() => window.location.reload()}><ScrollText size={22} /> nenpyo</div>
          {DEV_BUTTON && (
            <button
              className={'icon-btn dev-btn' + (devOverlay ? ' active' : '')}
              title="開発用: メイン領域を表示"
              onClick={() => setDevOverlay((v) => !v)}
            >
              <FlaskConical size={18} />
            </button>
          )}
          <button
            className={'icon-btn' + (showExplorer ? ' active' : '')}
            title="エクスプローラー（他ユーザーの年表を探す）"
            onClick={() => setShowExplorer((v) => !v)}
          >
            <Compass size={18} />
          </button>
        </div>
        <div className="topbar-right">
          <span className="who">{username}</span>
          <button className={'icon-btn' + (showSettings ? ' active' : '')} title="設定" onClick={() => setShowSettings((v) => !v)}><Settings size={18} /></button>
          <button className="icon-btn" title="ログアウト" onClick={logout}><LogOut size={18} /></button>
        </div>
      </header>

      <div className="body" ref={bodyRef}>
        <aside className="list" style={{ width: sidebarWidth }}>
          <div className="list-pane" style={timelinesCollapsed ? { flex: '0 0 auto' } : { flex: '1 1 0', minHeight: 0 }}>
            {DEV_BUTTON && devOverlay && <div className="dev-box"><span className="dev-label">年表エリア</span></div>}
            <div className="list-head">
              <button className="list-collapse" title={timelinesCollapsed ? '展開する' : '畳む'} onClick={() => setTimelinesCollapsed((v) => !v)}>
                {timelinesCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                <span className="list-head-title">年表</span>
              </button>
              <button className="list-add-btn" title="年表を追加" onClick={() => { setTimelinesCollapsed(false); startAddTimeline() }}>
                <Plus size={15} />
              </button>
            </div>
            {!timelinesCollapsed && (<>
            {timelines.length === 0 && <p className="tag-empty">「＋」で年表を作成できます。</p>}
            <ul className="tag-list">
              {timelines.map((t) => {
                const tEvents = eventsByTimeline.get(t.id) ?? []
                const open = expandedTimelines.has(t.id)
                return (
                  <li key={t.id} className="timeline-group">
                    <div className="tag-item">
                      <button className="tl-toggle" title={open ? '畳む' : '展開する'} onClick={() => toggleTimelineOpen(t.id)}>
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <span className="tag-swatch" style={{ background: t.color }} />
                      <span className="tag-name">{t.name}</span>
                      <span className="tag-count">{tEvents.length}件</span>
                      <button className="tag-icon-btn" title="年表を編集" onClick={() => startEditTag(t)}><Pencil size={15} /></button>
                      <button className="tag-icon-btn" title="この年表にイベントを追加" onClick={() => { setExpandedTimelines((p) => new Set(p).add(t.id)); startNew(t.id) }}><Plus size={15} /></button>
                    </div>
                    {open && tEvents.length > 0 && (
                      <ul className="timeline-events">
                        {tEvents.map((e) => (
                          <li
                            key={e.id}
                            className={'tl-sub' + (e.id === chartSelectedId ? ' selected' : '')}
                            onClick={() => {
                              setChartSelectedId(e.id)
                              if (settings.moveClickedIntoView) setCenterReq((p) => ({ id: e.id, n: (p?.n ?? 0) + 1 }))
                            }}
                            onDoubleClick={() => selectEvent(e)}
                          >
                            <div className="tl-sub-content">
                              <span className="tl-sub-date">{formatRangeAD(e)}</span>
                              <span className="tl-sub-title">{e.title || '（無題）'}</span>
                            </div>
                            <button className="tag-icon-btn" title="編集" onClick={(ev) => { ev.stopPropagation(); selectEvent(e) }}><Pencil size={14} /></button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
            </>)}
          </div>
        </aside>

        <div className="splitter" onMouseDown={startResize} title="ドラッグで幅を変更" />

        <main className="editor">
          {showExplorer ? (
              <Explorer onClose={() => setShowExplorer(false)} />
            ) : events.length > 0 ? (
              <TimelineChart
                events={listEvents}
                selectedId={chartSelectedId}
                onSelect={setChartSelectedId}
                onEdit={selectEvent}
                centerYear={centerYear}
                setCenterYear={setCenterYear}
                yearsVisible={yearsVisible}
                setYearsVisible={setYearsVisible}
                invertZoom={settings.invertZoom}
                wheelPlain={settings.wheelPlain}
                wheelShift={settings.wheelShift}
                wheelCtrl={settings.wheelCtrl}
                zoomFactor={settings.zoomFactor}
                devOverlay={DEV_BUTTON && devOverlay}
                centerRequest={centerReq}
                tagColors={tagColors}
              />
            ) : (
              <div className="placeholder">
                <ScrollText size={48} strokeWidth={1} />
                <p>「出来事を追加」から年表をつくりましょう。</p>
              </div>
            )}

          {editing && (
            <div className="panel-overlay">
            <div className="form">
              <div className="form-head">
                <h2 className="form-title">{isNew ? 'イベントの追加' : 'イベントの編集'}</h2>
                <div className="form-head-actions">
                  {!isNew && (
                    <button className="settings-close" onClick={() => setConfirmDelete(true)} title="削除" aria-label="削除"><Trash2 size={18} /></button>
                  )}
                  <button className="settings-close" onClick={closeEditor} title="閉じる" aria-label="閉じる"><X size={18} /></button>
                </div>
              </div>
              {(() => {
                const tl = timelines.find((t) => formTagIds.includes(t.id))
                return (
                  <div className="fld">
                    <span className="fld-head">年表</span>
                    <div className="fld-body">
                      <div className="event-timeline">
                        {tl ? (<>
                          <span className="tag-swatch" style={{ background: tl.color }} />
                          <span className="event-timeline-name">{tl.name}</span>
                        </>) : (
                          <span className="hint">（年表に未所属）</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}
              <div className="fld">
                <span className="fld-head">期間</span>
                <div className="fld-body">
                  <div className="range-row">
                    <input value={startText} placeholder="yyyy/mm/dd"
                      onChange={(e) => setStartText(e.target.value)} onBlur={scheduleSave} />
                    <span className="range-sep">〜</span>
                    <input value={endText} placeholder="yyyy/mm/dd"
                      onChange={(e) => setEndText(e.target.value)} onBlur={scheduleSave} />
                  </div>
                </div>
              </div>

              <label className="fld">
                <span className="fld-head">タイトル<span className="char-count">({title.length}/100)</span></span>
                <div className="fld-body">
                  <input value={title} maxLength={100} placeholder="出来事の名前" onChange={(e) => setTitle(e.target.value)} onBlur={scheduleSave} />
                </div>
              </label>

              <label className="fld grow">
                <span className="fld-head">詳細<span className="char-count">({detail.length}/1000)</span></span>
                <div className="fld-body">
                  <textarea value={detail} maxLength={1000} placeholder="説明（任意）" onChange={(e) => setDetail(e.target.value)} onBlur={scheduleSave} />
                </div>
              </label>

              {error && <div className="form-error">{error}</div>}
            </div>
            </div>
          )}

          {showSettings && (
            <div className="panel-overlay" onClick={() => setShowSettings(false)}>
              <SettingsPanel
                settings={settings}
                setSettings={setSettings}
                onClose={() => setShowSettings(false)}
              />
            </div>
          )}

          {(addingTag || editingTagId != null) && (() => {
            // 追加(isAdd)と編集で同じUIを使う。追加中は下書き(newTag*)、編集中は対象タグ(t)を読む。
            const t = editingTagId != null ? tags.find((x) => x.id === editingTagId) : null
            if (editingTagId != null && !t) return null
            const isAdd = t == null
            const pi = t ? timelines.findIndex((p) => p.id === t.id) : -1
            const swatchColor = isAdd ? newTagColor : t!.color
            const nameValue = isAdd ? newTagName : editTagName
            const onColorChange = (color: string) => { isAdd ? setNewTagColor(color) : pickTagColor(t!, color) }
            const onNameChange = (v: string) => { isAdd ? setNewTagName(v) : setEditTagName(v) }
            return (
              <div className="panel-overlay">
                <div className="form">
                  <div className="form-head">
                    <h2 className="form-title">{isAdd ? '年表の追加' : '年表の編集'}</h2>
                    <div className="form-head-actions">
                      {!isAdd && (<>
                        <button className="settings-close" onClick={() => moveTimeline(t!.id, -1)} disabled={pi <= 0} title="上へ" aria-label="上へ"><ChevronUp size={18} /></button>
                        <button className="settings-close" onClick={() => moveTimeline(t!.id, 1)} disabled={pi >= timelines.length - 1} title="下へ" aria-label="下へ"><ChevronDown size={18} /></button>
                      </>)}
                      {!isAdd && (
                        <button className="settings-close" onClick={() => setConfirmDeleteTagId(t!.id)} title="削除" aria-label="削除"><Trash2 size={18} /></button>
                      )}
                      <button className="settings-close" onClick={closeTagEditor} title="閉じる" aria-label="閉じる"><X size={18} /></button>
                    </div>
                  </div>

                  <div className="fld">色
                    <div>
                      <label className="color-pick" style={{ background: swatchColor ?? '#9a6b3f' }} title="クリックで色を選ぶ">
                        <Palette size={20} />
                        <input type="color" value={swatchColor ?? '#9a6b3f'} onChange={(ev) => onColorChange(ev.target.value)} />
                      </label>
                    </div>
                  </div>

                  <label className="fld">
                    <span className="fld-head">年表名<span className="char-count">({nameValue.length}/40)</span></span>
                    <input
                      autoFocus
                      value={nameValue}
                      maxLength={40}
                      placeholder="年表名"
                      onChange={(ev) => onNameChange(ev.target.value)}
                      onBlur={scheduleTagSave}
                      onKeyDown={(ev) => { if (ev.key === 'Escape') closeTagEditor() }}
                    />
                  </label>

                  {error && <div className="form-error">{error}</div>}
                </div>
              </div>
            )
          })()}
        </main>
      </div>

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p>この出来事を削除しますか？</p>
            <div className="modal-actions">
              <button onClick={() => setConfirmDelete(false)}>キャンセル</button>
              <button className="danger" onClick={doDelete}>削除する</button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteTagId != null && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteTagId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p>この年表を削除しますか？</p>
            <div className="modal-actions">
              <button onClick={() => setConfirmDeleteTagId(null)}>キャンセル</button>
              <button className="danger" onClick={() => { const id = confirmDeleteTagId; setConfirmDeleteTagId(null); deleteTag(id) }}>削除する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
