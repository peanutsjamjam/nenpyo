import { useRef, useState } from 'react'
import { ScrollText, MailCheck, ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, ApiError, type Account } from '../api'

// ---- ログイン / 新規登録（サインアップは「メール入力→確認リンク送信」だけ） --------
// onCancel は、この画面を閉じて背後（ゲストの年表/エクスプローラー画面）へ戻るためのもの。
// overlay=true のときは、背後のメイン/エクスプローラー画面の上にモーダルとして重ねる
// （外側の背景クリックで閉じられるよう、カード内クリックの伝播は止める）。
export function AuthView({ onAuthed, onCancel, overlay = false }: { onAuthed: (acct: Account) => void; onCancel: () => void; overlay?: boolean }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  // メール欄のエラー（重複や形式不正）。入力欄を赤く囲って下に表示する。
  const [fieldErrors, setFieldErrors] = useState<{ email?: string }>({})
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false) // サインアップ確認メールを送信済みか
  const emailRef = useRef<HTMLInputElement>(null)

  const switchMode = (m: 'login' | 'register') => {
    setMode(m)
    setError('')
    setFieldErrors({})
    setSent(false)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    setBusy(true)
    try {
      if (mode === 'login') {
        const u = await api.login(email, password)
        onAuthed(u)
      } else {
        await api.signupRequest(email)
        setSent(true)
      }
    } catch (err) {
      // メールの重複・形式エラーは該当欄に表示する。
      if (err instanceof ApiError) {
        const fe: { email?: string } = {}
        if (err.code === 'duplicate' && err.fields?.includes('email')) fe.email = t('errors.email_taken')
        else if (err.code === 'email_required' || err.code === 'email_invalid') fe.email = err.message
        if (fe.email) { setFieldErrors(fe); return }
      }
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const card = (
    <form className="auth-card" onSubmit={submit} onClick={overlay ? (e) => e.stopPropagation() : undefined}>
        <div className="auth-logo"><ScrollText size={28} /> <span>nenpyo</span></div>
        <p className="auth-sub">{t('auth.tagline')}</p>

        <div className="auth-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>{t('auth.login')}</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>{t('auth.register')}</button>
        </div>

        {mode === 'login' ? (<>
          <label>{t('auth.email')}
            <input ref={emailRef} type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
          </label>
          <label>{t('auth.password')}
            <input type="password" value={password} maxLength={128} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? '…' : t('auth.submitLogin')}
          </button>
        </>) : sent ? (<>
          <div className="auth-success" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <MailCheck size={32} />
            <span>{t('auth.sentTitle')}</span>
          </div>
          <p className="auth-sub" style={{ margin: 0 }}>{t('auth.sentBody', { email })}</p>
          <button type="button" className="auth-back" onClick={() => { setSent(false); setEmail('') }}>{t('auth.resend')}</button>
        </>) : (<>
          <label>{t('auth.email')}
            <input
              type="email"
              className={fieldErrors.email ? 'input-error' : ''}
              value={email}
              maxLength={254}
              onChange={(e) => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors({}) }}
              autoComplete="email"
              autoFocus
            />
            {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? '…' : t('auth.submitRegister')}
          </button>
        </>)}

        <button type="button" className="auth-back" onClick={onCancel}><ArrowLeft size={14} /> {t('common.back')}</button>
    </form>
  )

  // 単独表示（ゲスト作成失敗時のフォールバック等）は画面いっぱいに中央寄せ、
  // overlay 表示は呼び出し側（App）の背景オーバーレイの中に置く。
  return overlay ? card : <div className="auth-wrap">{card}</div>
}
