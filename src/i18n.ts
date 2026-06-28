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
      axis: {
        day: '{{d}}日',
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
      field: { start: '開始', end: '終了' },
      errors: {
        http: 'エラー（{{status}}）',
        not_authenticated: 'ログインが必要です',
        year_zero: '西暦0年は存在しません（紀元前は負の数、例: -1）',
        date_year_invalid: '{{field}}の年が不正です',
        date_year_range: '{{field}}の年が範囲外です',
        date_year_required: '{{field}}の年は必須です',
        date_month_invalid: '{{field}}の月が不正です',
        date_day_needs_month: '{{field}}の日は月とともに指定してください',
        date_day_invalid: '{{field}}の日が不正です',
        date_day_range: '{{field}}の日が範囲外です（{{month}}月は{{max}}日まで）',
        title_too_long: 'タイトルは100文字以内にしてください',
        detail_too_long: '詳細は1000文字以内にしてください',
        timeline_name_required: '年表名を入力してください',
        timeline_name_too_long: '年表名は40文字以内にしてください',
        invalid_color: '色の形式が正しくありません（例: #aabbcc）',
        username_length: 'ユーザー名は1〜50文字で入力してください',
        password_too_short: 'パスワードは4文字以上にしてください',
        password_too_long: 'パスワードは128文字以内にしてください',
        username_taken: 'このユーザー名は既に使われています',
        invalid_credentials: 'ユーザー名またはパスワードが違います',
        invalid_id: 'IDが不正です',
        not_found: '見つかりません',
        timeline_name_taken: '同じ名前の年表が既にあります',
        ids_not_array: 'リクエストが不正です',
        invalid_nenpyo_id: '年表IDが不正です',
        cannot_follow_own: '自分の年表はフォローできません',
        db_error: 'データベースに接続できません',
        server_error: 'サーバーエラーが発生しました',
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
      axis: {
        day: '{{d}}',
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
      field: { start: 'Start', end: 'End' },
      errors: {
        http: 'Error ({{status}})',
        not_authenticated: 'Login required',
        year_zero: 'There is no year 0 (use a negative number for BC, e.g. -1)',
        date_year_invalid: 'Invalid {{field}} year',
        date_year_range: '{{field}} year is out of range',
        date_year_required: '{{field}} year is required',
        date_month_invalid: 'Invalid {{field}} month',
        date_day_needs_month: 'Specify the {{field}} day together with a month',
        date_day_invalid: 'Invalid {{field}} day',
        date_day_range: '{{field}} day is out of range (month {{month}} has {{max}} days)',
        title_too_long: 'Title must be 100 characters or fewer',
        detail_too_long: 'Details must be 1000 characters or fewer',
        timeline_name_required: 'Enter a timeline name',
        timeline_name_too_long: 'Timeline name must be 40 characters or fewer',
        invalid_color: 'Invalid color format (e.g. #aabbcc)',
        username_length: 'Username must be 1–50 characters',
        password_too_short: 'Password must be at least 4 characters',
        password_too_long: 'Password must be 128 characters or fewer',
        username_taken: 'This username is already taken',
        invalid_credentials: 'Incorrect username or password',
        invalid_id: 'Invalid ID',
        not_found: 'Not found',
        timeline_name_taken: 'A timeline with the same name already exists',
        ids_not_array: 'Invalid request',
        invalid_nenpyo_id: 'Invalid timeline ID',
        cannot_follow_own: 'You cannot follow your own timeline',
        db_error: 'Cannot connect to the database',
        server_error: 'A server error occurred',
      },
    },
  },
}

// 起動時/設定の既定言語を決める。
//   1) 保存済み設定（nenpyo-settings.lang）があればそれ（ユーザーの明示選択を尊重）
//   2) 無ければブラウザの優先言語 navigator.languages から対応言語を推測
//   3) それも無ければ en
// ログイン前（AuthView）でも適切な言語で表示されるよう、i18n と loadSettings の両方で使う。
export function detectLang(): Lang {
  // 1) 保存済み設定
  try {
    const raw = localStorage.getItem('nenpyo-settings')
    if (raw) {
      const v = JSON.parse(raw)
      if (v && (LANGUAGES as readonly string[]).includes(v.lang)) return v.lang as Lang
    }
  } catch { /* 壊れていたら無視 */ }
  // 2) ブラウザの優先言語（en-US -> en のように地域コードを落として照合）
  try {
    const prefs = (typeof navigator !== 'undefined' && navigator.languages && navigator.languages.length)
      ? navigator.languages
      : (typeof navigator !== 'undefined' && navigator.language ? [navigator.language] : [])
    for (const p of prefs) {
      const base = p.toLowerCase().split('-')[0]
      if ((LANGUAGES as readonly string[]).includes(base)) return base as Lang
    }
  } catch { /* 無視 */ }
  // 3) 既定
  return 'en'
}

const startLang = detectLang()

i18n.use(initReactI18next).init({
  resources,
  lng: startLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React が自前でエスケープするため不要
})

if (typeof document !== 'undefined') document.documentElement.lang = startLang

export default i18n
