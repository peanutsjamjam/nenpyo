// ユーザー設定（ブラウザの localStorage に保存。端末ごと）。
import { detectLang, type Lang } from '../i18n'

export type Theme = 'light' | 'dark'
// マウスホイール（修飾キー別）に割り当てる動作
export type WheelAction = 'scroll' | 'pan' | 'zoom' | 'none'
export const WHEEL_ACTIONS: WheelAction[] = ['scroll', 'pan', 'zoom', 'none']
// 拡大縮小の倍率（1ノッチあたり）の選択肢
export const ZOOM_FACTORS = [1.05, 1.1, 1.2, 1.3, 1.5]

export type AppSettings = {
  theme: Theme
  lang: Lang
  invertZoom: boolean
  wheelPlain: WheelAction
  wheelShift: WheelAction
  wheelCtrl: WheelAction
  zoomFactor: number
  moveClickedIntoView: boolean
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
  }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...defaults, ...JSON.parse(raw) }
  } catch { /* 壊れていたら既定値 */ }
  return defaults
}
