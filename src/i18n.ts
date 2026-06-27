// react-i18next の初期化。デフォルトは日本語、英語に切り替え可能。
// 画面の文言は今後 t('...') に順次置き換えていく。翻訳は ja/en の translation に追加する。
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

export const LANGUAGES = ['ja', 'en'] as const
export type Lang = (typeof LANGUAGES)[number]

const resources = {
  ja: {
    translation: {
      settings: {
        title: '設定',
        close: '閉じる',
        language: '言語 / Language',
        theme: 'テーマ',
        light: 'ライトモード',
        dark: 'ダークモード',
        eventList: 'イベントリスト',
        moveIntoView: 'クリックしたイベントを画面内に移動させる',
        savedNote: 'テーマ・操作の設定はこのブラウザに保存されます。',
        wheel: {
          section: 'マウスホイール',
          plain: 'マウスホイール',
          shift: 'Shift＋マウスホイール',
          ctrl: 'Ctrl＋マウスホイール',
          zoomFactor: '拡大縮小の倍率',
          invert: '拡大・縮小の向きを逆にする',
          note: 'ホイールを手前に回すと拡大します（チェックで反転）。',
        },
        action: {
          scroll: '上下スクロール',
          pan: '左右スクロール（パン）',
          zoom: '拡大縮小',
          none: 'なし',
        },
      },
    },
  },
  en: {
    translation: {
      settings: {
        title: 'Settings',
        close: 'Close',
        language: 'Language / 言語',
        theme: 'Theme',
        light: 'Light',
        dark: 'Dark',
        eventList: 'Event list',
        moveIntoView: 'Move the clicked event into view',
        savedNote: 'Theme and control settings are saved in this browser.',
        wheel: {
          section: 'Mouse wheel',
          plain: 'Wheel',
          shift: 'Shift + Wheel',
          ctrl: 'Ctrl + Wheel',
          zoomFactor: 'Zoom factor',
          invert: 'Reverse zoom direction',
          note: 'Scroll the wheel toward you to zoom in (check to reverse).',
        },
        action: {
          scroll: 'Vertical scroll',
          pan: 'Pan (horizontal)',
          zoom: 'Zoom',
          none: 'None',
        },
      },
    },
  },
}

i18n.use(initReactI18next).init({
  resources,
  lng: 'ja',
  fallbackLng: 'ja',
  interpolation: { escapeValue: false }, // React が自前でエスケープするため不要
})

export default i18n
