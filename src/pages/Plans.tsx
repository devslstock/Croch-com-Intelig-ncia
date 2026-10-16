import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useAccount } from '../billing/AccountProvider'
import {
  daysLeft, formatCents, imageLimit, PLAN_FEATURES, PLAN_LABEL, priceCents, yearlySavingCents,
  type Cycle, type Method, type PaidPlan,
} from '../billing/plans'
import type { CheckoutResult } from '../billing/store'
import { AppBar } from '../components/AppBar'

export type PlansReason = 'inactive' | 'limit' | 'tools' | null

const HEADLINE: Record<Exclude<PlansReason, null>, { title: string; text: string }> = {
  inactive: { title: 'Escolha seu plano', text: 'Para usar o Tramado, é só assinar. Você pode pagar por mês ou por ano.' },
  limit: { title: 'Suas imagens deste mês acabaram', text: 'No Básico são {limit} imagens novas por mês. Assine o Plus para criar sem limite.' },
  tools: { title: 'Disponível no plano Plus', text: 'A Calculadora de preço e o Assistente de vendas fazem parte do Plus, junto com imagens ilimitadas.' },
}

type Pix = Extract<CheckoutResult, { kind: 'pix' }>

export function Plans({ reason, onBack, onAdmin }: { reason: PlansReason; onBack?: () => void; onAdmin?: () => void }) {
  const { user, signOut } = useAuth()
  const { account, reload, store, resetDemo } = useAccount()
  const [cycle, setCycle] = useState<Cycle>('yearly')
  const [choice, setChoice] = useState<PaidPlan | null>(null)
  const [method, setMethod] = useState<Method>('pix')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pix, setPix] = useState<Pix | null>(null)
  const [copied, setCopied] = useState(false)
  const startExpiry = useRef<string | null>(null)

  // Depois de gerar o Pix, confere sozinho a cada 5 s se o pagamento entrou.
  useEffect(() => {
    if (!pix) return
    const t = window.setInterval(() => void reload(), 5000)
    return () => window.clearInterval(t)
  }, [pix, reload])
  useEffect(() => {
    if (pix && account && account.expiresAt !== startExpiry.current && account.effective !== 'none') {
      setPix(null)
      setChoice(null)
      setDone('Pagamento confirmado! Seu plano já está ativo.')
    }
  }, [pix, account])

  if (!user || !account) return null
  const prices = account.prices
  const active = account.effective !== 'none'
  const left = daysLeft(account.expiresAt)
  const lim = imageLimit(account)
  const headline = reason ? HEADLINE[reason] : null
  const needsEmail = !account.demo && !user.email && !account.email

  const pay = async () => {
    if (!choice) return
    setBusy(true)
    setError(null)
    startExpiry.current = account.expiresAt
    try {
      const r = await store.checkout({ plan: choice, cycle, method, email: email.trim() || undefined })
      if (r.kind === 'redirect') {
        window.location.href = r.url
        return
      }
      if (r.kind === 'pix') setPix(r)
      else {
        await reload()
        setChoice(null)
        setDone('Pagamento simulado (demonstração): plano ativado.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui iniciar o pagamento.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setError('Não consegui copiar: selecione o código e copie.')
    }
  }

  const planCard = (plan: PaidPlan) => {
    const total = priceCents(prices, plan, cycle)
    const isCurrent = account.effective === plan
    const features = PLAN_FEATURES[plan].map((f) => f.replace('{limit}', String(prices.basicImageLimit)))
    return (
      <article className={`plan${plan === 'plus' ? ' plan--plus' : ''}${choice === plan ? ' plan--picked' : ''}`} key={plan}>
        {plan === 'plus' && <em className="badge plan__tag">Recomendado</em>}
        <h3>{PLAN_LABEL[plan]}</h3>
        <p className="plan__price">
          <b>{formatCents(total)}</b>
          <span>{cycle === 'yearly' ? '/ano' : '/mês'}</span>
        </p>
        {cycle === 'yearly' ? (
          <p className="hint">Equivale a {formatCents(Math.round(total / 12))} por mês · você economiza {formatCents(yearlySavingCents(prices, plan))}</p>
        ) : (
          <p className="hint">Renova todo mês</p>
        )}
        <ul className="plan__list">
          {features.map((f) => <li key={f}>{f}</li>)}
        </ul>
        <button
          className={`btn ${plan === 'plus' ? 'btn--primary' : ''}`}
          onClick={() => { setChoice(plan); setDone(null); setError(null) }}
          aria-pressed={choice === plan}
        >
          {isCurrent ? 'Renovar' : active && plan === 'plus' ? 'Fazer upgrade para o Plus' : `Assinar o ${PLAN_LABEL[plan]}`}
        </button>
      </article>
    )
  }

  return (
    <div className="studio-page">
      <AppBar title="Assinatura" onBack={active || account.isAdmin ? onBack : undefined} />
      <div className="app tool-page">
        <header className="top">
          <h1>{headline?.title ?? 'Minha assinatura'}</h1>
          <p>{headline?.text.replace('{limit}', String(prices.basicImageLimit)) ?? 'Veja seu plano e escolha como renovar ou mudar.'}</p>
        </header>

        {account.blocked ? (
          <section className="card">
            <h2 className="card__title">Conta desativada</h2>
            <p>Sua conta está desativada. Se acha que é um engano, fale com o suporte.</p>
            <button className="btn" onClick={signOut}>Sair</button>
          </section>
        ) : (
          <>
            {account.demo && <p className="notice" role="status">Modo demonstração: os pagamentos são simulados, nada é cobrado.</p>}
            {done && <p className="ok" role="status">{done}</p>}

            {active && (
              <section className="card status">
                <h2 className="card__title">Seu plano agora</h2>
                <p className="status__plan"><b>{PLAN_LABEL[account.effective]}</b>{account.method === 'manual' ? <em className="badge">Cortesia</em> : null}</p>
                <ul className="status__list">
                  <li>{account.expiresAt ? <>Vale até <b>{new Date(account.expiresAt).toLocaleDateString('pt-BR')}</b>{left !== null && left >= 0 ? ` (${left} dia${left === 1 ? '' : 's'})` : ' (em tolerância: renove já)'}</> : 'Sem data de vencimento'}</li>
                  <li>{lim === null ? 'Imagens ilimitadas' : `Imagens deste mês: ${account.imagesUsed} de ${lim}`}</li>
                  {account.method && account.method !== 'manual' && <li>Pagamento por {account.method === 'pix' ? 'Pix' : 'cartão'}, {account.cycle === 'yearly' ? 'plano anual' : 'plano mensal'}</li>}
                </ul>
              </section>
            )}

            <section className="card">
              <div className="seg" role="group" aria-label="Período">
                <button className={`seg__btn${cycle === 'monthly' ? ' seg__btn--on' : ''}`} onClick={() => setCycle('monthly')}>Mensal</button>
                <button className={`seg__btn${cycle === 'yearly' ? ' seg__btn--on' : ''}`} onClick={() => setCycle('yearly')}>
                  Anual <span className="seg__sub">{prices.yearlyFreeMonths} meses grátis</span>
                </button>
              </div>
              <div className="plans">{(['basic', 'plus'] as const).map(planCard)}</div>
            </section>

            {choice && !pix && (
              <section className="card" aria-live="polite">
                <h2 className="card__title">Como você quer pagar o {PLAN_LABEL[choice]} {cycle === 'yearly' ? 'anual' : 'mensal'}?</h2>
                <div className="seg" role="group" aria-label="Forma de pagamento">
                  <button className={`seg__btn${method === 'pix' ? ' seg__btn--on' : ''}`} onClick={() => setMethod('pix')}>Pix</button>
                  <button className={`seg__btn${method === 'card' ? ' seg__btn--on' : ''}`} onClick={() => setMethod('card')}>Cartão</button>
                </div>
                <p className="hint">
                  {method === 'pix'
                    ? `Você paga ${formatCents(priceCents(prices, choice, cycle))} agora, na hora, pelo QR Code. O Pix não renova sozinho: no vencimento você paga de novo.`
                    : cycle === 'monthly'
                      ? `Cobrança de ${formatCents(priceCents(prices, choice, cycle))} todo mês no cartão, renovada sozinha. Cancele quando quiser.`
                      : `Pagamento de ${formatCents(priceCents(prices, choice, cycle))} no cartão, com parcelamento se o seu cartão permitir. Não renova sozinho.`}
                </p>
                {needsEmail && (
                  <label className="field">
                    <span>Seu e-mail (para o comprovante)</span>
                    <input className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </label>
                )}
                {error && <p className="error" role="alert">{error}</p>}
                <button className="btn btn--primary" onClick={pay} disabled={busy || (needsEmail && !email.includes('@'))}>
                  {busy ? 'Aguarde…' : account.demo ? 'Simular pagamento' : method === 'pix' ? 'Gerar QR Code Pix' : 'Ir para o pagamento'}
                </button>
                <p className="hint">Pagamento processado pelo Mercado Pago.</p>
              </section>
            )}

            {pix && (
              <section className="card pix" aria-live="polite">
                <h2 className="card__title">Pague com Pix</h2>
                <p>Valor: <b>{formatCents(pix.amountCents)}</b>. Abra o app do seu banco e escaneie o QR Code, ou use o “copia e cola”.</p>
                {pix.qrCodeBase64 && <img className="pix__qr" alt="QR Code Pix" src={`data:image/png;base64,${pix.qrCodeBase64}`} width={220} height={220} />}
                <label className="field">
                  <span>Pix copia e cola</span>
                  <textarea className="input" readOnly rows={3} value={pix.qrCode} onFocus={(e) => e.currentTarget.select()} />
                </label>
                <button className="btn btn--primary" onClick={() => copy(pix.qrCode)}>{copied ? 'Copiado!' : 'Copiar código'}</button>
                <p className="hint">Assim que o banco confirmar, seu plano é liberado sozinho (leva poucos segundos). Esta tela confere a cada 5 segundos.</p>
                {error && <p className="error" role="alert">{error}</p>}
                <button className="btn btn--ghost" onClick={() => { setPix(null); void reload() }}>Voltar</button>
              </section>
            )}

            <p className="hint plans__foot">
              Para cancelar a renovação do cartão, entre na sua conta do Mercado Pago em Assinaturas. O acesso continua até o fim do período já pago.
            </p>
          </>
        )}

        {(account.isAdmin || account.demo) && (
          <section className="card">
            <h2 className="card__title">{account.demo ? 'Só na demonstração' : 'Administração'}</h2>
            <div className="row row--tight">
              {account.isAdmin && onAdmin && <button className="btn btn--soft" onClick={onAdmin}>Abrir painel de gestão</button>}
              {account.demo && <button className="btn" onClick={resetDemo}>Voltar a “sem assinatura”</button>}
            </div>
          </section>
        )}

        {!active && !account.blocked && (
          <button className="btn btn--ghost" onClick={signOut}>Sair da conta</button>
        )}
      </div>
    </div>
  )
}
