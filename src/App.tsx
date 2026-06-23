import { useEffect, useState, useCallback, useRef } from 'react'
import { ScrollText, Plus, Trash2, LogOut, Save } from 'lucide-react'
import { api, formatRange, formatYear, parseDateText, dateToText, type EventItem, type EventInput } from './api'
import './App.css'

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

// 年月日を「小数の年」に変換（バーの位置計算用）。月日が無ければ開始は年頭・終了は年末扱い。
function fracYear(year: number, month: number | null, day: number | null): number {
  const m = (month ?? 1) - 1
  const d = (day ?? 1) - 1
  return year + (m + d / 31) / 12
}

// ---- 期間バーによる年表表示（項目未選択時にメイン画面へ表示） ----------------
// 中心年(centerYear)と表示幅(yearsVisible)で決まるビューポートに入る項目だけを表示する。
// 単クリック: その行を選択（縁取り表示）するだけ。
// タイトル文字をダブルクリック: その項目の編集画面へ遷移。
// Shift+ホイール: 表示幅（スケール）を拡大・縮小。
function TimelineChart({ events, selectedId, onSelect, onEdit, centerYear, yearsVisible, setYearsVisible }: {
  events: EventItem[]
  selectedId: number | null
  onSelect: (id: number) => void
  onEdit: (e: EventItem) => void
  centerYear: number
  yearsVisible: number
  setYearsVisible: (updater: (v: number) => number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Shift+ホイールでスケール変更。passive:false でページスクロールを抑止するため native で登録。
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (ev: WheelEvent) => {
      if (!ev.shiftKey) return
      ev.preventDefault()
      // Shift 押下時はブラウザが deltaY を deltaX に変換することがあるため、大きい方を使う
      const delta = Math.abs(ev.deltaY) >= Math.abs(ev.deltaX) ? ev.deltaY : ev.deltaX
      if (delta === 0) return
      const factor = delta > 0 ? 1.2 : 1 / 1.2
      setYearsVisible((v) => Math.min(40000, Math.max(1, v * factor)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setYearsVisible])

  const rangeStart = centerYear - yearsVisible / 2
  const rangeEnd = centerYear + yearsVisible / 2
  const pct = (y: number) => ((y - rangeStart) / yearsVisible) * 100
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
  const zero = rangeStart <= 0 && rangeEnd >= 0 ? pct(0) : null

  const eventSpan = (e: EventItem) => {
    const s = fracYear(e.start_year, e.start_month, e.start_day)
    const end = e.end_year == null ? s : fracYear(e.end_year, e.end_month ?? 12, e.end_day ?? 31)
    return { s, end }
  }
  // ビューポートに重なる項目だけを表示
  const visible = events.filter((e) => {
    const { s, end } = eventSpan(e)
    return s <= rangeEnd && end >= rangeStart
  })

  return (
    <div className="chart">
      <div className="chart-head">
        <div className="chart-axis">
          <span className="axis-tick" style={{ left: '0%' }}>{formatYear(Math.round(rangeStart))}</span>
          <span className="axis-tick mid" style={{ left: '50%' }}>{formatYear(Math.round(centerYear))}</span>
          <span className="axis-tick end" style={{ left: '100%' }}>{formatYear(Math.round(rangeEnd))}</span>
        </div>
      </div>

      <div className="chart-scroll" ref={scrollRef}>
        {visible.length === 0 ? (
          <p className="chart-empty">この範囲に該当する出来事はありません。<br />Shift＋マウスホイールで表示範囲を変えられます。</p>
        ) : (
          <div className="chart-body">
            {visible.map((e) => {
              const { s, end } = eventSpan(e)
              const isPoint = e.end_year == null
              const left = pct(s)
              const width = Math.max(0.4, pct(end) - left)
              const labelCenter = pct(clamp((s + end) / 2, rangeStart, rangeEnd))
              return (
                <div
                  className={e.id === selectedId ? 'chart-row selected' : 'chart-row'}
                  key={e.id}
                  onClick={() => onSelect(e.id)}
                  title={`${e.title || '（無題）'}（${formatRange(e)}）`}
                >
                  <div className="chart-track">
                    {zero != null && <div className="chart-zero" style={{ left: `${zero}%` }} />}
                    <div className={isPoint ? 'chart-bar point' : 'chart-bar'} style={{ left: `${left}%`, width: `${width}%` }} />
                    <span
                      className="chart-bar-label"
                      style={{ left: `${labelCenter}%` }}
                      onDoubleClick={(ev) => { ev.stopPropagation(); onEdit(e) }}
                    >{e.title || '（無題）'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="chart-hint hint">
        中心 {formatYear(Math.round(centerYear))}／表示幅 約{Math.round(yearsVisible).toLocaleString()}年
        （Shift＋ホイールで拡大・縮小）
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
  const centerYear = fracYear(1, 1, 1)
  const [yearsVisible, setYearsVisible] = useState(2000)
  // 開始・終了は1つのテキストとして編集し、保存時に年月日へ解析する
  const [startText, setStartText] = useState('')
  const [endText, setEndText] = useState('')
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [isNew, setIsNew] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

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

  useEffect(() => { reload() }, [reload])

  const selectEvent = (e: EventItem) => {
    setSelectedId(e.id)
    setIsNew(false)
    setConfirmDelete(false)
    resetForm(
      dateToText(e.start_year, e.start_month, e.start_day),
      dateToText(e.end_year, e.end_month, e.end_day),
      e.title, e.detail,
    )
  }

  const startNew = () => {
    setSelectedId(null)
    setIsNew(true)
    setConfirmDelete(false)
    resetForm(String(new Date().getFullYear()))
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
        title, detail,
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
            {events.map((e) => (
              <li
                key={e.id}
                className={e.id === selectedId ? 'tl-item selected' : 'tl-item'}
                onClick={() => selectEvent(e)}
              >
                <div className="tl-dot" />
                <div className="tl-content">
                  <div className="tl-date">{formatRange(e)}</div>
                  <div className="tl-title">{e.title || '（無題）'}</div>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <main className="editor">
          {!editing ? (
            events.length > 0 ? (
              <TimelineChart
                events={events}
                selectedId={chartSelectedId}
                onSelect={setChartSelectedId}
                onEdit={selectEvent}
                centerYear={centerYear}
                yearsVisible={yearsVisible}
                setYearsVisible={setYearsVisible}
              />
            ) : (
              <div className="placeholder">
                <ScrollText size={48} strokeWidth={1} />
                <p>「出来事を追加」から年表をつくりましょう。</p>
              </div>
            )
          ) : (
            <div className="form">
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
                年のみ「1853」／年月日「1853/7/8」or「1853-7-8」（紀元前は -660）。終了は空欄なら単発の出来事。
              </div>

              <label className="fld">タイトル
                <input value={title} placeholder="出来事の名前" onChange={(e) => setTitle(e.target.value)} />
              </label>

              <label className="fld grow">詳細
                <textarea value={detail} placeholder="説明（任意）" onChange={(e) => setDetail(e.target.value)} />
              </label>

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
