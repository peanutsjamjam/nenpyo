// nenpyo API クライアント。api.cgi (Perl + PostgreSQL) と通信する。
// Cookie ベースのセッション認証なので credentials は same-origin。
import i18n from './i18n'
import { daysInMonth } from './lib/calendar'

// ログイン中アカウントの基本情報（me / login / signup_complete / guest が返す）。
// guest=true は、ログインせずに使い始めた一時ユーザー（数日で自動削除される）。
export type Account = {
  username: string
  email: string | null
  guest: boolean
}

// 開発用の全ユーザー一覧（dev_users が返す。開発環境のみ）。
export type DevUser = {
  id: number
  username: string
  email: string | null
  is_guest: boolean
  expires_at: string | null   // ゲストの失効時刻。通常アカウントは null
  created_at: string
  nenpyo_count: number
  event_count: number
}

// 開発用: 指定ユーザーの年表とイベント（dev_user_timeline が返す）。
export type DevUserEvent = {
  id: number
  nenpyo_id: number | null
  start_year: number
  start_month: number | null
  start_day: number | null
  end_year: number | null
  end_month: number | null
  end_day: number | null
  ongoing: boolean
  title: string
  detail: string
}
export type DevUserData = {
  username: string
  nenpyo: { id: number; name: string; color: string }[]
  events: DevUserEvent[]
}

// 配色パターン（color_schemes が返す）。設定のテーマ選択・開発用配色画面で使う。
export type ColorScheme = {
  id: number
  name: string
  colors: { id: number; color: string }[]
}

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
  readonly: boolean          // フォロー取込み（他人の年表）のイベント＝編集不可
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
  virtual_nenpyo_id: number | null // フォロー取込みなら先 nenpyo.id、自分の年表は null
  virtual_dead: boolean            // フォロー先が削除済み（名前だけ残りイベントは無い）
  owner: string | null             // フォロー先の所有者名（自分の年表・削除済みは null）
  linked_name: string | null       // フォロー先の現在の年表名（自分の年表・削除済みは null）
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

// エクスプローラーの検索結果。strips は該当年表（このページ分）、total は総ヒット数。
export type ExploreResult = {
  strips: ExploreTag[]
  total: number
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

// API エラー。翻訳済みメッセージに加え、サーバーのエラーコードと、
// （重複登録など）どの項目が原因かを示す fields を保持する。
export class ApiError extends Error {
  code?: string
  fields?: string[]
  constructor(message: string, code?: string, fields?: string[]) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.fields = fields
  }
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
    const d = (data && typeof data === 'object') ? data as { error?: unknown; params?: unknown; fields?: unknown } : {}
    const code = typeof d.error === 'string' ? d.error : undefined
    const fields = Array.isArray(d.fields) ? d.fields.filter((f): f is string => typeof f === 'string') : undefined
    throw new ApiError(translateError(d.error, d.params, res.status), code, fields)
  }
  return data as T
}

export const api = {
  // 実行環境名（'development' / 'production' / 'unknown'）。env.pl 由来。
  env: () => call<{ env: string }>('GET', 'env'),
  // 開発用: 全ユーザー一覧（開発環境のみ）。
  listUsers: () => call<DevUser[]>('GET', 'dev_users'),
  // 開発用: 指定ユーザーの年表＋イベント（開発環境のみ）。
  devUserTimeline: (id: number) => call<DevUserData>('GET', 'dev_user_timeline', { id }),
  // 配色パターン一覧（要ログイン）。設定のテーマ選択・開発用配色画面で使う。
  colorSchemes: () => call<ColorScheme[]>('GET', 'color_schemes'),
  // 開発用: 配色名を更新（開発環境のみ）。
  devUpdateColorSchemeName: (id: number, name: string) =>
    call<{ id: number; name: string }>('PUT', 'dev_color_scheme', { id, body: { name } }),
  // 開発用: 配色内の1色を更新（開発環境のみ）。
  devUpdateColor: (id: number, color: string) =>
    call<{ id: number; color: string }>('PUT', 'dev_color', { id, body: { color } }),
  // 開発用: 配色に色を1つ追加（末尾。開発環境のみ）。作成された色 {id,color} を返す。
  devAddColor: (schemeId: number) =>
    call<{ id: number; color: string }>('POST', 'dev_color_add', { id: schemeId }),
  // 開発用: 配色の並び順を配列順に更新（開発環境のみ）。
  devReorderColorSchemes: (ids: number[]) =>
    call<{ ok: true }>('POST', 'dev_color_schemes_reorder', { body: { ids } }),
  // 開発用: 配色を複製して新規作成（色ごとコピー、開発環境のみ）。新しい配色を返す。
  devCopyColorScheme: (id: number) =>
    call<ColorScheme>('POST', 'dev_color_scheme_copy', { id }),
  me: () => call<Account>('GET', 'me'),
  // ゲスト（一時ユーザー）を作成してログイン状態にする。me が 401 のときに呼ぶ。
  createGuest: () => call<Account>('POST', 'guest'),
  // メール確認つきサインアップ（申請→リンク→確定の3段階）。
  signupRequest: (email: string) =>
    call<{ ok: true }>('POST', 'signup_request', { body: { email } }),
  signupVerify: (token: string) =>
    call<{ email: string }>('GET', `signup_verify&token=${encodeURIComponent(token)}`),
  signupComplete: (token: string, username: string, password: string) =>
    call<Account>('POST', 'signup_complete', { body: { token, username, password } }),
  login: (email: string, password: string) =>
    call<Account>('POST', 'login', { body: { email, password } }),
  logout: () => call<{ ok: true }>('POST', 'logout'),
  changePassword: (currentPassword: string, newPassword: string) =>
    call<{ ok: true }>('POST', 'change_password', { body: { current_password: currentPassword, new_password: newPassword } }),
  deleteAccount: () => call<{ ok: true }>('DELETE', 'account'),
  listEvents: () => call<EventItem[]>('GET', 'events'),
  createEvent: (e: EventInput) => call<EventItem>('POST', 'event', { body: e }),
  updateEvent: (id: number, e: EventInput) => call<EventItem>('PUT', 'event', { id, body: e }),
  deleteEvent: (id: number) => call<{ ok: true }>('DELETE', 'event', { id }),
  listTags: () => call<Tag[]>('GET', 'tags'),
  createTag: (t: TagInput) => call<Tag>('POST', 'tag', { body: t }),
  updateTag: (id: number, t: TagInput) => call<Tag>('PUT', 'tag', { id, body: t }),
  deleteTag: (id: number, withEvents = false) =>
    call<{ ok: true }>('DELETE', withEvents ? 'tag&with_events=1' : 'tag', { id }),
  reorderTags: (ids: number[]) => call<Tag[]>('POST', 'tags_reorder', { body: { ids } }),
  // 年表を検索（エクスプローラー用）。q は年表名/イベントのタイトル・詳細に部分一致。
  // offset/limit で該当年表をページングし、strips（このページ分）と total（総ヒット数）を返す。
  explore: (q: string, offset: number, limit: number) =>
    call<ExploreResult>('GET', `explore&q=${encodeURIComponent(q)}&offset=${offset}&limit=${limit}`),
  // フォロー（取込み年表は tags/events に仮想年表として混ざって返る）
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

// 月の日数の検証は lib/calendar の暦実装（ユリウス/グレゴリオ）を共有して使う。

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
