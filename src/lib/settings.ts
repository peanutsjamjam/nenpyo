// ユーザー設定（ブラウザの localStorage に保存。端末ごと）。
import { detectLang, type Lang } from '../i18n'

export type Theme = 'light' | 'dark'
// マウスホイール（修飾キー別）に割り当てる動作
export type WheelAction = 'scroll' | 'pan' | 'zoom' | 'none'
export const WHEEL_ACTIONS: WheelAction[] = ['scroll', 'pan', 'zoom', 'none']
// 拡大縮小の倍率（1ノッチあたり）の選択肢
export const ZOOM_FACTORS = [1.05, 1.1, 1.2, 1.3, 1.5]

// 行の高さ（px）。期間バー1本ぶんの行の高さ。
export const ROW_HEIGHT = { min: 16, max: 64, def: 34, step: 2 }
export function clampRowHeight(h: number): number {
  if (!Number.isFinite(h)) return ROW_HEIGHT.def
  return Math.min(ROW_HEIGHT.max, Math.max(ROW_HEIGHT.min, Math.round(h)))
}
// 期間バーの太さ（px）。行の高さに収まる範囲で可変にする（上限は行の高さ）。
export const BAR_HEIGHT = { min: 6, max: ROW_HEIGHT.max, def: 26, step: 2 }
export function clampBarHeight(h: number): number {
  if (!Number.isFinite(h)) return BAR_HEIGHT.def
  return Math.min(BAR_HEIGHT.max, Math.max(BAR_HEIGHT.min, Math.round(h)))
}
// 期間バー内に表示するタイトルの文字サイズ（px）。
export const LABEL_FONT = { min: 8, max: 28, def: 14, step: 1 }
export function clampLabelFont(s: number): number {
  if (!Number.isFinite(s)) return LABEL_FONT.def
  return Math.min(LABEL_FONT.max, Math.max(LABEL_FONT.min, Math.round(s)))
}

export type AppSettings = {
  theme: Theme
  lang: Lang
  invertZoom: boolean
  wheelPlain: WheelAction
  wheelShift: WheelAction
  wheelCtrl: WheelAction
  zoomFactor: number
  moveClickedIntoView: boolean
  barHeight: number
  rowHeight: number
  labelFont: number
}

export const SETTINGS_KEY = 'nenpyo-settings'

export function loadSettings(): AppSettings {
  const defaults: AppSettings = {
    theme: window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    lang: detectLang(),
    invertZoom: false,
    wheelPlain: 'scroll',
    wheelShift: 'pan',
    wheelCtrl: 'zoom',
    zoomFactor: 1.2,
    moveClickedIntoView: false,
    barHeight: BAR_HEIGHT.def,
    rowHeight: ROW_HEIGHT.def,
    labelFont: LABEL_FONT.def,
  }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...defaults, ...JSON.parse(raw) }
  } catch { /* 壊れていたら既定値 */ }
  return defaults
}
