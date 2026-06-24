import { useEffect, useState, useCallback, useRef } from 'react'
import { ScrollText, Plus, Trash2, LogOut, Save, ChevronLeft, ChevronRight, Settings, Check, X, Pencil } from 'lucide-react'
import { api, formatRangeAD, formatYearAD, parseDateText, dateToText, type EventItem, type EventInput, type Tag } from './api'
import './App.css'

// ---- ユーザー設定（ブラウザの localStorage に保存。端末ごと） ----------------
type Theme = 'light' | 'dark'
// マウスホイール（修飾キー別）に割り当てる動作
type WheelAction = 'scroll' | 'pan' | 'zoom'
const WHEEL_ACTION_LABELS: Record<WheelAction, string> = {
  scroll: '上下スクロール',
  pan: '左右スクロール（パン）',
  zoom: '拡大縮小',
}
type AppSettings = {
  theme: Theme
  invertZoom: boolean
  wheelPlain: WheelAction
  wheelShift: WheelAction
  wheelCtrl: WheelAction
}
const SETTINGS_KEY = 'nenpyo-settings'

function loadSettings(): AppSettings {
  const defaults: AppSettings = {
    theme: window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    invertZoom: false,
    wheelPlain: 'scroll',
    wheelShift: 'pan',
    wheelCtrl: 'zoom',
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
          <input ref={usernameRef} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
        </label>
        <label>パスワード
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </label>
        {mode === 'register' && (
          <label>パスワード（確認）
            <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
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

// 年月日を「時間軸の座標」に変換（バー・グリッドの位置計算用）。
// 西暦0年は存在しないので AD1 を座標 0 とし、AD と BC を隙間なく連続させる。
//   AD年(>=1): pos = (year-1) + 月日の小数   → AD1 の頭が 0
//   BC年(<=-1): pos =  year   + 月日の小数   → 1BC は [-1, 0) を占め、12/31 が AD1/1/1 の直前に来る
// 月日が無ければ開始は年頭・終了は年末扱い。
function fracYear(year: number, month: number | null, day: number | null): number {
  const m = (month ?? 1) - 1
  const d = (day ?? 1) - 1
  const frac = (m + d / 31) / 12
  return (year >= 1 ? year - 1 : year) + frac
}

// 時間軸の座標 → 年・月（fracYear の逆変換）。0年は無いので AD は +1 のずれを補正。
function posToYM(pos: number): { year: number; month: number } {
  const monthsTotal = Math.round(pos * 12)
  if (pos >= 0) {
    const ym1 = Math.floor(monthsTotal / 12)
    return { year: ym1 + 1, month: monthsTotal - ym1 * 12 + 1 }
  }
  const year = Math.floor(monthsTotal / 12)
  return { year, month: monthsTotal - year * 12 + 1 }
}

// 時間軸の座標 → 年・月・日。1年=12ヶ月×31スロット（fracYear と同じ日割り）。
const SLOTS_PER_YEAR = 12 * 31
function posToYMD(pos: number): { year: number; month: number; day: number } {
  const slots = Math.round(pos * SLOTS_PER_YEAR)
  const base = Math.floor(slots / SLOTS_PER_YEAR)        // AD: year-1, BC: year
  const rem = slots - base * SLOTS_PER_YEAR               // 0..371
  const month = Math.floor(rem / 31) + 1
  const day = (rem % 31) + 1
  return { year: pos >= 0 ? base + 1 : base, month, day }
}

// グリッド刻みとズーム範囲（座標=年単位）。最小は1日、最大は10万年スケール。
const DAY = 1 / SLOTS_PER_YEAR        // ≈ 0.00269 年（1日）
const MONTH = 1 / 12
const GRID_STEPS = [DAY, MONTH, 1, 10, 100, 1000, 10000, 100000]
const MIN_YEARS = DAY                 // 表示幅の下限（約1日）
const MAX_YEARS = 40000               // 表示幅の上限

// ---- 期間バーによる年表表示（項目未選択時にメイン画面へ表示） ----------------
// 中心年(centerYear)と表示幅(yearsVisible)で決まるビューポートに入る項目だけを表示する。
// 単クリック: その行を選択（縁取り表示）するだけ。
// タイトル文字をダブルクリック: その項目の編集画面へ遷移。
// Shift+ホイール: 表示幅（スケール）を拡大・縮小。
function TimelineChart({ events, selectedId, onSelect, onEdit, centerYear, setCenterYear, yearsVisible, setYearsVisible, invertZoom, wheelPlain, wheelShift, wheelCtrl, tagColors }: {
  events: EventItem[]
  selectedId: number | null
  onSelect: (id: number) => void
  onEdit: (e: EventItem) => void
  centerYear: number
  setCenterYear: (updater: (v: number) => number) => void
  yearsVisible: number
  setYearsVisible: (updater: (v: number) => number) => void
  invertZoom: boolean
  wheelPlain: WheelAction
  wheelShift: WheelAction
  wheelCtrl: WheelAction
  tagColors: Map<number, string>
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // ホイール操作は設定（修飾キー別の割り当て）に従う。
  // passive:false でページスクロールを抑止するため native で登録。
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (ev: WheelEvent) => {
      // 押されている修飾キーに割り当てられた動作を選ぶ（Ctrl 優先、次に Shift、無ければ修飾なし）
      const action = ev.ctrlKey ? wheelCtrl : ev.shiftKey ? wheelShift : wheelPlain
      if (action === 'scroll') return // ブラウザ既定のスクロールに任せる
      ev.preventDefault()
      // Shift 押下時はブラウザが deltaY を deltaX に変換することがあるため、大きい方を使う
      const delta = Math.abs(ev.deltaY) >= Math.abs(ev.deltaX) ? ev.deltaY : ev.deltaX
      if (delta === 0) return
      if (action === 'zoom') {
        // 拡大・縮小。奥に回す(delta>0)と縮小表示。設定で方向を反転できる。
        const zoomOut = invertZoom ? delta < 0 : delta > 0
        const factor = zoomOut ? 1.2 : 1 / 1.2
        setYearsVisible((v) => Math.min(MAX_YEARS, Math.max(MIN_YEARS, v * factor)))
      } else {
        // 左右にパン。移動量は表示幅に比例させる。
        const step = (delta > 0 ? 1 : -1) * yearsVisible / 10
        setCenterYear((y) => y + step)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setYearsVisible, setCenterYear, invertZoom, yearsVisible, wheelPlain, wheelShift, wheelCtrl])

  const rangeStart = centerYear - yearsVisible / 2
  const rangeEnd = centerYear + yearsVisible / 2
  const pct = (y: number) => ((y - rangeStart) / yearsVisible) * 100
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
  // 矢印ボタン1回の移動量。表示幅に比例（約1割）させ、スケールに追従させる。
  const panStep = Math.max(MIN_YEARS, yearsVisible / 10)

  // スケールに応じた縦グリッド線。1日〜10万年の刻みから、
  // 線が最大21本（=20区間）以内に収まる最も細かい刻みを選ぶ。
  let gridStep = GRID_STEPS[GRID_STEPS.length - 1]
  for (const iv of GRID_STEPS) {
    if (yearsVisible / iv <= 20) { gridStep = iv; break }
  }
  const gridLines: { left: number; major: boolean; label: string }[] = []
  const kStart = Math.ceil(rangeStart / gridStep)
  const kEnd = Math.floor(rangeEnd / gridStep)
  for (let k = kStart; k <= kEnd && gridLines.length < 60; k++) {
    const y = k * gridStep
    let label: string
    if (gridStep >= 1) {
      const { year } = posToYM(y)
      label = formatYearAD(year) // 年単位の刻み
    } else if (gridStep === MONTH) {
      // 1ヶ月刻み: 1月の線には年、それ以外は「○月」を表示
      const { year, month } = posToYM(y)
      label = month === 1 ? formatYearAD(year) : `${month}月`
    } else {
      // 1日刻み: 月初の線には月（1月なら年）、それ以外は「○日」を表示
      const { year, month, day } = posToYMD(y)
      label = day === 1 ? (month === 1 ? formatYearAD(year) : `${month}月`) : `${day}日`
    }
    // 座標0（AD1の頭＝1BC/AD1の境目）を強調
    gridLines.push({ left: pct(y), major: k === 0, label })
  }

  // 指定された最も細かい単位の幅（日指定=1日、月止まり=1ヶ月、年のみ=1年）
  const unitWidth = (month: number | null, day: number | null) =>
    day != null ? DAY : month != null ? MONTH : 1
  // バーの占有区間 [s, end)。終了は「その単位の終わり＝次の単位の頭」まで広げる。
  // 単発（終了なし）は開始の単位1つ分の幅にする（例: 1日のイベントは縦線〜次の縦線）。
  const eventSpan = (e: EventItem) => {
    const s = fracYear(e.start_year, e.start_month, e.start_day)
    const end = e.end_year == null
      ? s + unitWidth(e.start_month, e.start_day)
      : fracYear(e.end_year, e.end_month, e.end_day) + unitWidth(e.end_month, e.end_day)
    return { s, end }
  }

  return (
    <div className="chart">
      <div className="chart-head">
        <div className="chart-axis">
          {gridLines.map((g, i) => (
            <span
              key={i}
              className={g.major ? 'axis-tick major' : 'axis-tick'}
              style={{ left: `${g.left}%` }}
            >{g.label}</span>
          ))}
        </div>
      </div>

      <div className="chart-scroll" ref={scrollRef}>
        <div className="chart-body">
          <div className="chart-grid">
            {gridLines.map((g, i) => (
              <div
                key={i}
                className={g.major ? 'chart-grid-line major' : 'chart-grid-line'}
                style={{ left: `${g.left}%` }}
              />
            ))}
          </div>
          {/* 全イベントを常に1行ずつ表示（並び順固定）。バーが画面外でも行は残し、
              タイトルは近い側の端に寄せて表示する。 */}
          {events.map((e) => {
            const { s, end } = eventSpan(e)
            const left = pct(s)
            const width = Math.max(0.4, pct(end) - left)
            // 色は「色を持つ（=prime）タグ」のものを使う。tag_ids 内に普通タグが先頭に来ても拾えるよう全件から探す。
            const barColor = e.tag_ids.map((id) => tagColors.get(id)).find(Boolean)
            const title = e.title || '（無題）'
            // バーが完全に画面外なら、タイトルを近い側の端に固定（矢印で方向を示す）
            const offLeft = end < rangeStart
            const offRight = s > rangeEnd
            let labelClass = 'chart-bar-label'
            let labelLeft = pct(clamp((s + end) / 2, rangeStart, rangeEnd))
            let labelText = title
            if (offLeft) { labelClass += ' at-left'; labelLeft = 0; labelText = `◀ ${title}` }
            else if (offRight) { labelClass += ' at-right'; labelLeft = 100; labelText = `${title} ▶` }
            return (
              <div
                className={e.id === selectedId ? 'chart-row selected' : 'chart-row'}
                key={e.id}
                onClick={() => onSelect(e.id)}
                title={`${title}（${formatRangeAD(e)}）`}
              >
                <div className="chart-track">
                  {!offLeft && !offRight && (
                    <div className="chart-bar" style={{ left: `${left}%`, width: `${width}%`, ...(barColor ? { background: barColor } : {}) }} />
                  )}
                  <span
                    className={labelClass}
                    style={{ left: `${labelLeft}%` }}
                    onDoubleClick={(ev) => { ev.stopPropagation(); onEdit(e) }}
                  >{labelText}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="chart-hint hint">
        <button className="chart-nav" onClick={() => setCenterYear((y) => y - panStep)} aria-label={`中心を約${Math.round(panStep).toLocaleString()}年戻す`}>
          <ChevronLeft size={18} />
        </button>
        <span className="chart-hint-text">
          中心 {formatYearAD(posToYM(centerYear).year)}／表示幅 約{Math.round(yearsVisible).toLocaleString()}年
          （Ctrl＋ホイールで拡大縮小／Shift＋ホイールで左右移動）
        </span>
        <button className="chart-nav" onClick={() => setCenterYear((y) => y + panStep)} aria-label={`中心を約${Math.round(panStep).toLocaleString()}年進める`}>
          <ChevronRight size={18} />
        </button>
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
  return (
    <div className="settings-panel">
      <div className="settings-head">
        <h2 className="settings-title">設定</h2>
        <button className="settings-close" onClick={onClose}>閉じる</button>
      </div>

      <section className="settings-section">
        <h3 className="settings-label">テーマ</h3>
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
      </section>

      <section className="settings-section">
        <h3 className="settings-label">マウスホイールの操作</h3>
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
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={settings.invertZoom}
            onChange={(e) => setSettings((s) => ({ ...s, invertZoom: e.target.checked }))}
          />
          <span>拡大・縮小の向きを逆にする</span>
        </label>
        <p className="settings-note">
          ホイールを手前に回すと拡大します（チェックで反転）。
        </p>
      </section>

      <p className="settings-note">テーマ・操作の設定はこのブラウザに保存されます。</p>
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
  // タグ一覧と、編集中イベントに付けるタグID
  const [tags, setTags] = useState<Tag[]>([])
  const [formTagIds, setFormTagIds] = useState<number[]>([])
  const [addingTag, setAddingTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState<string | null>(null) // null=色なし(prime=false)
  const [editingTagId, setEditingTagId] = useState<number | null>(null)
  const [editTagName, setEditTagName] = useState('')
  // 設定画面の表示と、ユーザー設定（テーマ等）
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(loadSettings)

  // tag_id -> 色 の対応（期間バー・ドットの着色に使う）。色を持てるのは prime のタグだけ。
  const tagColors = new Map(tags.filter((t) => t.prime).map((t) => [t.id, t.color]))
  const primeTagList = tags.filter((t) => t.prime)
  const normalTagList = tags.filter((t) => !t.prime)

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

  const selectEvent = (e: EventItem) => {
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

  const startNew = () => {
    setShowSettings(false)
    setSelectedId(null)
    setIsNew(true)
    setConfirmDelete(false)
    setFormTagIds([])
    resetForm(String(new Date().getFullYear()))
  }

  // 入力・編集画面を閉じて年表チャートへ戻る
  const closeEditor = () => {
    setSelectedId(null)
    setIsNew(false)
    setConfirmDelete(false)
    setError('')
    setFormTagIds([])
    resetForm()
  }

  // 普通の（prime でない）タグ: 好きなだけトグル
  const toggleFormTag = (id: number) => {
    setFormTagIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
  }

  // プライムタグ: 1つだけ選べる。選び直すと差し替え、同じものを再度押すと解除。
  const selectPrimeTag = (id: number) => {
    setFormTagIds((ids) => {
      const primeIds = new Set(tags.filter((t) => t.prime).map((t) => t.id))
      const withoutPrime = ids.filter((x) => !primeIds.has(x))
      return ids.includes(id) ? withoutPrime : [...withoutPrime, id]
    })
  }

  const addTag = async () => {
    const name = newTagName.trim()
    if (name === '') { setAddingTag(false); setNewTagName(''); setNewTagColor(null); return }
    try {
      // 色を選んでいれば prime=true のタグ、選んでいなければ色なし(prime=false)で作成
      await api.createTag(newTagColor ? { name, color: newTagColor, prime: true } : { name })
      setNewTagName(''); setNewTagColor(null); setAddingTag(false)
      await reloadTags()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // タグ名編集中に色見本をクリックして色を選んだとき: prime=true にして色を設定（即時保存）
  const pickTagColor = async (t: Tag, color: string) => {
    try {
      await api.updateTag(t.id, { name: t.name, color, prime: true })
      await reloadTags()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const deleteTag = async (id: number) => {
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
    setAddingTag(false)
    setEditingTagId(t.id)
    setEditTagName(t.name)
  }

  const saveTagName = async (t: Tag) => {
    const name = editTagName.trim()
    if (name === '' || name === t.name) { setEditingTagId(null); return }
    try {
      // 名前のみ変更。色は現状を維持して送る（prime はサーバー側で保持される）
      await api.updateTag(t.id, { name, color: t.color })
      setEditingTagId(null)
      await reloadTags()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const save = async () => {
    setError('')
    let input: EventInput
    try {
      const start = parseDateText(startText)
      const end = parseDateText(endText)
      if (start.year == null) throw new Error('開始の年は必須です')
      input = {
        start_year: start.year, start_month: start.month, start_day: start.day,
        end_year: end.year, end_month: end.month, end_day: end.day,
        title, detail, tag_ids: formTagIds,
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return
    }
    try {
      if (isNew) {
        const created = await api.createEvent(input)
        await reload()
        selectEvent(created)
      } else if (selectedId != null) {
        const updated = await api.updateEvent(selectedId, input)
        await reload()
        selectEvent(updated)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const doDelete = async () => {
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
        <div className="brand" onClick={() => window.location.reload()}><ScrollText size={22} /> nenpyo</div>
        <div className="topbar-right">
          <span className="who">{username}</span>
          <button className="icon-btn" title="ログアウト" onClick={logout}><LogOut size={18} /></button>
        </div>
      </header>

      <div className="body">
        <aside className="list">
          <button className="new-btn" onClick={startNew}><Plus size={16} /> 出来事を追加</button>
          {events.length === 0 && <p className="empty">まだ出来事がありません。<br />「出来事を追加」から登録してください。</p>}
          <ul className="timeline">
            {events.map((e) => {
              // 色を持つ（=prime）タグの色を使う（普通タグが先頭でも拾えるよう全件から探す）
              const dotColor = e.tag_ids.map((id) => tagColors.get(id)).find(Boolean)
              return (
                <li
                  key={e.id}
                  className={e.id === selectedId ? 'tl-item selected' : 'tl-item'}
                  onClick={() => selectEvent(e)}
                >
                  <div className="tl-dot" style={dotColor ? { borderColor: dotColor } : undefined} />
                  <div className="tl-content">
                    <div className="tl-date">{formatRangeAD(e)}</div>
                    <div className="tl-title">{e.title || '（無題）'}</div>
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="tag-section">
            <div className="tag-section-head">
              <span className="tag-section-title">タグ</span>
              <button className="tag-add-btn" title="タグを追加" onClick={() => { setAddingTag(true); setNewTagName(''); setNewTagColor(null) }}>
                <Plus size={15} />
              </button>
            </div>
            {addingTag && (
              <div className="tag-add-row">
                <label
                  className={(newTagColor ? 'tag-swatch' : 'tag-swatch none') + ' tag-swatch-pick'}
                  style={newTagColor ? { background: newTagColor } : undefined}
                  title="クリックで色を選ぶ（プライムタグにする）"
                >
                  <input type="color" value={newTagColor ?? '#9a6b3f'} onChange={(ev) => setNewTagColor(ev.target.value)} />
                </label>
                <input
                  autoFocus
                  value={newTagName}
                  placeholder="タグ名"
                  onChange={(ev) => setNewTagName(ev.target.value)}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') addTag(); if (ev.key === 'Escape') { setAddingTag(false); setNewTagName(''); setNewTagColor(null) } }}
                />
                <button className="tag-icon-btn" title="追加" onClick={addTag}><Check size={15} /></button>
                <button className="tag-icon-btn" title="やめる" onClick={() => { setAddingTag(false); setNewTagName('') }}><X size={15} /></button>
              </div>
            )}
            {tags.length === 0 && !addingTag && <p className="tag-empty">「＋」でタグを作成できます。</p>}
            <ul className="tag-list">
              {tags.map((t) => (
                editingTagId === t.id ? (
                  <li key={t.id} className="tag-add-row">
                    <label
                      className={(t.prime ? 'tag-swatch' : 'tag-swatch none') + ' tag-swatch-pick'}
                      style={t.prime ? { background: t.color } : undefined}
                      title="クリックで色を選ぶ（プライムタグにする）"
                    >
                      <input type="color" value={t.prime ? t.color : '#9a6b3f'} onChange={(ev) => pickTagColor(t, ev.target.value)} />
                    </label>
                    <input
                      autoFocus
                      value={editTagName}
                      placeholder="タグ名"
                      onChange={(ev) => setEditTagName(ev.target.value)}
                      onKeyDown={(ev) => { if (ev.key === 'Enter') saveTagName(t); if (ev.key === 'Escape') setEditingTagId(null) }}
                    />
                    <button className="tag-icon-btn" title="保存" onClick={() => saveTagName(t)}><Check size={15} /></button>
                    <button className="tag-icon-btn" title="削除する" onClick={() => deleteTag(t.id)}><Trash2 size={15} /></button>
                  </li>
                ) : (
                  <li key={t.id} className="tag-item">
                    <span className={t.prime ? 'tag-swatch' : 'tag-swatch none'} style={t.prime ? { background: t.color } : undefined} />
                    <span className="tag-name">{t.name}</span>
                    <button className="tag-icon-btn" title="タグ名を編集" onClick={() => startEditTag(t)}><Pencil size={15} /></button>
                  </li>
                )
              ))}
            </ul>
          </div>

          <div className="list-foot">
            <button
              className={'gear-btn' + (showSettings ? ' active' : '')}
              title="設定"
              onClick={() => setShowSettings(true)}
            >
              <Settings size={18} />
            </button>
          </div>
        </aside>

        <main className="editor">
          {showSettings ? (
            <SettingsPanel
              settings={settings}
              setSettings={setSettings}
              onClose={() => setShowSettings(false)}
            />
          ) : !editing ? (
            events.length > 0 ? (
              <TimelineChart
                events={events}
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
                tagColors={tagColors}
              />
            ) : (
              <div className="placeholder">
                <ScrollText size={48} strokeWidth={1} />
                <p>「出来事を追加」から年表をつくりましょう。</p>
              </div>
            )
          ) : (
            <div className="form">
              <div className="form-head">
                <h2 className="form-title">{isNew ? '出来事を追加' : '出来事を編集'}</h2>
                <button className="settings-close" onClick={closeEditor}>閉じる</button>
              </div>
              <div className="range-row">
                <label className="fld">開始
                  <input value={startText} placeholder="例: 1853 または 1853/7/8"
                    onChange={(e) => setStartText(e.target.value)} />
                </label>
                <span className="range-sep">〜</span>
                <label className="fld">終了
                  <input value={endText} placeholder="例: 1854/3/31（空欄可）"
                    onChange={(e) => setEndText(e.target.value)} />
                </label>
              </div>
              <div className="hint range-hint">
                年のみ「1853」／年月日「1853/7/8」（区切りは「/」のみ）。紀元前は先頭に「-」（例: -660）。終了は空欄なら単発の出来事。
              </div>

              <label className="fld">タイトル
                <input value={title} placeholder="出来事の名前" onChange={(e) => setTitle(e.target.value)} />
              </label>

              <label className="fld grow">詳細
                <textarea value={detail} placeholder="説明（任意）" onChange={(e) => setDetail(e.target.value)} />
              </label>

              <div className="fld">プライムタグ<span className="hint">（1つだけ選べます）</span>
                {primeTagList.length === 0 ? (
                  <p className="hint">プライムタグはありません。</p>
                ) : (
                  <div className="tag-picker">
                    {primeTagList.map((t) => (
                      <button
                        type="button"
                        key={t.id}
                        className={'tag-chip' + (formTagIds.includes(t.id) ? ' on' : '')}
                        onClick={() => selectPrimeTag(t.id)}
                      >
                        <span className="tag-swatch" style={{ background: t.color }} />
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="fld">タグ<span className="hint">（いくつでも選べます）</span>
                {normalTagList.length === 0 ? (
                  <p className="hint">タグはありません。左の「タグ」欄から作成できます。</p>
                ) : (
                  <div className="tag-picker">
                    {normalTagList.map((t) => (
                      <button
                        type="button"
                        key={t.id}
                        className={'tag-chip' + (formTagIds.includes(t.id) ? ' on' : '')}
                        onClick={() => toggleFormTag(t.id)}
                      >
                        <span className="tag-swatch none" />
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {error && <div className="form-error">{error}</div>}

              <div className="actions">
                <button className="save-btn" onClick={save}><Save size={16} /> {isNew ? '追加' : '保存'}</button>
                {!isNew && (
                  <button className="del-btn" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> 削除</button>
                )}
              </div>
            </div>
          )}
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
    </div>
  )
}
