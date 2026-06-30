import { useEffect, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, ApiError, type Account } from '../api'

// ---- Sign up 2: メール内リンクから入る、ユーザー名・パスワード設定画面 -----------
// 起動時に token を検証し、対応するメールを表示。送信でアカウントを作成する。
export function SignupCompleteView({ token, onAuthed, onRestart }: {
  token: string
  onAuthed: (acct: Account) => void
  onRestart: () => void
}) {
  const { t } = useTranslation()
  const [verifying, setVerifying] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [tokenError, setTokenError] = useState('') // リンクが無効/期限切れ
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ username?: string }>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    api.signupVerify(token)
      .then((r) => { if (alive) setEmail(r.email) })
      .catch((err) => { if (alive) setTokenError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (alive) setVerifying(false) })
    return () => { alive = false }
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    if (password !== password2) {
      setError(t('auth.passwordMismatch'))
      return
    }
    setBusy(true)
    try {
      const u = await api.signupComplete(token, username, password)
      onAuthed(u)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'duplicate' && err.fields?.includes('username')) {
          setFieldErrors({ username: t('errors.username_taken') })
          return
        }
        // トークンが申請後に期限切れ等になった場合はやり直しへ誘導。
        if (err.code === 'signup_token_invalid') { setTokenError(err.message); return }
      }
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo"><ScrollText size={28} /> <span>nenpyo</span></div>
        <p className="auth-sub">{t('signup2.title')}</p>

        {verifying ? (
          <p className="auth-sub" style={{ margin: 0 }}>{t('signup2.verifying')}</p>
        ) : tokenError ? (<>
          <div className="auth-error">{tokenError}</div>
          <button type="button" className="auth-submit" onClick={onRestart}>{t('signup2.restart')}</button>
        </>) : (<>
          <label>{t('signup2.emailLabel')}
            <input type="email" value={email ?? ''} readOnly />
          </label>
          <label>{t('auth.username')}
            <input
              className={fieldErrors.username ? 'input-error' : ''}
              value={username}
              maxLength={50}
              onChange={(e) => { setUsername(e.target.value); if (fieldErrors.username) setFieldErrors({}) }}
              autoComplete="username"
              autoFocus
            />
            {fieldErrors.username && <span className="field-error">{fieldErrors.username}</span>}
          </label>
          <label>{t('auth.password')}
            <input type="password" value={password} maxLength={128} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </label>
          <label>{t('auth.passwordConfirm')}
            <input type="password" value={password2} maxLength={128} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? '…' : t('signup2.submit')}
          </button>
        </>)}
      </form>
    </div>
  )
}
