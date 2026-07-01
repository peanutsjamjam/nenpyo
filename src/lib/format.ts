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

// 明るい背景なら true（配色から色を派生するとき・color-scheme の判定に使う）。
export function isLightColor(hex: string): boolean {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) return true
  const n = parseInt(m[1], 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.6
}

// 2色 (#rrggbb) を比率 t で線形補間して #rrggbb を返す（t=0 で a、t=1 で b）。
export function mixHex(a: string, b: string, t: number): string {
  const pa = /^#?([0-9a-fA-F]{6})$/.exec(a)
  const pb = /^#?([0-9a-fA-F]{6})$/.exec(b)
  if (!pa || !pb) return a
  const na = parseInt(pa[1], 16)
  const nb = parseInt(pb[1], 16)
  const mix = (sh: number) => Math.round(((na >> sh) & 255) * (1 - t) + ((nb >> sh) & 255) * t)
  const to2 = (v: number) => v.toString(16).padStart(2, '0')
  return `#${to2(mix(16))}${to2(mix(8))}${to2(mix(0))}`
}
