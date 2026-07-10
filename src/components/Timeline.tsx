import { useEffect, useState, useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { ScrollText, Plus, Trash2, LogOut, ChevronRight, ChevronDown, ChevronUp, Settings, X, Pencil, Palette, Compass, FlaskConical, ChartBarBig, ChartNoAxesGantt, ChartBarStacked, User, Download, Link2 as LinkIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, formatRangeAD, parseDateText, dateToText, type EventItem, type EventInput, type Tag, type ColorScheme } from '../api'
import i18n from '../i18n'
import { type AppSettings, loadSettings, SETTINGS_KEY, clampBarHeight, clampRowHeight, clampLabelFont } from '../lib/settings'
import { fracYear, type LaneMode } from '../lib/timeline'
import { textColorFor, isLightColor, mixHex } from '../lib/format'
import { TimelineChart } from './TimelineChart'
import { SettingsPanel, type SettingsTab } from './SettingsPanel'
import { ChangePasswordView } from './ChangePasswordView'
import { Explorer } from './Explorer'
import { DevUsers } from './DevUsers'
import { DevColorSchemes } from './DevColorSchemes'

// サイドバーの仮想「（年表に未所属）」グループ用の擬似 id（DB の nenpyo.id は正の値なので衝突しない）。
// 展開状態(expandedTimelines)・表示/非表示(hiddenTimelines)の集合でこの id を使う。
const UNASSIGNED_ID = -1

// ---- 年表本体 --------------------------------------------------------------
// isGuest=true は一時ユーザー（数日で消える）。機能は本会員とほぼ同じだが、上バーには
// ユーザー名の代わりにログインへの導線を出し、設定のアカウントタブは隠す。
export function Timeline({ username, email, isGuest, onLogout, onRequestLogin }: {
  username: string
  email: string | null
  isGuest: boolean
  onLogout: () => void
  onRequestLogin: () => void
}) {
  const { t } = useTranslation()
  const [events, setEvents] = useState<EventItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [chartSelectedId, setChartSelectedId] = useState<number | null>(null)
  // 年表チャートの表示ビュー。中心はデフォルトで西暦1年1月1日（= 小数年 1.0）。
  const [centerYear, setCenterYear] = useState(fracYear(1, 1, 1))
  const [yearsVisible, setYearsVisible] = useState(2000)
  // 開始・終了は1つのテキストとして編集し、保存時に年月日へ解析する
  const [startText, setStartText] = useState('')
  const [endText, setEndText] = useState('')
  // 「現在まで継続中」チェック（UIのみ。API/DB への保存は未対応）
  const [ongoing, setOngoing] = useState(false)
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [isNew, setIsNew] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDeleteTagId, setConfirmDeleteTagId] = useState<number | null>(null)
  // 年表削除の確認で「含むイベントも削除する」にチェックが入っているか。
  const [deleteTagWithEvents, setDeleteTagWithEvents] = useState(false)
  // タグ一覧と、編集中イベントに付けるタグID
  // 年表（自分の年表＋フォロー取込みの仮想年表）。仮想年表は virtual_nenpyo_id を持つ。
  const [tags, setTags] = useState<Tag[]>([])
  const [formNenpyoId, setFormNenpyoId] = useState<number | null>(null)
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
  // メイン領域で非表示にしている年表 id（チェックを外した年表）。localStorage に保存。
  const HIDDEN_KEY = 'nenpyo-hidden-timelines'
  const [hiddenTimelines, setHiddenTimelines] = useState<Set<number>>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')
      if (Array.isArray(v)) return new Set(v.filter((x) => typeof x === 'number'))
    } catch { /* 無視 */ }
    return new Set()
  })
  useEffect(() => {
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hiddenTimelines])) } catch { /* 無視 */ }
  }, [hiddenTimelines])
  const toggleTimelineVisible = (id: number) => setHiddenTimelines((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  // 期間バーをレーン詰め表示にするか（packed/unpacked）。トップバーのセグメントトグルで切替。
  // 表示方法は3択: 'unpacked'(1行ずつ) / 'middle'(semi-packed) / 'packed'(全体を詰める)。
  const [laneMode, setLaneMode] = useState<LaneMode>('unpacked')
  // エクスプローラーの帯は単一年表なので semi-packed は packed と同じ。中間も詰めて表示する。
  const stripPacked = laneMode !== 'unpacked'
  // 開発用フラスコボタン（実験用機能の割り当て先。今は未割り当て）。
  // 開発用フラスコ1: メイン領域に全ユーザー一覧（開発環境のみ）を出す。
  const [showDevUsers, setShowDevUsers] = useState(false)
  // 開発用フラスコ2: メイン領域に配色パターン一覧・編集（開発環境のみ）を出す。
  const [showDevSchemes, setShowDevSchemes] = useState(false)
  const devButtons = [
    { active: showDevUsers, title: '開発用フラスコ1: 全ユーザー一覧', onClick: () => { setShowSettings(false); setShowDevSchemes(false); setShowDevUsers((v) => !v) } },
    { active: showDevSchemes, title: '開発用フラスコ2: 配色一覧', onClick: () => { setShowSettings(false); setShowDevUsers(false); setShowDevSchemes((v) => !v) } },
    { active: false, title: '開発用フラスコ3', onClick: () => { /* 未割り当て */ } },
  ]
  // イベントリストのクリックでチャートを中央へ寄せるリクエスト（n でトリガー）
  const [centerReq, setCenterReq] = useState<{ id: number; n: number } | null>(null)
  // エクスプローラー（他ユーザーの年表を探す）画面の表示。ゲストは年表が空なので、
  // まず他の人の年表が見えるエクスプローラーから始める。
  const [showExplorer, setShowExplorer] = useState(isGuest)
  // 設定画面の表示と、ユーザー設定（テーマ等）
  const [showSettings, setShowSettings] = useState(false)
  // 設定画面で最初に開くタブ（歯車→表示 / ユーザー名→アカウント）。
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('appearance')
  // パスワード変更画面（年表を一切出さない独立画面）の表示。
  const [showChangePassword, setShowChangePassword] = useState(false)
  // アカウント削除の確認モーダル表示。
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false)
  // 開発用フラスコボタンを出すか。env.pl 由来の実行環境が development のときだけ true。
  const [showDevButtons, setShowDevButtons] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  // テーマ選択用の配色パターン一覧（ログイン後に取得）。
  const [colorSchemes, setColorSchemes] = useState<ColorScheme[]>([])
  useEffect(() => {
    api.colorSchemes().then(setColorSchemes).catch(() => { /* 取得失敗時はテーマ既定のまま */ })
  }, [])
  // 歯車: 「表示」タブで設定を開く（開いていれば閉じる）。
  const openAppearance = () => { if (showSettings) setShowSettings(false); else { setSettingsTab('appearance'); setShowSettings(true) } }
  // ユーザー名: 「アカウント」タブで設定を開く。
  const openAccount = () => { setSettingsTab('account'); setShowSettings(true) }

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

  // 行の高さ（設定値。バーの位置計算・帯の高さに使う。CSS 変数とも一致させる）。
  const rowH = clampRowHeight(settings.rowHeight)
  // nenpyo_id -> 色 の対応（期間バー・ドットの着色）。仮想年表も自分の行なので色を持つ。
  const tagColors = new Map<number, string>()
  for (const t of tags) tagColors.set(t.id, t.color)
  // 年表一覧（ユーザーが決めた並び順 sort_order。自分の年表とフォロー取込みが混在）。
  const timelines = [...tags].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  // イベントの所属先に選べる年表（自分の実年表のみ。フォロー取込みの仮想年表は除く）。
  const assignableTimelines = timelines.filter((tl) => tl.virtual_nenpyo_id == null)

  // 年表ごとの所属イベント（自分＋フォロー取込み。フォロー分は nenpyo_id が仮想年表 id に
  // 付け替え済みなので、同じ仕組みでまとまる）。
  const eventsByTimeline = new Map<number, EventItem[]>()
  for (const e of events) {
    if (e.nenpyo_id != null) {
      const arr = eventsByTimeline.get(e.nenpyo_id)
      if (arr) arr.push(e); else eventsByTimeline.set(e.nenpyo_id, [e])
    }
  }
  // 年表に未所属（nenpyo_id が null）のイベント。サイドバーの仮想グループの子になる。
  const unassignedEvents = events.filter((e) => e.nenpyo_id == null)
  // メイン領域の行順: 年表ごと（sort_order 順。フォロー取込みも混在）→ 未所属。
  const orderedEvents = [
    ...timelines.flatMap((t) => eventsByTimeline.get(t.id) ?? []),
    ...unassignedEvents,
  ]
  // 非表示（チェックを外した）年表/未所属グループのイベントを除く。
  const chartEvents = orderedEvents.filter((e) =>
    e.nenpyo_id == null ? !hiddenTimelines.has(UNASSIGNED_ID) : !hiddenTimelines.has(e.nenpyo_id)
  )

  // 設定をドキュメントへ反映＆ localStorage に保存
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme)
    document.documentElement.lang = settings.lang
    // 選択中の配色があれば、色を CSS 変数へ上書きする。
    //   1色目(左端) = 背景（左の年表リスト等のサブパネル背景 --panel-2 も同色）,
    //   2色目 = ボタンエリアの背景 --panel（各種ボタン・入力欄の背景 --input-bg も同色）,
    //   3色目 = キーカラー,
    //   4色目 = 見出しの文字色（--heading。「年表」「設定」「テーマ」等）。
    //   未選択・色不足なら上書きを外して data-theme の既定パレットに戻す。
    const root = document.documentElement.style
    const scheme = settings.schemeId != null ? colorSchemes.find((s) => s.id === settings.schemeId) : undefined
    const cols = scheme?.colors ?? []
    const setOrClear = (name: string, val: string | undefined) => {
      if (val) root.setProperty(name, val); else root.removeProperty(name)
    }
    setOrClear('--bg', cols[0]?.color)
    setOrClear('--panel', cols[1]?.color)
    setOrClear('--accent', cols[2]?.color)
    setOrClear('--panel-2', cols[0]?.color)
    setOrClear('--heading', cols[3]?.color)
    setOrClear('--input-bg', cols[1]?.color)
    // 残りの変数（本文/補助文字・境界線・ソフトアクセント）は4色から派生させ、
    // OS のダーク設定の色が残らないようにする。ネイティブ部品（チェックボックス・
    // ドロップダウン等）も color-scheme を背景の明暗に合わせて上書きする。
    const bg = cols[0]?.color, accent = cols[2]?.color, fg = cols[3]?.color
    if (bg && accent && fg) {
      root.setProperty('--text', fg)
      root.setProperty('--muted', mixHex(fg, bg, 0.45))
      root.setProperty('--border', mixHex(fg, bg, 0.72))
      root.setProperty('--accent-soft', mixHex(accent, bg, 0.78))
      root.setProperty('color-scheme', isLightColor(bg) ? 'light' : 'dark')
    } else {
      for (const v of ['--text', '--muted', '--border', '--accent-soft', 'color-scheme']) root.removeProperty(v)
    }
    // 行の高さ・期間バーの太さを CSS 変数で全バー（メイン・エクスプローラー）へ反映。
    // バーは行の高さを超えないよう収める。
    const rh = clampRowHeight(settings.rowHeight)
    document.documentElement.style.setProperty('--row-h', `${rh}px`)
    document.documentElement.style.setProperty('--bar-h', `${Math.min(clampBarHeight(settings.barHeight), rh)}px`)
    document.documentElement.style.setProperty('--label-font', `${clampLabelFont(settings.labelFont)}px`)
    if (i18n.language !== settings.lang) i18n.changeLanguage(settings.lang)
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* 無視 */ }
  }, [settings, colorSchemes])

  const resetForm = (s = '', e = '', t = '', d = '') => {
    setStartText(s); setEndText(e); setTitle(t); setDetail(d); setOngoing(false)
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

  // フォロー/解除のあとは、年表一覧とイベント（仮想年表ぶんを含む）を取り直す。
  const reloadFollows = useCallback(async () => {
    await Promise.all([reloadTags(), reload()])
  }, [reloadTags, reload])

  useEffect(() => { reload(); reloadTags() }, [reload, reloadTags])

  // 実行環境を取得して、開発環境のときだけフラスコボタンを表示する。
  useEffect(() => {
    api.env().then((r) => setShowDevButtons(r.env === 'development')).catch(() => { /* 取得失敗時は非表示のまま */ })
  }, [])

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
        title, detail, nenpyo_id: formNenpyoId, ongoing,
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
        setFormNenpyoId(created.nenpyo_id)
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
  }, [startText, endText, title, detail, formNenpyoId, ongoing, isNew, selectedId, reload, scheduleSave])

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
    // フォロー取込み（他ユーザー）のイベントは読み取り専用。選択だけして編集画面は開かない。
    if (e.readonly) { setChartSelectedId(e.id); return }
    // 年表の追加/編集フォームが開いている間は、イベント編集を開かない。
    if (addingTag || editingTagId != null) return
    flushSave()
    setShowSettings(false)
    setSelectedId(e.id)
    setIsNew(false)
    setConfirmDelete(false)
    setFormNenpyoId(e.nenpyo_id)
    resetForm(
      dateToText(e.start_year, e.start_month, e.start_day),
      dateToText(e.end_year, e.end_month, e.end_day),
      e.title, e.detail,
    )
    setOngoing(e.ongoing)
  }

  // 新規イベント追加。年表 id を渡すと、その年表に属する状態で開く。
  const startNew = (timelineId?: number) => {
    // 年表の追加/編集フォームが開いている間は開かない。
    if (addingTag || editingTagId != null) return
    flushSave()
    setShowSettings(false)
    setSelectedId(null)
    setIsNew(true)
    setConfirmDelete(false)
    setFormNenpyoId(timelineId ?? null)
    resetForm()
  }

  // 入力・編集画面を閉じて年表チャートへ戻る
  const closeEditor = () => {
    flushSave()
    setSelectedId(null)
    setIsNew(false)
    setConfirmDelete(false)
    setError('')
    setFormNenpyoId(null)
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

  // 年表とその所属イベントをテキストにしてダウンロードする。
  const downloadTimeline = (tl: Tag) => {
    const evs = eventsByTimeline.get(tl.id) ?? []
    const lines: string[] = [tl.name, '='.repeat(20), '']
    for (const e of evs) {
      lines.push(`${formatRangeAD(e)}\t${e.title || t('common.untitled')}`)
      if (e.detail) for (const dl of e.detail.split(/\r\n|\r|\n/)) lines.push('  ' + dl)
      lines.push('')
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (tl.name || 'timeline').replace(/[\/\\:*?"<>|]/g, '_') + '.txt'
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
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

  // withEvents=true なら配下イベントも一緒に削除。false なら従来どおりイベントは未所属に残る。
  const deleteTag = async (id: number, withEvents: boolean) => {
    if (tagSaveTimer.current != null) { clearTimeout(tagSaveTimer.current); tagSaveTimer.current = null }
    try {
      await api.deleteTag(id, withEvents)
      setFormNenpyoId((cur) => (cur === id ? null : cur))
      setEditingTagId(null)
      await reloadTags()
      await reload() // 年表削除でイベントは削除（withEvents時）または nenpyo_id が SET NULL
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const startEditTag = (t: Tag) => {
    // イベントの追加/編集フォームが開いている間は、年表編集を開かない。
    if (isNew || selectedId != null) return
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
    // イベントの追加/編集フォームが開いている間は開かない。
    if (isNew || selectedId != null) return
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

  // アカウント削除を実行。成功したら（関連データはサーバー側で全消去）ログイン前へ戻す。
  const doDeleteAccount = async () => {
    try {
      await api.deleteAccount()
      setConfirmDeleteAccount(false)
      onLogout()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const editing = isNew || selectedId != null

  // サイドバーの年表（および未所属グループ）配下に出すイベント1件分。両方で使い回す。
  const renderSubEvent = (e: EventItem) => (
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
        <span className="tl-sub-title">{e.title || t('common.untitled')}</span>
      </div>
      {!e.readonly && (
        <button className="tag-icon-btn" title={t('common.edit')} onClick={(ev) => { ev.stopPropagation(); selectEvent(e) }}><Pencil size={14} /></button>
      )}
    </li>
  )

  // パスワード変更中は、ログイン画面と同様に年表 UI を出さず専用画面だけを表示する。
  if (showChangePassword) {
    return <ChangePasswordView onDone={() => setShowChangePassword(false)} />
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand" onClick={() => { if (!showSettings) window.location.reload() }}><ScrollText size={22} /> nenpyo</div>
          {/* 画面切替のセグメント（2択）。左=自分の年表 / 右=エクスプローラー */}
          <div className="seg-toggle" role="group">
            <button
              className={'seg-btn' + (!showExplorer ? ' active' : '')}
              title={t('nav.mine')} aria-label={t('nav.mine')} aria-pressed={!showExplorer}
              disabled={showSettings}
              onClick={() => setShowExplorer(false)}
            >
              <User size={18} />
            </button>
            <button
              className={'seg-btn' + (showExplorer ? ' active' : '')}
              title={t('nav.explorer')} aria-label={t('nav.explorer')} aria-pressed={showExplorer}
              disabled={showSettings}
              onClick={() => setShowExplorer(true)}
            >
              <Compass size={18} />
            </button>
          </div>
          {/* 表示方法のセグメント切替（3択）。左=1行ずつ / 中=中間 / 右=詰める */}
          <div className="seg-toggle" role="group">
            <button
              className={'seg-btn' + (laneMode === 'unpacked' ? ' active' : '')}
              title={t('nav.unpacked')} aria-label={t('nav.unpacked')} aria-pressed={laneMode === 'unpacked'}
              disabled={showSettings}
              onClick={() => setLaneMode('unpacked')}
            >
              <ChartBarBig size={18} />
            </button>
            <button
              className={'seg-btn' + (laneMode === 'middle' ? ' active' : '')}
              title={t('nav.middle')} aria-label={t('nav.middle')} aria-pressed={laneMode === 'middle'}
              disabled={showSettings}
              onClick={() => setLaneMode('middle')}
            >
              <ChartNoAxesGantt size={18} />
            </button>
            <button
              className={'seg-btn' + (laneMode === 'packed' ? ' active' : '')}
              title={t('nav.packed')} aria-label={t('nav.packed')} aria-pressed={laneMode === 'packed'}
              disabled={showSettings}
              onClick={() => setLaneMode('packed')}
            >
              <ChartBarStacked size={18} />
            </button>
          </div>
        </div>
        {showDevButtons && (
          <div className="topbar-center">
            {devButtons.map((b, i) => (
              <button
                key={i}
                className={'icon-btn dev-btn' + (b.active ? ' active' : '')}
                title={b.title}
                disabled={showSettings}
                onClick={b.onClick}
              >
                <FlaskConical size={18} />
              </button>
            ))}
          </div>
        )}
        <div className="topbar-right">
          {!isGuest && (
            <button className="who" title={t('settings.tabAccount')} onClick={openAccount}>{username}</button>
          )}
          <button className={'icon-btn' + (showSettings ? ' active' : '')} title={t('nav.settings')} onClick={openAppearance}><Settings size={18} /></button>
          {isGuest ? (
            <button className="login-btn" onClick={onRequestLogin}>{t('nav.loginRegister')}</button>
          ) : (
            <button className="icon-btn" title={t('nav.logout')} aria-label={t('nav.logout')} onClick={logout}><LogOut size={18} /></button>
          )}
        </div>
      </header>

      <div className="body" ref={bodyRef}>
        <aside className="list" style={{ width: sidebarWidth }}>
          <div className="list-pane" style={timelinesCollapsed ? { flex: '0 0 auto' } : { flex: '1 1 0', minHeight: 0 }}>
            <div className="list-head">
              <button className="list-collapse" title={timelinesCollapsed ? t('common.expand') : t('common.collapse')} onClick={() => setTimelinesCollapsed((v) => !v)}>
                {timelinesCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                <span className="list-head-title">{t('sidebar.timelines')}</span>
              </button>
              <button className="list-add-btn" title={t('sidebar.addTimeline')} onClick={() => { setTimelinesCollapsed(false); startAddTimeline() }}>
                <Plus size={15} />
              </button>
            </div>
            {!timelinesCollapsed && (<>
            {timelines.length === 0 && <p className="tag-empty">{t('sidebar.emptyTimelines')}</p>}
            <div className="tag-list-scroll">
            <ul className="tag-list">
              {timelines.map((tl) => {
                const tEvents = eventsByTimeline.get(tl.id) ?? []
                const open = expandedTimelines.has(tl.id)
                const isVirtual = tl.virtual_nenpyo_id != null // フォロー取込み（読み取り専用イベント）
                return (
                  <li key={tl.id} className="timeline-group">
                    <div className="tag-item">
                      <button className="tl-toggle" title={open ? t('common.collapse') : t('common.expand')} onClick={() => toggleTimelineOpen(tl.id)}>
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <input
                        type="checkbox"
                        className="tl-visible"
                        checked={!hiddenTimelines.has(tl.id)}
                        onChange={() => toggleTimelineVisible(tl.id)}
                        title={t('sidebar.showInMain')}
                      />
                      <span className="tag-name" style={{ background: tl.color, color: textColorFor(tl.color) }}>
                        <span className="tag-name-text">{tl.name}</span>
                        {isVirtual && (
                          tl.virtual_dead
                            ? <span className="tag-owner tag-dead" title={t('sidebar.followDeleted')}>{t('sidebar.deleted')}</span>
                            : <span className="tag-owner" title={t('sidebar.followedFrom', { owner: tl.owner ?? '?' })}><LinkIcon size={11} />@{tl.owner}</span>
                        )}
                      </span>
                      <span className="tag-count">{t('common.itemCount', { n: tEvents.length })}</span>
                      <button className="tag-icon-btn" title={t('sidebar.editTimeline')} onClick={() => startEditTag(tl)}><Pencil size={15} /></button>
                      {!isVirtual ? (
                        <button className="tag-icon-btn" title={t('sidebar.addEventHere')} onClick={() => { setExpandedTimelines((p) => new Set(p).add(tl.id)); startNew(tl.id) }}><Plus size={15} /></button>
                      ) : (
                        // フォロー年表は「＋」が無いので、同じ幅の空要素で鉛筆の位置を他の年表と揃える。
                        <span className="tag-icon-spacer" aria-hidden="true" />
                      )}
                    </div>
                    {open && tEvents.length > 0 && (
                      <ul className="timeline-events">
                        {tEvents.map(renderSubEvent)}
                      </ul>
                    )}
                  </li>
                )
              })}
              {/* 仮想グループ「（年表に未所属）」。DBには存在しない。未所属イベントがあるときだけ、
                  常に一覧の最下部に固定で表示する。名前・色は変更不可、並べ替え不可。 */}
              {unassignedEvents.length > 0 && (() => {
                const open = expandedTimelines.has(UNASSIGNED_ID)
                return (
                  <li key="unassigned" className="timeline-group">
                    <div className="tag-item">
                      <button className="tl-toggle" title={open ? t('common.collapse') : t('common.expand')} onClick={() => toggleTimelineOpen(UNASSIGNED_ID)}>
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <input
                        type="checkbox"
                        className="tl-visible"
                        checked={!hiddenTimelines.has(UNASSIGNED_ID)}
                        onChange={() => toggleTimelineVisible(UNASSIGNED_ID)}
                        title={t('sidebar.showInMain')}
                      />
                      <span className="tag-name tag-name-unassigned">
                        <span className="tag-name-text">{t('event.noTimeline')}</span>
                      </span>
                      <span className="tag-count">{t('common.itemCount', { n: unassignedEvents.length })}</span>
                      {/* 名前変更・追加ボタンは持たないので、他の年表と高さ・位置を揃える空要素 */}
                      <span className="tag-icon-spacer" aria-hidden="true" />
                      <span className="tag-icon-spacer" aria-hidden="true" />
                    </div>
                    {open && (
                      <ul className="timeline-events">
                        {unassignedEvents.map(renderSubEvent)}
                      </ul>
                    )}
                  </li>
                )
              })()}
            </ul>
            {/* 未ログイン（ゲスト）のときは、年表リストの直下に自動削除の注意書きを出す。 */}
            {isGuest && <p className="guest-note">{t('sidebar.guestNote')}</p>}
            </div>
            </>)}
          </div>
        </aside>

        <div className="splitter" onMouseDown={startResize} title={t('common.dragWidth')} />

        <main className="editor">
          {showDevUsers ? (
              <DevUsers onClose={() => setShowDevUsers(false)} />
            ) : showDevSchemes ? (
              <DevColorSchemes
                schemeId={settings.schemeId}
                onSelectScheme={(id) => setSettings((s) => ({ ...s, schemeId: id }))}
                onColorChanged={(sid, colorId, color) => setColorSchemes((prev) => prev.map((s) => (
                  s.id === sid ? { ...s, colors: s.colors.map((c) => (c.id === colorId ? { ...c, color } : c)) } : s
                )))}
                onSchemeCreated={(sc) => setColorSchemes((prev) => [...prev, sc])}
                onClose={() => setShowDevSchemes(false)}
              />
            ) : showExplorer ? (
              <Explorer
                onClose={() => setShowExplorer(false)}
                username={username}
                onFollowChange={reloadFollows}
                wheelPlain={settings.wheelPlain}
                wheelShift={settings.wheelShift}
                wheelCtrl={settings.wheelCtrl}
                zoomFactor={settings.zoomFactor}
                invertZoom={settings.invertZoom}
                packLanes={stripPacked}
                rowHeight={rowH}
              />
            ) : events.length > 0 ? (
              <TimelineChart
                events={chartEvents}
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
                centerRequest={centerReq}
                tagColors={tagColors}
                laneMode={laneMode}
                rowHeight={rowH}
              />
            ) : (
              <div className="placeholder">
                <ScrollText size={48} strokeWidth={1} />
                <p>{t('sidebar.chartPlaceholder')}</p>
              </div>
            )}

          {editing && (
            <div className="panel-overlay">
            <div className="form">
              <div className="form-head">
                <h2 className="form-title">{isNew ? t('event.addTitle') : t('event.editTitle')}</h2>
                <div className="form-head-actions">
                  {!isNew && (
                    <button className="settings-close" onClick={() => setConfirmDelete(true)} title={t('common.delete')} aria-label={t('common.delete')}><Trash2 size={18} /></button>
                  )}
                  <button className="settings-close" onClick={closeEditor} title={t('common.close')} aria-label={t('common.close')}><X size={18} /></button>
                </div>
              </div>
              {(() => {
                const tl = timelines.find((x) => x.id === formNenpyoId)
                return (
                  <div className="fld">
                    <span className="fld-head">{t('event.timeline')}</span>
                    <div className="fld-body">
                      <div className="event-timeline">
                        {tl ? (<>
                          <span className="tag-swatch" style={{ background: tl.color }} />
                          <span className="event-timeline-name">{tl.name}</span>
                        </>) : (<>
                          <span className="hint">{t('event.noTimeline')}</span>
                          {/* 未所属のときは、存在する年表があればドロップダウンで所属先を選べる。 */}
                          {assignableTimelines.length > 0 && (
                            <select
                              className="event-timeline-select"
                              value=""
                              onChange={(ev) => { const id = Number(ev.target.value); if (id) { setFormNenpyoId(id); scheduleSave() } }}
                            >
                              <option value="">{t('event.assignToTimeline')}</option>
                              {assignableTimelines.map((opt) => (
                                <option key={opt.id} value={opt.id}>{opt.name}</option>
                              ))}
                            </select>
                          )}
                        </>)}
                      </div>
                    </div>
                  </div>
                )
              })()}
              <div className="fld">
                <span className="fld-head">{t('event.period')}</span>
                <div className="fld-body">
                  <div className="range-row">
                    <input value={startText} placeholder="yyyy/mm/dd"
                      onChange={(e) => setStartText(e.target.value)} onBlur={scheduleSave} />
                    <span className="range-sep">〜</span>
                    <div className="range-to">
                      <input value={ongoing ? '' : endText} disabled={ongoing}
                        placeholder={ongoing ? t('event.ongoing') : 'yyyy/mm/dd'}
                        onChange={(e) => setEndText(e.target.value)} onBlur={scheduleSave} />
                      <label className="ongoing-check">
                        <input type="checkbox" checked={ongoing}
                          onChange={(e) => { const c = e.target.checked; setOngoing(c); if (c) setEndText(''); scheduleSave() }} />
                        {t('event.ongoing')}
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <label className="fld">
                <span className="fld-head">{t('event.title')}</span>
                <div className="fld-body">
                  <input value={title} maxLength={100} placeholder={t('event.titlePlaceholder')} onChange={(e) => setTitle(e.target.value)} onBlur={scheduleSave} />
                  <span className="char-count">({title.length}/100)</span>
                </div>
              </label>

              <label className="fld grow">
                <span className="fld-head">{t('event.detail')}</span>
                <div className="fld-body">
                  <textarea value={detail} maxLength={1000} placeholder={t('event.detailPlaceholder')} onChange={(e) => setDetail(e.target.value)} onBlur={scheduleSave} />
                  <span className="char-count">({detail.length}/1000)</span>
                </div>
              </label>

              {error && <div className="form-error">{error}</div>}
            </div>
            </div>
          )}

          {(addingTag || editingTagId != null) && (() => {
            // 追加(isAdd)と編集で同じUIを使う。追加中は下書き(newTag*)、編集中は対象年表(tl)を読む。
            const tl = editingTagId != null ? tags.find((x) => x.id === editingTagId) : null
            if (editingTagId != null && !tl) return null
            const isAdd = tl == null
            const pi = tl ? timelines.findIndex((p) => p.id === tl.id) : -1
            const swatchColor = isAdd ? newTagColor : tl!.color
            const nameValue = isAdd ? newTagName : editTagName
            const onColorChange = (color: string) => { isAdd ? setNewTagColor(color) : pickTagColor(tl!, color) }
            const onNameChange = (v: string) => { isAdd ? setNewTagName(v) : setEditTagName(v) }
            // 現在使用中の配色の 5色目以降（c5, c6…）。あればパレットの横に並べ、クリックで即その色に設定。
            const scheme = colorSchemes.find((sc) => sc.id === settings.schemeId)
            const paletteExtras = (scheme?.colors ?? []).slice(4)
            return (
              <div className="panel-overlay">
                <div className="form">
                  <div className="form-head">
                    <h2 className="form-title">{isAdd ? t('timeline.addTitle') : t('timeline.editTitle')}</h2>
                    <div className="form-head-actions">
                      {!isAdd && (<>
                        <button className="settings-close" onClick={() => moveTimeline(tl!.id, -1)} disabled={pi <= 0} title={t('common.moveUp')} aria-label={t('common.moveUp')}><ChevronUp size={18} /></button>
                        <button className="settings-close" onClick={() => moveTimeline(tl!.id, 1)} disabled={pi >= timelines.length - 1} title={t('common.moveDown')} aria-label={t('common.moveDown')}><ChevronDown size={18} /></button>
                      </>)}
                      {!isAdd && (
                        <button className="settings-close" onClick={() => downloadTimeline(tl!)} title={t('timeline.download')} aria-label={t('timeline.download')}><Download size={18} /></button>
                      )}
                      {!isAdd && (
                        <button className="settings-close" onClick={() => { setExpandedTimelines((p) => new Set(p).add(tl!.id)); setDeleteTagWithEvents(false); setConfirmDeleteTagId(tl!.id) }} title={t('common.delete')} aria-label={t('common.delete')}><Trash2 size={18} /></button>
                      )}
                      <button className="settings-close" onClick={closeTagEditor} title={t('common.close')} aria-label={t('common.close')}><X size={18} /></button>
                    </div>
                  </div>

                  <div className="fld">{t('timeline.color')}
                    <div className="color-pick-row">
                      <label className="color-pick" style={{ background: swatchColor ?? '#9a6b3f' }} title={t('timeline.pickColor')}>
                        <Palette size={20} />
                        <input type="color" value={swatchColor ?? '#9a6b3f'} onChange={(ev) => onColorChange(ev.target.value)} />
                      </label>
                      {/* 使用中の配色の c5, c6… があれば四角で並べ、クリックで即その色に設定する。 */}
                      {paletteExtras.map((c, i) => (
                        <button
                          key={c.id}
                          type="button"
                          className="palette-extra-swatch"
                          style={{ background: c.color }}
                          title={`c${i + 5}`}
                          aria-label={`c${i + 5}`}
                          onClick={() => onColorChange(c.color)}
                        />
                      ))}
                    </div>
                  </div>

                  <label className="fld">
                    <span className="fld-head">
                      {t('timeline.name')}
                      {!isAdd && tl!.virtual_nenpyo_id != null && tl!.linked_name != null && tl!.owner != null && (
                        <span className="linked-source">（{tl!.linked_name}@{tl!.owner}）</span>
                      )}
                      <span className="char-count">({nameValue.length}/40)</span>
                    </span>
                    <input
                      autoFocus
                      value={nameValue}
                      maxLength={40}
                      placeholder={t('timeline.name')}
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

        {/* 設定はサイドバー＋メインを覆うモーダル。背後の操作を遮断（歯車・ログアウトはトップバーで有効）。 */}
        {showSettings && (
          <div className="panel-overlay settings-blocker">
            <SettingsPanel
              settings={settings}
              setSettings={setSettings}
              colorSchemes={colorSchemes}
              onClose={() => setShowSettings(false)}
              username={username}
              email={email}
              isGuest={isGuest}
              tab={settingsTab}
              onTabChange={setSettingsTab}
              onChangePassword={() => setShowChangePassword(true)}
              onDeleteAccount={() => setConfirmDeleteAccount(true)}
            />
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p>{t('event.confirmDelete')}</p>
            <div className="modal-actions">
              <button onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</button>
              <button className="danger" onClick={doDelete}>{t('common.deleteConfirm')}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteTagId != null && (() => {
        // フォロー取込みの仮想年表は配下イベントを消せない（元は他人の年表）ので、
        // 「イベントも削除する」チェックボックスは出さない。
        const isVirtual = tags.find((x) => x.id === confirmDeleteTagId)?.virtual_nenpyo_id != null
        return (
        <div className="modal-overlay" onClick={() => setConfirmDeleteTagId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p>{t('timeline.confirmDelete')}</p>
            {!isVirtual && (
              <label className="modal-check">
                <input type="checkbox" checked={deleteTagWithEvents} onChange={(e) => setDeleteTagWithEvents(e.target.checked)} />
                <span>{t('timeline.deleteWithEvents')}</span>
              </label>
            )}
            <div className="modal-actions">
              <button onClick={() => setConfirmDeleteTagId(null)}>{t('common.cancel')}</button>
              <button className="danger" onClick={() => { const id = confirmDeleteTagId; setConfirmDeleteTagId(null); deleteTag(id, !isVirtual && deleteTagWithEvents) }}>{t('common.deleteConfirm')}</button>
            </div>
          </div>
        </div>
        )
      })()}

      {confirmDeleteAccount && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteAccount(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p>{t('settings.account.deleteConfirm')}</p>
            <div className="modal-actions">
              <button onClick={() => setConfirmDeleteAccount(false)}>{t('common.cancel')}</button>
              <button className="danger" onClick={doDeleteAccount}>{t('common.deleteConfirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
