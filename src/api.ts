// nenpyo API クライアント。api.cgi (Perl + PostgreSQL) と通信する。
// Cookie ベースのセッション認証なので credentials は same-origin。

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
}

const API = `${import.meta.env.BASE_URL}api.cgi`

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
    const msg = data && typeof data === 'object' && 'error' in data ? (data as { error: string }).error : `エラー (${res.status})`
    throw new Error(msg)
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
}

// 年の表示（負値=紀元前）
export function formatYear(year: number): string {
  return year < 0 ? `紀元前${-year}年` : `${year}年`
}

// 年月日をまとめて表示
export function formatDate(year: number, month: number | null, day: number | null): string {
  let s = formatYear(year)
  if (month != null) {
    s += `${month}月`
    if (day != null) s += `${day}日`
  }
  return s
}

export type ParsedDate = { year: number | null; month: number | null; day: number | null }

// テキストを年月日に解析する。
//   空文字            -> 日付なし (year=null)
//   半角数字のみ      -> 年のみ           例: "1853"
//   / または - 区切り -> 年/月 または 年/月/日  例: "1853/7/8", "1853-7-8", "1853/7"
//   先頭の "-" は紀元前の符号として扱う  例: "-660", "-660/3/15"
// 書式が不正なら Error を投げる。
export function parseDateText(text: string): ParsedDate {
  const t = text.trim()
  if (t === '') return { year: null, month: null, day: null }

  let sign = 1
  let body = t
  if (body.startsWith('-')) { sign = -1; body = body.slice(1) }

  const parts = body.split(/[/-]/)
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) {
    throw new Error(`日付の書式が正しくありません: 「${text}」`)
  }
  const nums = parts.map((p) => Number(p))
  const year = sign * nums[0]
  const month = nums.length >= 2 ? nums[1] : null
  const day = nums.length >= 3 ? nums[2] : null
  if (month != null && (month < 1 || month > 12)) throw new Error(`月が範囲外です: ${month}`)
  if (day != null && (day < 1 || day > 31)) throw new Error(`日が範囲外です: ${day}`)
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

// 開始〜終了をまとめて表示。終了が無ければ開始のみ。
export function formatRange(e: {
  start_year: number; start_month: number | null; start_day: number | null
  end_year: number | null; end_month: number | null; end_day: number | null
}): string {
  const start = formatDate(e.start_year, e.start_month, e.start_day)
  if (e.end_year == null) return start
  return `${start} 〜 ${formatDate(e.end_year, e.end_month, e.end_day)}`
}
