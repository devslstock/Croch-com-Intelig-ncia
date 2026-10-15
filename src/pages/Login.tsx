import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { googleEnabled } from '../auth/supabase'

type Mode = 'entrar' | 'criar'

export function Login() {
  const auth = useAuth()
  const [mode, setMode] = useState<Mode>('entrar')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'erro' | 'ok'; text: string } | null>(null)

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true)
    setMsg(null)
    const r = await fn()
    setBusy(false)
    if (r.message) setMsg({ kind: r.ok ? 'ok' : 'erro', text: r.message })
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (mode === 'criar') {
      if (name.trim().length < 2) return setMsg({ kind: 'erro', text: 'Diga como podemos te chamar.' })
      if (password.length < 8) return setMsg({ kind: 'erro', text: 'A senha precisa ter pelo menos 8 caracteres.' })
      return run(() => auth.signUp(name, email, password))
    }
    return run(() => auth.signIn(email, password))
  }

  const forgot = () => {
    if (!email.trim()) return setMsg({ kind: 'erro', text: 'Escreva seu e-mail acima e toque em “Esqueci minha senha” de novo.' })
    return run(() => auth.resetPassword(email))
  }

  return (
    <div className="login">
      <div className="login__brand">
        <span className="login__logo" aria-hidden>🧶</span>
        <h1>Tramado</h1>
        <p>Sua foto vira gráfico de crochê, com os fios certos.</p>
      </div>

      <div className="card login__card">
        {!auth.configured && (
          <p className="notice" role="status">
            O login ainda não foi configurado neste endereço. Você pode explorar o app em <b>modo demonstração</b>: nada é salvo na nuvem.
          </p>
        )}

        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'entrar'} className={mode === 'entrar' ? 'tab tab--on' : 'tab'} onClick={() => { setMode('entrar'); setMsg(null) }}>Entrar</button>
          <button role="tab" aria-selected={mode === 'criar'} className={mode === 'criar' ? 'tab tab--on' : 'tab'} onClick={() => { setMode('criar'); setMsg(null) }}>Criar conta</button>
        </div>

        <form onSubmit={onSubmit} className="login__form">
          {mode === 'criar' && (
            <label className="field">
              <span>Seu nome</span>
              <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          <label className="field">
            <span>E-mail</span>
            <input className="input" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Senha</span>
            <div className="input-wrap">
              <input
                className="input"
                type={show ? 'text' : 'password'}
                autoComplete={mode === 'criar' ? 'new-password' : 'current-password'}
                required
                minLength={mode === 'criar' ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="input-wrap__btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Esconder senha' : 'Mostrar senha'}>
                {show ? 'Esconder' : 'Mostrar'}
              </button>
            </div>
            {mode === 'criar' && <small className="hint">Mínimo de 8 caracteres.</small>}
          </label>

          {msg && <p className={msg.kind === 'erro' ? 'error' : 'ok'} role={msg.kind === 'erro' ? 'alert' : 'status'}>{msg.text}</p>}

          <button className="btn btn--primary" type="submit" disabled={busy || !auth.configured}>
            {busy ? 'Aguarde…' : mode === 'criar' ? 'Criar minha conta' : 'Entrar'}
          </button>
          {mode === 'entrar' && (
            <button type="button" className="linkbtn" onClick={forgot} disabled={busy || !auth.configured}>Esqueci minha senha</button>
          )}
        </form>

        {googleEnabled && (
          <button className="btn" onClick={() => run(() => auth.signInWithGoogle())} disabled={busy}>Continuar com o Google</button>
        )}

        {!auth.configured && (
          <button className="btn" onClick={auth.startDemo}>Entrar em modo demonstração</button>
        )}
      </div>

      <p className="hint login__foot">Sua foto é processada no seu aparelho e não é enviada nem guardada.</p>
    </div>
  )
}
