// nenpyo API クライアント。api.cgi (Perl + PostgreSQL) と通信する。
// Cookie ベースのセッション認証なので credentials は same-origin。
import i18n from './i18n'

export type EventItem = {
  id: number
  start_year: number
  start_month: number | null
  start_day: number | null
  end_year: number | null
  end_month: number | null
  end_day: number | null
  title: string
  detail: string
  nenpyo_id: number | null   // 属する年表（最大1つ）。未所属は null
  ongoing: boolean           // 開始〜本日まで継続中（このとき end_* は無し）
  created: number
  updated: number
}

export type EventInput = {
  start_year: number
  start_month: number | null
  start_day: number | null
  end_year: number | null
  end_month: number | null
  end_day: number | null
  title: string
  detail: string
  nenpyo_id: number | null
  ongoing: boolean
}

// 年表（旧 tag）。すべて色と並び順を持つ（prime の区別は廃止）。
export type Tag = {
  id: number
  name: string
  color: string
  sort_order: number
}

export type TagInput = {
  name: string
  color?: string
}

// エクスプローラー用: 1イベント分（自分のものではないので tag_ids 等は不要）
export type ExploreEvent = {
  id: number
  start_year: number
  start_month: number | null
  start_day: number | null
  end_year: number | null
  end_month: number | null
  end_day: number | null
  title: string
  detail: string
  ongoing: boolean
}

// エクスプローラー用: あるユーザーの、ある年表と、それに含まれるイベント群
export type ExploreTag = {
  tag_id: number
  name: string
  color: string
  username: string
  followed: boolean   // 自分がフォロー済みか
  events: ExploreEvent[]
}

// フォロー中の年表（所有者名つき）
export type FollowedTimeline = {
  nenpyo_id: number
  name: string
  color: string
  owner: string
}

// フォロー中の年表＋イベント（本画面に読み取り専用で混ぜる）
export type FollowedData = {
  timelines: FollowedTimeline[]
  events: EventItem[]
}

const API = `${import.meta.env.BASE_URL}api.cgi`

// サーバーが返すエラーコード（+補間 params）を現在の言語の文言へ翻訳する。
// 未知コードはコードそのまま、params.field は field.* を引いて語に展開する。
function translateError(code: unknown, params: unknown, status: number): string {
  if (typeof code !== 'string') return i18n.t('errors.http', { status })
  const p: Record<string, unknown> = (params && typeof params === 'object') ? { ...(params as object) } : {}
  if (typeof p.field === 'string') p.field = i18n.t(`field.${p.field}`)
  const msg = i18n.t(`errors.${code}`, p as Record<string, string | number>)
  return msg === `errors.${code}` ? code : msg // 未知コードはそのまま
}

async function call<T>(method: string, action: string, opts: { id?: number; body?: unknown } = {}): Promise<T> {
  let url = `${API}?action=${action}`
  if (opts.id != null) url += `&id=${opts.id}`
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: opts.body != null ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const d = (data && typeof data === 'object') ? data as { error?: unknown; params?: unknown } : {}
    throw new Error(translateError(d.error, d.params, res.status))
  }
  return data as T
}

export const api = {
  me: () => call<{ username: string }>('GET', 'me'),
  register: (username: string, password: string) =>
    call<{ username: string }>('POST', 'register', { body: { username, password } }),
  login: (username: string, password: string) =>
    call<{ username: string }>('POST', 'login', { body: { username, password } }),
  logout: () => call<{ ok: true }>('POST', 'logout'),
  listEvents: () => call<EventItem[]>('GET', 'events'),
  createEvent: (e: EventInput) => call<EventItem>('POST', 'event', { body: e }),
  updateEvent: (id: number, e: EventInput) => call<EventItem>('PUT', 'event', { id, body: e }),
  deleteEvent: (id: number) => call<{ ok: true }>('DELETE', 'event', { id }),
  listTags: () => call<Tag[]>('GET', 'tags'),
  createTag: (t: TagInput) => call<Tag>('POST', 'tag', { body: t }),
  updateTag: (id: number, t: TagInput) => call<Tag>('PUT', 'tag', { id, body: t }),
  deleteTag: (id: number) => call<{ ok: true }>('DELETE', 'tag', { id }),
  reorderTags: (ids: number[]) => call<Tag[]>('POST', 'tags_reorder', { body: { ids } }),
  // 全ユーザーの年表（と各年表のイベント）を取得（エクスプローラー用）
  explore: () => call<ExploreTag[]>('GET', 'explore'),
  // フォロー
  listFollows: () => call<FollowedTimeline[]>('GET', 'follows'),
  getFollowed: () => call<FollowedData>('GET', 'followed'),
  follow: (nenpyoId: number) => call<{ ok: true }>('POST', 'follow', { body: { nenpyo_id: nenpyoId } }),
  unfollow: (nenpyoId: number) => call<{ ok: true }>('DELETE', `follow&nenpyo_id=${nenpyoId}`),
}

