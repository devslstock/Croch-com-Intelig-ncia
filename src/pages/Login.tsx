import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { appleEnabled, googleEnabled, whatsappEnabled } from '../auth/supabase'
import { normalizeBrPhone } from '../auth/phone'
import { APP_NAME, APP_TAGLINE } from '../brand'

type Mode = 'entrar' | 'criar'

export function Login() {
  const auth = useAuth()
  const [mode, setMode] = useState<Mode>('entrar')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [wa, setWa] = useState<'off' | 'phone' | 'code'>('off')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<{ kind: 'erro' | 'ok'; text: string } | null>(null)

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true)
    setMsg(null)
    const r = await fn()
    setBusy(false)
    if (r.message) setMsg({ kind: r.ok ? 'ok' : 'erro', text: r.message })
  }

  // Sem Supabase (demonstração) os três botões aparecem para você ver o fluxo; no WhatsApp o código de teste é 123456.
  const demo = !auth.configured
  const showGoogle = demo || googleEnabled
  const showApple = demo || appleEnabled
  const showWhatsapp = demo || whatsappEnabled

  const social = (fn: () => Promise<{ ok: boolean; message?: string }>) => (demo ? auth.startDemo() : run(fn))

  const sendCode = (e: FormEvent) => {
    e.preventDefault()
    if (!normalizeBrPhone(phone)) return setMsg({ kind: 'erro', text: 'Digite o número com DDD, por exemplo (81) 99999-0000.' })
    if (demo) {
      setWa('code')
      return setMsg({ kind: 'ok', text: 'Demonstração: digite o código 123456.' })
    }
    return run(async () => {
      const r = await auth.sendWhatsAppCode(phone)
      if (r.ok) setWa('code')
      return r
    })
  }

  const checkCode = (e: FormEvent) => {
    e.preventDefault()
    if (code.trim().length < 6) return setMsg({ kind: 'erro', text: 'O código tem 6 dígitos.' })
    if (demo) return code.trim() === '123456' ? auth.startDemo() : setMsg({ kind: 'erro', text: 'Na demonstração o código é 123456.' })
    return run(() => auth.verifyWhatsAppCode(phone, code))
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
        <h1>{APP_NAME}</h1>
        <p>{APP_TAGLINE}</p>
      </div>

      <div className="card login__card">
        {demo && (
          <p className="notice" role="status">
            O login ainda não foi configurado neste endereço: você está em <b>modo demonstração</b>. Os botões abaixo entram sem conta real e nada é salvo na nuvem.
          </p>
        )}

        <h2 className="login__title">Entrar ou criar conta</h2>
        <p className="hint">Sem senha: escolha um jeito e pronto. Se for sua primeira vez, a conta é criada na hora.</p>

        {wa === 'off' && (
          <div className="login__methods">
            {showGoogle && <button className="btn btn--method" onClick={() => social(auth.signInWithGoogle)} disabled={busy}><b className="mark mark--g" aria-hidden>G</b> Continuar com o Google</button>}
            {showApple && <button className="btn btn--method" onClick={() => social(auth.signInWithApple)} disabled={busy}><b className="mark mark--a" aria-hidden>A</b> Continuar com a Apple</button>}
            {showWhatsapp && <button className="btn btn--method" onClick={() => { setWa('phone'); setMsg(null) }} disabled={busy}><b className="mark mark--w" aria-hidden>W</b> Continuar com o WhatsApp</button>}
          </div>
        )}

        {wa === 'phone' && (
          <form onSubmit={sendCode} className="login__form">
            <label className="field">
              <span>Seu WhatsApp, com DDD</span>
              <input className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="(81) 99999-0000" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
            </label>
            {msg && <p className={msg.kind === 'erro' ? 'error' : 'ok'} role={msg.kind === 'erro' ? 'alert' : 'status'}>{msg.text}</p>}
            <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar código'}</button>
            <button type="button" className="linkbtn" onClick={() => { setWa('off'); setMsg(null) }}>Voltar</button>
          </form>
        )}

        {wa === 'code' && (
          <form onSubmit={checkCode} className="login__form">
            <label className="field">
              <span>Código de 6 dígitos enviado ao seu WhatsApp</span>
              <input className="input input--code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
            </label>
            {msg && <p className={msg.kind === 'erro' ? 'error' : 'ok'} role={msg.kind === 'erro' ? 'alert' : 'status'}>{msg.text}</p>}
            <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
            <button type="button" className="linkbtn" onClick={() => { setWa('phone'); setCode(''); setMsg(null) }}>Trocar número ou pedir novo código</button>
          </form>
        )}

        {wa === 'off' && msg && <p className={msg.kind === 'erro' ? 'error' : 'ok'} role={msg.kind === 'erro' ? 'alert' : 'status'}>{msg.text}</p>}

        {wa === 'off' && !demo && (
          <details className="more login__email">
            <summary>Prefiro usar e-mail e senha</summary>
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
                  <button type="button" className="input-wrap__btn" onClick={() => setShow((x) => !x)} aria-label={show ? 'Esconder senha' : 'Mostrar senha'}>
                    {show ? 'Esconder' : 'Mostrar'}
                  </button>
                </div>
                {mode === 'criar' && <small className="hint">Mínimo de 8 caracteres.</small>}
              </label>
              <button className="btn btn--primary" type="submit" disabled={busy}>
                {busy ? 'Aguarde…' : mode === 'criar' ? 'Criar minha conta' : 'Entrar'}
              </button>
              {mode === 'entrar' && <button type="button" className="linkbtn" onClick={forgot} disabled={busy}>Esqueci minha senha</button>}
            </form>
          </details>
        )}
      </div>

      <p className="hint login__foot">Sua foto é processada no seu aparelho e não é enviada nem guardada.</p>
    </div>
  )
}
