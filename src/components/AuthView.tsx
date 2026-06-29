import { useRef, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'

// ---- ログイン / 新規登録 ----------------------------------------------------
export function AuthView({ onAuthed }: { onAuthed: (username: string) => void }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)

  const switchMode = (m: 'login' | 'register') => {
    setMode(m)
    setError('')
    setPassword2('')
    usernameRef.current?.focus()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (mode === 'register' && password !== password2) {
      setError(t('auth.passwordMismatch'))
      return
    }
    setBusy(true)
    try {
      const fn = mode === 'login' ? api.login : api.register
      const u = await fn(username, password)
      onAuthed(u.username)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo"><ScrollText size={28} /> <span>nenpyo</span></div>
        <p className="auth-sub">{t('auth.tagline')}</p>

        <div className="auth-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>{t('auth.login')}</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>{t('auth.register')}</button>
        </div>

        <label>{t('auth.username')}
          <input ref={usernameRef} value={username} maxLength={50} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
        </label>
        <label>{t('auth.password')}
          <input type="password" value={password} maxLength={128} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </label>
        {mode === 'register' && (
          <label>{t('auth.passwordConfirm')}
            <input type="password" value={password2} maxLength={128} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
          </label>
        )}

        {error && <div className="auth-error">{error}</div>}

        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? '…' : mode === 'login' ? t('auth.submitLogin') : t('auth.submitRegister')}
        </button>
      </form>
    </div>
  )
}
