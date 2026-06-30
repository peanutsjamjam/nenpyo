import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { X } from 'lucide-react'
import { api, formatRangeAD, type DevUser, type DevUserData, type DevUserEvent } from '../api'

// ---- 開発用: 全ユーザー一覧（上）＋ 指定ユーザーの年表（下）。スプリッタで上下可変 -----
// メイン領域全体を使う。開発環境のフラスコ1から開く。文言は開発専用のため日本語固定。
export function DevUsers({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<DevUser[] | null>(null)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [data, setData] = useState<DevUserData | null>(null)
  const [dataBusy, setDataBusy] = useState(false)
  // 上段（ユーザー一覧）の高さ。スプリッタのドラッグで変える。
  const [topH, setTopH] = useState(260)
  const topRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.listUsers()
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const selectUser = (u: DevUser) => {
    setSelectedId(u.id)
    setData(null)
    setDataBusy(true)
    api.devUserTimeline(u.id)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setDataBusy(false))
  }

  // 上下スプリッタのドラッグ。上段の高さを直接動かし、下段は残りを使う。
  const startVResize = (e: ReactMouseEvent) => {
    e.preventDefault()
    const top = topRef.current?.getBoundingClientRect().top ?? 0
    const onMove = (ev: MouseEvent) => {
      const wrap = wrapRef.current?.getBoundingClientRect()
      if (!wrap) return
      const h = Math.min(Math.max(ev.clientY - top, 120), wrap.bottom - top - 120)
      setTopH(h)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'row-resize'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // 下段表示用に、選択ユーザーのイベントを年表（nenpyo）ごとにまとめる。
  const eventsByNenpyo = new Map<number, DevUserEvent[]>()
  const untagged: DevUserEvent[] = []
  if (data) {
    for (const e of data.events) {
      if (e.nenpyo_id == null) untagged.push(e)
      else {
        const arr = eventsByNenpyo.get(e.nenpyo_id)
        if (arr) arr.push(e); else eventsByNenpyo.set(e.nenpyo_id, [e])
      }
    }
  }

  const renderEvents = (evs: DevUserEvent[]) => (
    <ul className="dev-tl-events">
      {evs.map((e) => (
        <li key={e.id}>
          <span className="dev-tl-date">{formatRangeAD(e)}</span>
          <span className="dev-tl-title">{e.title || '（無題）'}</span>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="dev-users" ref={wrapRef}>
      <div className="dev-users-head">
        <h2 className="dev-users-title">開発用: 全ユーザー一覧{users ? `（${users.length}）` : ''}</h2>
        <button className="settings-close" onClick={onClose} title="閉じる" aria-label="閉じる"><X size={18} /></button>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="dev-users-top" ref={topRef} style={{ height: topH }}>
        {users && (
          <table className="dev-users-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>ユーザー名</th>
                <th>メールアドレス</th>
                <th className="num">年表数</th>
                <th className="num">イベント数</th>
                <th>作成日時</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className={'dev-user-row' + (u.id === selectedId ? ' selected' : '')}
                  onClick={() => selectUser(u)}
                >
                  <td>{u.id}</td>
                  <td>{u.username}</td>
                  <td>{u.email ?? '—'}</td>
                  <td className="num">{u.nenpyo_count}</td>
                  <td className="num">{u.event_count}</td>
                  <td>{u.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="dev-hsplitter" onMouseDown={startVResize} title="ドラッグで上下サイズ変更" />

      <div className="dev-users-bottom">
        {selectedId == null ? (
          <p className="dev-tl-hint">上の一覧から行をクリックすると、そのユーザーの年表を表示します。</p>
        ) : dataBusy ? (
          <p className="dev-tl-hint">読み込み中…</p>
        ) : data ? (<>
          <h3 className="dev-tl-user">{data.username} の年表</h3>
          {data.nenpyo.length === 0 && untagged.length === 0 && (
            <p className="dev-tl-hint">このユーザーの年表・イベントはありません。</p>
          )}
          {data.nenpyo.map((n) => {
            const evs = eventsByNenpyo.get(n.id) ?? []
            return (
              <div className="dev-tl-group" key={n.id}>
                <div className="dev-tl-group-head">
                  <span className="tag-swatch" style={{ background: n.color }} />
                  <span className="dev-tl-name">{n.name}</span>
                  <span className="dev-tl-count">{evs.length}件</span>
                </div>
                {evs.length > 0 && renderEvents(evs)}
              </div>
            )
          })}
          {untagged.length > 0 && (
            <div className="dev-tl-group">
              <div className="dev-tl-group-head">
                <span className="dev-tl-name">（年表に未所属）</span>
                <span className="dev-tl-count">{untagged.length}件</span>
              </div>
              {renderEvents(untagged)}
            </div>
          )}
        </>) : null}
      </div>
    </div>
  )
}
