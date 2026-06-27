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
      common: {
        untitled: '（無題）',
        cancel: 'キャンセル',
        delete: '削除',
        deleteConfirm: '削除する',
        edit: '編集',
        close: '閉じる',
        loading: '読み込み中…',
        expand: '展開する',
        collapse: '畳む',
        moveUp: '上へ',
        moveDown: '下へ',
        dragWidth: 'ドラッグで幅を変更',
        itemCount: '{{n}}件',
      },
      nav: {
        explorer: 'エクスプローラー（他ユーザーの年表を探す）',
        settings: '設定',
        logout: 'ログアウト',
      },
      sidebar: {
        timelines: '年表',
        addTimeline: '年表を追加',
        emptyTimelines: '「＋」で年表を作成できます。',
        showInMain: 'メイン領域に表示する',
        editTimeline: '年表を編集',
        addEventHere: 'この年表にイベントを追加',
        following: 'フォロー中',
        chartPlaceholder: '「出来事を追加」から年表をつくりましょう。',
      },
      event: {
        addTitle: 'イベントの追加',
        editTitle: 'イベントの編集',
        timeline: '年表',
        noTimeline: '（年表に未所属）',
        period: '期間',
        ongoing: '現在まで継続中',
        title: 'タイトル',
        titlePlaceholder: '出来事の名前',
        detail: '詳細',
        detailPlaceholder: '説明（任意）',
        confirmDelete: 'この出来事を削除しますか？',
      },
      timeline: {
        addTitle: '年表の追加',
        editTitle: '年表の編集',
        color: '色',
        pickColor: 'クリックで色を選ぶ',
        name: '年表名',
        confirmDelete: 'この年表を削除しますか？',
      },
      chart: {
        selectHint: 'イベントを選択すると詳細を表示します',
      },
      explorer: {
        title: 'エクスプローラー',
        empty: '表示できる年表がありません。',
        noEvents: 'イベントなし',
        follow: '＋ フォロー',
        following: 'フォロー中',
        followTip: 'この年表をフォローする',
        unfollowTip: 'フォローを解除',
      },
      auth: {
        tagline: '自分だけの歴史年表をつくろう',
        login: 'ログイン',
        register: '新規登録',
        username: 'ユーザー名',
        password: 'パスワード',
        passwordConfirm: 'パスワード（確認）',
        passwordMismatch: 'パスワードが一致しません',
        submitLogin: 'ログイン',
        submitRegister: '登録してはじめる',
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
      common: {
        untitled: '(untitled)',
        cancel: 'Cancel',
        delete: 'Delete',
        deleteConfirm: 'Delete',
        edit: 'Edit',
        close: 'Close',
        loading: 'Loading…',
        expand: 'Expand',
        collapse: 'Collapse',
        moveUp: 'Move up',
        moveDown: 'Move down',
        dragWidth: 'Drag to resize width',
        itemCount: '{{n}}',
      },
      nav: {
        explorer: 'Explorer (browse others’ timelines)',
        settings: 'Settings',
        logout: 'Log out',
      },
      sidebar: {
        timelines: 'Timelines',
        addTimeline: 'Add timeline',
        emptyTimelines: 'Create a timeline with “+”.',
        showInMain: 'Show in main area',
        editTimeline: 'Edit timeline',
        addEventHere: 'Add an event to this timeline',
        following: 'Following',
        chartPlaceholder: 'Add events to build your timeline.',
      },
      event: {
        addTitle: 'Add event',
        editTitle: 'Edit event',
        timeline: 'Timeline',
        noTimeline: '(no timeline)',
        period: 'Period',
        ongoing: 'Ongoing (to present)',
        title: 'Title',
        titlePlaceholder: 'Event name',
        detail: 'Details',
        detailPlaceholder: 'Description (optional)',
        confirmDelete: 'Delete this event?',
      },
      timeline: {
        addTitle: 'Add timeline',
        editTitle: 'Edit timeline',
        color: 'Color',
        pickColor: 'Click to choose a color',
        name: 'Timeline name',
        confirmDelete: 'Delete this timeline?',
      },
      chart: {
        selectHint: 'Select an event to see details',
      },
      explorer: {
        title: 'Explorer',
        empty: 'No timelines to show.',
        noEvents: 'No events',
        follow: '+ Follow',
        following: 'Following',
        followTip: 'Follow this timeline',
        unfollowTip: 'Unfollow',
      },
      auth: {
        tagline: 'Build your own history timeline',
        login: 'Log in',
        register: 'Sign up',
        username: 'Username',
        password: 'Password',
        passwordConfirm: 'Password (confirm)',
        passwordMismatch: 'Passwords do not match',
        submitLogin: 'Log in',
        submitRegister: 'Sign up and start',
      },
    },
  },
}

// 起動時の言語は保存済み設定（nenpyo-settings.lang）から決める。
// ログイン前（AuthView）でも保存した言語で表示されるようにするため。
function initialLang(): Lang {
  try {
    const raw = localStorage.getItem('nenpyo-settings')
    if (raw) {
      const v = JSON.parse(raw)
      if (v && (LANGUAGES as readonly string[]).includes(v.lang)) return v.lang as Lang
    }
  } catch { /* 壊れていたら既定 */ }
  return 'ja'
}

const startLang = initialLang()

i18n.use(initReactI18next).init({
  resources,
  lng: startLang,
  fallbackLng: 'ja',
  interpolation: { escapeValue: false }, // React が自前でエスケープするため不要
})

if (typeof document !== 'undefined') document.documentElement.lang = startLang

export default i18n
