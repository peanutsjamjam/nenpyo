import { useEffect, useRef, useState } from 'react'
import { X, ChevronUp, ChevronDown } from 'lucide-react'
import { api, type ColorScheme } from '../api'
import { textColorFor } from '../lib/format'

// ---- 開発用: 配色パターン（color_scheme + colors）の一覧・編集画面 -----
// メイン領域全体を使う。開発環境のフラスコ2から開く。文言は開発専用のため日本語固定。
//   ・色の四角（横長・カラーコード表記）をクリック → ネイティブのカラーピッカーで色を変更（確定でDB更新）。
//   ・配色名はテキスト入力。フォーカスが外れた時に変更されていればDB更新。

export function DevColorSchemes({ onClose }: { onClose: () => void }) {
  const [schemes, setSchemes] = useState<ColorScheme[] | null>(null)
  const [error, setError] = useState('')
  // 最後にサーバーへ保存済みの配色名（id→name）。onBlur で変更検知に使う。
  const savedNames = useRef<Map<number, string>>(new Map())

  useEffect(() => {
    api.colorSchemes()
      .then((list) => {
        savedNames.current = new Map(list.map((s) => [s.id, s.name]))
        setSchemes(list)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  // ローカルの配色名を書き換える（入力中の表示用）。
  const setName = (schemeId: number, name: string) => {
    setSchemes((prev) => prev && prev.map((s) => (s.id === schemeId ? { ...s, name } : s)))
  }

  // フォーカスが外れたら、保存済みと変わっていればDB更新。
  const commitName = async (schemeId: number, name: string) => {
    if (savedNames.current.get(schemeId) === name) return
    setError('')
    try {
      const res = await api.devUpdateColorSchemeName(schemeId, name)
      savedNames.current.set(schemeId, res.name)
      setName(schemeId, res.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // 行を上下に入れ替えて並び順をDBへ保存（dir=-1 上, +1 下）。
  const moveScheme = async (schemeId: number, dir: -1 | 1) => {
    const list = schemes
    if (!list) return
    const i = list.findIndex((s) => s.id === schemeId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    const next = list.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    setSchemes(next)
    setError('')
    try {
      await api.devReorderColorSchemes(next.map((s) => s.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // カラーピッカーで色が確定したらDB更新（ローカルも即反映）。
  const changeColor = async (schemeId: number, colorId: number, color: string) => {
    setSchemes((prev) => prev && prev.map((s) => (
      s.id === schemeId
        ? { ...s, colors: s.colors.map((c) => (c.id === colorId ? { ...c, color } : c)) }
        : s
    )))
    setError('')
    try {
      await api.devUpdateColor(colorId, color)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="dev-schemes">
      <div className="dev-users-head">
        <h2 className="dev-users-title">開発用: 配色一覧{schemes ? `（${schemes.length}）` : ''}</h2>
        <button className="settings-close" onClick={onClose} title="閉じる" aria-label="閉じる"><X size={18} /></button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {schemes && (
        <ul className="dev-scheme-list">
          {schemes.map((s, i) => (
            <li className="dev-scheme-row" key={s.id}>
              <input
                className="dev-scheme-name"
                value={s.name}
                maxLength={40}
                onChange={(e) => setName(s.id, e.target.value)}
                onBlur={(e) => commitName(s.id, e.target.value)}
              />
              <span className="dev-scheme-move">
                <button className="settings-close" onClick={() => moveScheme(s.id, -1)} disabled={i <= 0} title="上へ" aria-label="上へ"><ChevronUp size={18} /></button>
                <button className="settings-close" onClick={() => moveScheme(s.id, 1)} disabled={i >= schemes.length - 1} title="下へ" aria-label="下へ"><ChevronDown size={18} /></button>
              </span>
              <span className="dev-scheme-sep">：</span>
              <span className="dev-scheme-colors">
                {s.colors.map((c) => (
                  <label key={c.id} className="dev-scheme-swatch" style={{ background: c.color }} title={c.color}>
                    <span className="dev-scheme-code" style={{ color: textColorFor(c.color) }}>{c.color}</span>
                    <input
                      type="color"
                      value={c.color}
                      onChange={(e) => changeColor(s.id, c.id, e.target.value)}
                    />
                  </label>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
