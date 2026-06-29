// 表示用の小さなフォーマット補助。

// 改行を空白1つに置き換えて1行化する（下バーの詳細表示用。一覧性を上げる）。
export const oneLine = (s: string) => s.replace(/\r\n|\r|\n/g, ' ')

// 背景色 (#rrggbb) の上で読みやすい文字色（明るい背景は黒、暗い背景は白）。
export function textColorFor(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) return '#fff'
  const n = parseInt(m[1], 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.6 ? '#1a1a1a' : '#fff'
}
