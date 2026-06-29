import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from './api'
import { AuthView } from './components/AuthView'
import { Timeline } from './components/Timeline'
import './App.css'

// アプリのルート。起動時にセッションを確認し、未ログインなら認証画面、
// ログイン済みなら年表本体（Timeline）を表示する。
export default function App() {
  const { t } = useTranslation()
  const [username, setUsername] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.me()
      .then((u) => setUsername(u.username))
      .catch(() => setUsername(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="splash">{t('common.loading')}</div>
  if (!username) return <AuthView onAuthed={setUsername} />
  return <Timeline username={username} onLogout={() => setUsername(null)} />
}