// 年の AD/BC 表記。BC は数字の後ろ、AD は数字の前。西暦1000年以上は「AD」を付けない。
// BC/AD はラテン略号として言語によらず共通（日本語でも通用するため）。
export function formatYearAD(year: number): string {
  if (year < 0) return `${-year} BC`
  if (year >= 1000) return `${year}`
  return `AD ${year}`
}

// 月の短縮名をロケール対応で返す（例: 7月 / Jul）。年に依存しないダミー日付で整形。
const monthFmtCache = new Map<string, Intl.DateTimeFormat>()
export function monthLabel(month: number): string {
  const loc = i18n.language || 'en'
  let fmt = monthFmtCache.get(loc)
  if (!fmt) { fmt = new Intl.DateTimeFormat(loc, { month: 'short' }); monthFmtCache.set(loc, fmt) }
  return fmt.format(new Date(2000, month - 1, 1))
}

// 年月日を「人間が読む用」に整形する。語順は各言語の自然な並びに従う
// （日本語: 年→月→日 / 英語: 月 日, 年）。
// AD/BC は年に固定せず era トークン（前置 eraPre / 後置 eraSuf）として分離し、
// テンプレート側で日付全体の前後に置けるようにする（例: 英語 "AD Jul 8, 794"）。
// AD は前置、BC は後置、西暦1000年以上は付けない。
export function formatDateAD(year: number, month: number | null, day: number | null): string {
  let eraPre = '', eraSuf = '', y = year
  if (year < 0) { eraSuf = ' BC'; y = -year }
  else if (year < 1000) { eraPre = 'AD ' }
  const params = { eraPre, eraSuf, year: y, month: month != null ? monthLabel(month) : '', day }
  if (month == null) return i18n.t('date.y', params)
  return day == null ? i18n.t('date.ym', params) : i18n.t('date.ymd', params)
}

export type ParsedDate = { year: number | null; month: number | null; day: number | null }

// うるう年判定（1582年より前はユリウス暦、以降はグレゴリオ暦）と月の日数（入力検証用）。
function isLeap(year: number): boolean {
  if (year < 1582) return year % 4 === 0 // ユリウス暦
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 // グレゴリオ暦
}
function daysInMonth(year: number, month: number): number {
  return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

// テキストを年月日に解析する。
//   空文字       -> 日付なし (year=null)
//   半角数字のみ -> 年のみ              例: "1853"
//   "/" 区切り   -> 年/月 または 年/月/日  例: "1853/7/8", "1853/7"
//   先頭の "-" は紀元前の符号としてのみ扱う  例: "-660", "-660/3/15"
//   （ハイフンは日付区切りには使えない）
// 書式が不正なら Error を投げる。
export function parseDateText(text: string): ParsedDate {
  const t = text.trim()
  if (t === '') return { year: null, month: null, day: null }

  let sign = 1
  let body = t
  if (body.startsWith('-')) { sign = -1; body = body.slice(1) }

  const parts = body.split('/')
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) {
    throw new Error(`日付の書式が正しくありません: 「${text}」`)
  }
  const nums = parts.map((p) => Number(p))
  const year = sign * nums[0]
  const month = nums.length >= 2 ? nums[1] : null
  const day = nums.length >= 3 ? nums[2] : null
  // 西暦0年は存在しない（紀元前1年の翌日は西暦1年）。紀元前は先頭に「-」（例: -1）。
  if (year === 0) throw new Error('西暦0年は存在しません（紀元前は先頭に「-」、例: -1）')
  if (month != null && (month < 1 || month > 12)) throw new Error(`月が範囲外です: ${month}`)
  if (day != null) {
    const max = daysInMonth(year, month as number) // 月が無ければ day も無いので month は非null
    if (day < 1 || day > max) throw new Error(`日が範囲外です: ${month}月は${max}日まで`)
  }
  return { year, month, day }
}

// 年月日を入力テキスト用の文字列に戻す（編集時にフォームへ表示）。
export function dateToText(year: number | null, month: number | null, day: number | null): string {
  if (year == null) return ''
  let s = String(year)
  if (month != null) {
    s += `/${month}`
    if (day != null) s += `/${day}`
  }
  return s
}

// 開始〜終了を AD/BC 表記でまとめて表示。継続中は「〜継続中」、終了が無ければ開始のみ。
export function formatRangeAD(e: {
  start_year: number; start_month: number | null; start_day: number | null
  end_year: number | null; end_month: number | null; end_day: number | null
  ongoing?: boolean
}): string {
  const start = formatDateAD(e.start_year, e.start_month, e.start_day)
  if (e.ongoing) return `${start} 〜 継続中`
  if (e.end_year == null) return start
  return `${start} 〜 ${formatDateAD(e.end_year, e.end_month, e.end_day)}`
}
