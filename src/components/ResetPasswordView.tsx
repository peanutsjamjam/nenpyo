import { useEffect, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, ApiError, type Account } from '../api'

// ---- パスワード再設定: メール内リンク（?reset=<token>）から入る新パスワード設定画面 ----
// 起動時に token を検証し、対象のメールを表示。送信でパスワードを作り直してログイン状態にする。
export function ResetPasswordView({ token, onAuthed, onRestart }: {
  token: string
  onAuthed: (acct: Account) => void
  onRestart: () => void
}) {
  const { t } = useTranslation()
  const [verifying, setVerifying] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [tokenError, setTokenError] = useState('') // リンクが無効/期限切れ
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // いずれかの欄に入力があれば、一致=緑 / 不一致=赤 の枠を出す（両欄の一致状態を可視化）。
  const anyFilled = password !== '' || password2 !== ''
  const pwClass = anyFilled ? (password === password2 ? 'match' : 'mismatch') : ''

  useEffect(() => {
    let alive = true
    api.resetVerify(token)
      .then((r) => { if (alive) setEmail(r.email) })
      .catch((err) => { if (alive) setTokenError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (alive) setVerifying(false) })
    return () => { alive = false }
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== password2) {
      setError(t('reset.mismatch'))
      return
    }
    setBusy(true)
    try {
      const u = await api.resetComplete(token, password)
      onAuthed(u)
    } catch (err) {
      // トークンが申請後に期限切れ等になった場合はやり直しへ誘導。
      if (err instanceof ApiError && err.code === 'reset_token_invalid') { setTokenError(err.message); return }
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo"><ScrollText size={28} /> <span>nenpyo</span></div>
        <p className="auth-sub">{t('reset.title')}</p>

        {verifying ? (
          <p className="auth-sub" style={{ margin: 0 }}>{t('reset.verifying')}</p>
        ) : tokenError ? (<>
          <div className="auth-error">{tokenError}</div>
          <button type="button" className="auth-submit" onClick={onRestart}>{t('reset.restart')}</button>
        </>) : (<>
          <label>{t('reset.emailLabel')}
            <input type="email" value={email ?? ''} readOnly />
          </label>
          <label>{t('reset.new')}
            <input type="password" className={pwClass} value={password} maxLength={128} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
          </label>
          <label>{t('reset.confirm')}
            <input type="password" className={pwClass} value={password2} maxLength={128} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? '…' : t('reset.submit')}
          </button>
        </>)}
      </form>
    </div>
  )
}
