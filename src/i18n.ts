// react-i18next の初期化。デフォルトは日本語、英語に切り替え可能。
// 画面の文言は今後 t('...') に順次置き換えていく。翻訳は ja/en の translation に追加する。
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

export const LANGUAGES = ['ja', 'en'] as const
export type Lang = (typeof LANGUAGES)[number]

const resources = {
  ja: { translation: {} },
  en: { translation: {} },
}

i18n.use(initReactI18next).init({
  resources,
  lng: 'ja',
  fallbackLng: 'ja',
  interpolation: { escapeValue: false }, // React が自前でエスケープするため不要
})

export default i18n
