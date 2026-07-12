import { useEffect, useRef, useState } from 'react'
import { X, ChevronUp, ChevronDown, CopyPlus, Trash2, Plus } from 'lucide-react'
import { api, type ColorScheme } from '../api'
import { textColorFor } from '../lib/format'

// ---- 開発用: 配色パターン（color_scheme + colors）の一覧・編集画面 -----
// メイン領域全体を使う。開発環境のフラスコ2から開く。文言は開発専用のため日本語固定。
//   ・色の四角（横長・カラーコード表記）をクリック → ネイティブのカラーピッカーで色を変更（確定でDB更新）。
//   ・配色名はテキスト入力。フォーカスが外れた時に変更されていればDB更新。
//   ・色の右端の「＋」で色を追加できる（5色目以降は c5, c6, ... と自動命名）。

// 色の役割ラベル（並び順に対応）: 1色目=背景, 2色目=ボタン背景, 3色目=キーカラー, 4色目=見出し文字。
// 5色目以降は決まった役割が無いので c5, c6, ... とする。
const COLOR_ROLES = ['bg1', 'bg2', 'key1', 'key2']
const colorLabel = (ci: number) => COLOR_ROLES[ci] ?? `c${ci + 1}`

export function DevColorSchemes({ schemeId, onSelectScheme, onColorChanged, onSchemeCreated, onSchemeDeleted, onClose }: {
  // 現在選択中の配色 id（設定の schemeId）。null なら未選択。
  schemeId: number | null
  // ラジオで配色を切り替えたとき、直ちにその配色を適用する。
  onSelectScheme: (id: number) => void
  // 配色内の色を変えたとき、親の配色一覧も更新して（選択中なら）その場で再適用させる。
  onColorChanged: (schemeId: number, colorId: number, color: string) => void
  // 配色を複製して新規作成したとき、親の配色一覧にも追加する（設定のテーマ選択に出す）。
  onSchemeCreated: (scheme: ColorScheme) => void
  // 配色を削除したとき、親の配色一覧からも取り除く（選択中なら親側で解除される）。
  onSchemeDeleted: (schemeId: number) => void
  onClose: () => void
}) {
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

  // 配色を複製して新規作成。作成された配色を一覧末尾に追加し、親にも通知する。
  const copyScheme = async (schemeId: number) => {
    setError('')
    try {
      const created = await api.devCopyColorScheme(schemeId)
      savedNames.current.set(created.id, created.name)
      setSchemes((prev) => (prev ? [...prev, created] : [created]))
      onSchemeCreated(created)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // 配色を削除。確認のうえDBから消し、一覧からも取り除く（親にも通知）。
  const deleteScheme = async (s: ColorScheme) => {
    if (!window.confirm(`配色「${s.name}」を削除しますか？（色もまとめて削除されます）`)) return
    setError('')
    try {
      await api.devDeleteColorScheme(s.id)
      savedNames.current.delete(s.id)
      setSchemes((prev) => prev && prev.filter((x) => x.id !== s.id))
      onSchemeDeleted(s.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // 「＋」で配色に色を1つ追加。作成された色を末尾に足す。
  const addColor = async (schemeId: number) => {
    setError('')
    try {
      const created = await api.devAddColor(schemeId)
      setSchemes((prev) => prev && prev.map((s) => (
        s.id === schemeId ? { ...s, colors: [...s.colors, created] } : s
      )))
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
    // 親（Timeline）の配色一覧も更新。選択中の配色なら適用エフェクトが再走して即反映される。
    onColorChanged(schemeId, colorId, color)
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
                type="radio"
                className="dev-scheme-radio"
                name="dev-scheme-active"
                title="この配色を使用"
                aria-label="この配色を使用"
                checked={schemeId === s.id}
                onChange={() => onSelectScheme(s.id)}
              />
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
              <button className="settings-close" onClick={() => copyScheme(s.id)} title="この配色を複製して新規作成" aria-label="複製して新規作成"><CopyPlus size={18} /></button>
              <button className="settings-close" onClick={() => deleteScheme(s)} title="この配色を削除" aria-label="削除"><Trash2 size={18} /></button>
              <span className="dev-scheme-sep">：</span>
              <span className="dev-scheme-colors">
                {s.colors.map((c, ci) => (
                  <span key={c.id} className="dev-scheme-color-cell">
                    <span className="dev-scheme-color-label">{colorLabel(ci)}</span>
                    <label className="dev-scheme-swatch" style={{ background: c.color }} title={c.color}>
                      <span className="dev-scheme-code" style={{ color: textColorFor(c.color) }}>{c.color}</span>
                      <input
                        type="color"
                        value={c.color}
                        onChange={(e) => changeColor(s.id, c.id, e.target.value)}
                      />
                    </label>
                  </span>
                ))}
                <button className="dev-scheme-add" onClick={() => addColor(s.id)} title="色を追加" aria-label="色を追加">
                  <Plus size={16} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
