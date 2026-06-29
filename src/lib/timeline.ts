// 時間軸の座標モデルと、上バー（グリッド線・世紀マーク）／レーン詰めの計算。
// 期間バー・グリッドの位置はすべて「年」を単位とする座標で表す。
import { monthLabel } from '../api'
import i18n from '../i18n'
import { daysInYear, daysInMonth, monthLengths } from './calendar'

// 年月日を「時間軸の座標」に変換（バー・グリッドの位置計算用）。単位は「年」。
// 西暦0年は存在しないので AD1/1/1 を座標 0 とし、AD と BC を隙間なく連続させる。
// 年内は通算日(0始まり)をその年の実日数で割った割合で表す（=各月が実際の長さを持つ）。
//   AD年(>=1): pos = (year-1) + 年内割合 / BC年(<=-1): pos = year + 年内割合
// 月日が無ければ年頭扱い。
export function fracYear(year: number, month: number | null, day: number | null): number {
  const ml = monthLengths(year)
  let doy = (day ?? 1) - 1                 // 0 始まりの通算日
  const m = (month ?? 1) - 1
  for (let i = 0; i < m; i++) doy += ml[i]
  const base = year >= 1 ? year - 1 : year
  return base + doy / daysInYear(year)
}

// 時間軸の座標 → 年・月・日（fracYear の逆変換）。
export function posToYMD(pos: number): { year: number; month: number; day: number } {
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
export function posToYM(pos: number): { year: number; month: number } {
  const { year, month } = posToYMD(pos)
  return { year, month }
}

// 上バー（グリッド線）用の年表記。BC の前／AD の後ろの空白を詰める。1000年以上は AD なし。
export function gridYearLabel(year: number): string {
  if (year < 0) return `${-year}BC`
  if (year >= 1000) return `${year}`
  return `AD${year}`
}

// グリッド刻みとズーム範囲（座標=年単位）。最小は1日、最大は10万年スケール。
export const DAY = 1 / 366                   // 公称1日（刻み選択・最小ズーム・現在帯幅用。実日幅は年で可変）
export const MONTH = 1 / 12                  // 公称1ヶ月（刻み選択用）
export const GRID_STEPS = [DAY, MONTH, 1, 5, 10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000]
export const MIN_YEARS = DAY                 // 表示幅の下限（約1日）
export const MAX_YEARS = 40000               // 表示幅の上限
export const LABEL_FONT_PX = 14              // 期間バー内タイトルの文字サイズ（CSS と一致させる）
export const ROW_PX = 34                     // 1行（期間バー行）の高さ（CSS .chart-row と一致させる）
export const MAX_GRID_LINES_AT_1000PX = 25   // メイン領域の横幅 1000px あたりの縦線の最大本数（幅に比例）
export const NOW_FADE_PX = 24                // 現在帯（赤）がこのpx幅に近づくほど薄くする（小さいほど早く薄くなる）
// バーの実描画範囲はビューポート(0〜100%)の外側にこの%までに収める。
// 巨大な要素はブラウザがペイントしないため、長いバーが消える現象を防ぐ（見た目は overflow:hidden で同じ）。
export const BAR_CLAMP = 200

// 指定された最も細かい単位の「座標上の幅」（日=1/年日数、月=その月の実日数/年日数、年=1）
export function unitWidth(year: number, month: number | null, day: number | null): number {
  if (day != null) return 1 / daysInYear(year)
  if (month != null) return daysInMonth(year, month) / daysInYear(year)
  return 1
}
// バー位置計算に必要な日付フィールドだけの構造的な型（EventItem も ExploreEvent も満たす）。
export type EventDates = {
  start_year: number; start_month: number | null; start_day: number | null
  end_year: number | null; end_month: number | null; end_day: number | null
  ongoing?: boolean
}
// バーの占有区間 [s, end)。終了は「その単位の終わり＝次の単位の頭」まで広げる。
// 継続中(ongoing)は本日の終わりまで伸ばす。
export function eventSpan(e: EventDates): { s: number; end: number } {
  const s = fracYear(e.start_year, e.start_month, e.start_day)
  if (e.ongoing) {
    const now = new Date()
    const todayEnd = fracYear(now.getFullYear(), now.getMonth() + 1, now.getDate()) + DAY
    return { s, end: Math.max(s + DAY, todayEnd) }
  }
  const end = e.end_year == null
    ? s + unitWidth(e.start_year, e.start_month, e.start_day)
    : fracYear(e.end_year, e.end_month, e.end_day) + unitWidth(e.end_year, e.end_month, e.end_day)
  return { s, end }
}

export type GridLine = { left: number; major: boolean; bottomLabel: string }
// 上バーの「バンドラベル」（最上段の世紀、2段目の年/月）。バンドの開始位置に置き、
// 開始が画面左に消えていても、その先頭は左端に貼り付けて「今どのバンドか」を示す。
export type AxisMark = { left: number; label: string }
// 後方互換のための別名（旧称）。
export type CenturyMark = AxisMark
// 表示範囲に入る世紀バンド（pos=100×k 区切り）の開始位置とラベルを返す。
// k>=0 は AD 世紀(k+1)、k<0 は BC 世紀(-k)。先頭バンドは左端に貼り付ける。
// 世紀が多すぎる（ズームアウト時）は出さない。
export function buildCenturyMarks(rangeStart: number, rangeEnd: number, yearsVisible: number): AxisMark[] {
  const kFirst = Math.floor(rangeStart / 100)
  const kLast = Math.floor(rangeEnd / 100)
  if (kLast - kFirst > 40) return []
  const pct = (y: number) => ((y - rangeStart) / yearsVisible) * 100
  const marks: AxisMark[] = []
  for (let k = kFirst; k <= kLast; k++) {
    const label = k >= 0 ? i18n.t('axis.century', { n: k + 1 }) : i18n.t('axis.centuryBC', { n: -k })
    marks.push({ left: Math.max(0, pct(100 * k)), label }) // 開始が左端より手前なら 0% に貼り付け
  }
  return marks
}
// 上バー（グリッド線・刻みラベル）と、2段目のバンドラベルを表示範囲から計算する。
// 線が maxGridLines 以内に収まる最も細かい刻み（年/月/日）を選ぶ。
//   下段（bottomLabel）= 刻みそのもの（年 / 月名 / n日）を各縦線に付ける。
//   2段目（bandMarks）= そのひとつ上の単位（月グリッド→年、日グリッド→「年 月」）。
//     世紀行と同様にバンド開始へ置き、左に消えた先頭バンドは左端へ貼り付ける。
//     年グリッドのときは下段が年なので 2段目は無し。
export function buildGridLines(rangeStart: number, rangeEnd: number, yearsVisible: number, maxGridLines: number): { gridLines: GridLine[]; bandMarks: AxisMark[] } {
  const lineCap = maxGridLines + 8 // 安全用の打ち切り
  const pct = (y: number) => ((y - rangeStart) / yearsVisible) * 100
  let gridStep = GRID_STEPS[GRID_STEPS.length - 1]
  for (const iv of GRID_STEPS) {
    if (yearsVisible / iv <= maxGridLines - 1) { gridStep = iv; break }
  }
  const gridLines: GridLine[] = []
  const bandMarks: AxisMark[] = []
  if (gridStep >= 1) {
    // 年グリッド: 「丸い年（刻みの倍数）」＋ AD1 に線を引く（西暦0年は無い）。2段目は無し。
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
      gridLines.push({ left: pct(p), major: y === 1, bottomLabel: gridYearLabel(y) })
    }
  } else if (gridStep >= MONTH) {
    // 月グリッド: 実際の各月1日に線を引く（月幅は実際の長さに比例）。下段=月名。
    const start = posToYMD(rangeStart)
    let y = start.year, m = start.month
    while (gridLines.length < lineCap) {
      const p = fracYear(y, m, 1)
      if (p > rangeEnd) break
      if (p >= rangeStart) {
        gridLines.push({ left: pct(p), major: y === 1 && m === 1, bottomLabel: monthLabel(m) })
      }
      m++; if (m > 12) { m = 1; y++; if (y === 0) y = 1 } // 西暦0年は飛ばす
    }
    // 2段目: 年バンド（1月1日に開始）。先頭（左に消えている年）は左端へ貼り付け。
    let by = start.year
    while (bandMarks.length < lineCap) {
      const p = fracYear(by, 1, 1)
      if (p > rangeEnd) break
      bandMarks.push({ left: Math.max(0, pct(p)), label: gridYearLabel(by) })
      by++; if (by === 0) by = 1
    }
  } else {
    // 日グリッド: 実際の各日に線を引く（その月の実日数まで＝偽の29/30/31日は出ない）。下段=n日。
    const start = posToYMD(rangeStart)
    let y = start.year, m = start.month, d = start.day
    while (gridLines.length < lineCap) {
      const p = fracYear(y, m, d)
      if (p > rangeEnd) break
      if (p >= rangeStart) {
        gridLines.push({ left: pct(p), major: y === 1 && m === 1 && d === 1, bottomLabel: i18n.t('axis.day', { d }) })
      }
      d++
      if (d > daysInMonth(y, m)) { d = 1; m++; if (m > 12) { m = 1; y++; if (y === 0) y = 1 } }
    }
    // 2段目: 「年 月」バンド（各月1日に開始）。先頭（左に消えている月）は左端へ貼り付け。
    let my = start.year, mm = start.month
    while (bandMarks.length < lineCap) {
      const p = fracYear(my, mm, 1)
      if (p > rangeEnd) break
      bandMarks.push({ left: Math.max(0, pct(p)), label: `${gridYearLabel(my)} ${monthLabel(mm)}` })
      mm++; if (mm > 12) { mm = 1; my++; if (my === 0) my = 1 }
    }
  }
  return { gridLines, bandMarks }
}

// レーン詰め: イベントを「範囲が重ならないものは同じ行（レーン）にまとめる」ように配置する。
// 開始座標の昇順に見て、最後の終端がこのイベントの開始以下になっている既存レーンへ入れる。
// 入れられるレーンが無ければ新しいレーンを作る（=次の行）。
export function packLanesOf<T extends EventDates>(events: T[]): T[][] {
  const sorted = [...events].sort((a, b) => eventSpan(a).s - eventSpan(b).s)
  const lanes: { end: number; items: T[] }[] = []
  for (const e of sorted) {
    const { s, end } = eventSpan(e)
    let placed = false
    for (const lane of lanes) {
      if (lane.end <= s) { lane.items.push(e); lane.end = end; placed = true; break }
    }
    if (!placed) lanes.push({ end, items: [e] })
  }
  return lanes.map((l) => l.items)
}

// イベント群の占有範囲（座標）。空なら null。
export function eventsExtent(events: EventDates[]): { min: number; max: number } | null {
  let min = Infinity, max = -Infinity
  for (const e of events) {
    const { s, end } = eventSpan(e)
    if (s < min) min = s
    if (end > max) max = end
  }
  return isFinite(min) && max > min ? { min, max } : (isFinite(min) ? { min, max: min } : null)
}
