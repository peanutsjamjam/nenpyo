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
  // login / register（サインアップ申請）/ forgot（パスワード再設定申請）。
  // forgot はログイン画面の「パスワードをお忘れですか？」リンクから入る。
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  // メール欄のエラー（重複や形式不正）。入力欄を赤く囲って下に表示する。
  const [fieldErrors, setFieldErrors] = useState<{ email?: string }>({})
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false) // サインアップ確認 / 再設定リンクのメールを送信済みか
  const emailRef = useRef<HTMLInputElement>(null)

  const switchMode = (m: 'login' | 'register' | 'forgot') => {
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
      } else if (mode === 'forgot') {
        // 登録の有無に関わらず {ok} が返る（存在秘匿）。送信済み表示に切り替える。
        await api.resetRequest(email)
        setSent(true)
      } else {
        await api.signupRequest(email)
        setSent(true)
      }
    } catch (err) {
      // メールの形式エラーは該当欄に表示する（重複は秘匿のためサーバーが {ok} を返すので出ない）。
      if (err instanceof ApiError && (err.code === 'email_required' || err.code === 'email_invalid')) {
        setFieldErrors({ email: err.message })
        return
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

        {/* タブは login/register のときだけ。forgot（再設定申請）は見出しに置き換える。 */}
        {mode === 'forgot' ? (
          <p className="auth-sub" style={{ fontWeight: 600 }}>{t('auth.forgotTitle')}</p>
        ) : (
          <div className="auth-tabs">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>{t('auth.login')}</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>{t('auth.register')}</button>
          </div>
        )}

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
          {/* 「パスワードを忘れた人」向けのリンク。押すとメール入力だけの再設定申請へ。 */}
          <button type="button" className="auth-link" onClick={() => switchMode('forgot')}>{t('auth.forgot')}</button>
        </>) : mode === 'forgot' ? (sent ? (<>
          <div className="auth-success" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <MailCheck size={32} />
            <span>{t('auth.forgotSentTitle')}</span>
          </div>
          <p className="auth-sub" style={{ margin: 0 }}>{t('auth.forgotSentBody')}</p>
          <button type="button" className="auth-back" onClick={() => switchMode('login')}>{t('auth.backToLogin')}</button>
        </>) : (<>
          <label>{t('auth.email')}
            <input type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? '…' : t('auth.forgotSubmit')}
          </button>
          <button type="button" className="auth-back" onClick={() => switchMode('login')}>{t('auth.backToLogin')}</button>
        </>)) : sent ? (<>
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
