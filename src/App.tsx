import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Account } from './api'
import { AuthView } from './components/AuthView'
import { SignupCompleteView } from './components/SignupCompleteView'
import { Timeline } from './components/Timeline'
import './App.css'

// アプリのルート。起動時にセッションを確認し、未ログインなら認証画面、
// ログイン済みなら年表本体（Timeline）を表示する。
// URL に ?signup=<token> があれば、メール確認リンク経由の Sign up 2 画面を出す。
export default function App() {
  const { t } = useTranslation()
  const [username, setUsername] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [signupToken, setSignupToken] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('signup')
  )

  useEffect(() => {
    api.me()
      .then((u) => { setUsername(u.username); setEmail(u.email) })
      .catch(() => setUsername(null))
      .finally(() => setLoading(false))
  }, [])

  const onAuthed = (acct: Account) => { setUsername(acct.username); setEmail(acct.email) }

  // URL から ?signup を取り除く（登録完了・やり直し時）。
  const clearSignupToken = () => {
    setSignupToken(null)
    const u = new URL(window.location.href)
    u.searchParams.delete('signup')
    window.history.replaceState({}, '', u.toString())
  }

  if (loading) return <div className="splash">{t('common.loading')}</div>
  if (username) return <Timeline username={username} email={email} onLogout={() => { setUsername(null); setEmail(null) }} />
  if (signupToken) {
    return (
      <SignupCompleteView
        token={signupToken}
        onAuthed={(acct) => { clearSignupToken(); onAuthed(acct) }}
        onRestart={clearSignupToken}
      />
    )
  }
  return <AuthView onAuthed={onAuthed} />
}
