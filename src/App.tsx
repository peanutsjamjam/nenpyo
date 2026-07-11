import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Account } from './api'
import { AuthView } from './components/AuthView'
import { SignupCompleteView } from './components/SignupCompleteView'
import { ResetPasswordView } from './components/ResetPasswordView'
import { Timeline } from './components/Timeline'
import './App.css'

// アプリのルート。起動時にセッションを確認する。
//   - ログイン済み(本会員/ゲスト): 年表本体（Timeline）を表示。
//   - セッション無し: ゲスト（数日で消える一時ユーザー）を自動作成して、そのまま使える。
// 認証画面（AuthView）は、ゲストが上バーのログインボタンを押したときだけ出す。
// URL に ?signup=<token> があれば、メール確認リンク経由の Sign up 2 画面を出す（ゲストの
// セッションを保ったまま完了させると、ゲストが作った年表ごと本会員へ昇格する）。
export default function App() {
  const { t } = useTranslation()
  const [acct, setAcct] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  // ログイン/新規登録の画面を出しているか（ゲストのときだけ意味を持つ）。
  const [showAuth, setShowAuth] = useState(false)
  const [signupToken, setSignupToken] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('signup')
  )
  // ?reset=<token>: パスワード再設定リンク。ログイン状態に関わらず優先して開く。
  const [resetToken, setResetToken] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('reset')
  )

  // セッションを確認し、無ければゲストを作る。ログアウト後にも呼んで新しいゲストへ戻す。
  const bootstrap = useCallback(async () => {
    try {
      setAcct(await api.me())
    } catch {
      try { setAcct(await api.createGuest()) } catch { setAcct(null) }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { bootstrap() }, [bootstrap])

  const onAuthed = (a: Account) => { setAcct(a); setShowAuth(false) }

  // URL から ?signup を取り除く（登録完了・やり直し時）。
  const clearSignupToken = () => {
    setSignupToken(null)
    const u = new URL(window.location.href)
    u.searchParams.delete('signup')
    window.history.replaceState({}, '', u.toString())
  }

  // URL から ?reset を取り除く（再設定完了・やり直し時）。
  const clearResetToken = () => {
    setResetToken(null)
    const u = new URL(window.location.href)
    u.searchParams.delete('reset')
    window.history.replaceState({}, '', u.toString())
  }

  // 本会員（ゲストでない）としてログイン済みか。
  const realUser = acct != null && !acct.guest

  if (loading) return <div className="splash">{t('common.loading')}</div>
  // 再設定リンクは、ログイン状態に関わらず最優先で開く（トークンの示す
  // アカウントのパスワードを設定し直し、そのままそのアカウントでログインする）。
  if (resetToken) {
    return (
      <ResetPasswordView
        token={resetToken}
        onAuthed={(a) => { clearResetToken(); onAuthed(a) }}
        onRestart={clearResetToken}
      />
    )
  }
  // 確認リンクは、未ログイン時のほか「ゲストのまま」でも開く（昇格のためセッションを保つ）。
  if (signupToken && !realUser) {
    return (
      <SignupCompleteView
        token={signupToken}
        onAuthed={(a) => { clearSignupToken(); onAuthed(a) }}
        onRestart={clearSignupToken}
      />
    )
  }
  // ゲスト作成にも失敗した（ネットワーク等）ときの最終手段としてログイン画面を出す。
  if (acct == null) return <AuthView onAuthed={onAuthed} onCancel={() => setShowAuth(false)} />
  return (
    <>
      <Timeline
        // アカウントが替わったら作り直す（前のユーザーの年表・イベントを残さない）。
        key={acct.username}
        username={acct.username}
        email={acct.email}
        isGuest={acct.guest}
        onLogout={() => { setLoading(true); bootstrap() }}
        onRequestLogin={() => setShowAuth(true)}
      />
      {/* ログイン/新規登録は、背後のメイン・エクスプローラー画面の上に重ねて表示する。
          背景クリックまたは「戻る」で閉じる。 */}
      {showAuth && !realUser && (
        <div className="auth-overlay" onClick={() => setShowAuth(false)}>
          <AuthView overlay onAuthed={onAuthed} onCancel={() => setShowAuth(false)} />
        </div>
      )}
    </>
  )
}
