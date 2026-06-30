import { useState } from 'react'
import { ScrollText, ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'

// ---- パスワード変更画面 ----------------------------------------------------
// ログイン/新規登録画面（AuthView）と同様、年表に関する内容は一切出さない独立画面。
// 「現在のパスワード」「新しいパスワード」「新しいパスワード（確認）」の3欄と
// 「パスワードを変更する」ボタンだけを置く。完了/戻るで呼び出し側へ返る。
export function ChangePasswordView({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [next2, setNext2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (next !== next2) {
      setError(t('changePassword.mismatch'))
      return
    }
    setBusy(true)
    try {
      await api.changePassword(current, next)
      setDone(true)
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
        <p className="auth-sub">{t('changePassword.title')}</p>

        {done ? (<>
          <p className="auth-success">{t('changePassword.success')}</p>
          <button type="button" className="auth-submit" onClick={onDone}>{t('changePassword.back')}</button>
        </>) : (<>
          <label>{t('changePassword.current')}
            <input type="password" value={current} maxLength={128}
              onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" autoFocus />
          </label>
          <label>{t('changePassword.new')}
            <input type="password" value={next} maxLength={128}
              onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </label>
          <label>{t('changePassword.confirm')}
            <input type="password" value={next2} maxLength={128}
              onChange={(e) => setNext2(e.target.value)} autoComplete="new-password" />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? '…' : t('changePassword.submit')}
          </button>
          <button type="button" className="auth-back" onClick={onDone}>
            <ArrowLeft size={15} /> {t('changePassword.back')}
          </button>
        </>)}
      </form>
    </div>
  )
}
