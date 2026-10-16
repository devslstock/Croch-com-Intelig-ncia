import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useAccount } from '../billing/AccountProvider'
import {
  couponLabel, daysLeft, finalPriceCents, formatCents, imageLimit, PLAN_FEATURES, PLAN_LABEL, priceCents,
  type AccountCoupon, type Cycle, type Method, type PaidPlan,
} from '../billing/plans'
import type { CheckoutResult } from '../billing/store'
import { AppBar } from '../components/AppBar'

export type PlansReason = 'inactive' | 'limit' | 'tools' | null

/** "no Básico, só no plano anual": onde o cupom vale. Vazio = vale em tudo. */
function couponScope(c: AccountCoupon): string {
  const plan = c.plans.length === 2 ? '' : c.plans[0] === 'basic' ? 'no plano Básico' : 'no plano Plus'
  const cycle = c.cycles === 'both' ? '' : c.cycles === 'yearly' ? 'só no pagamento anual' : 'só no pagamento mensal'
  return [plan, cycle].filter(Boolean).join(', ')
}

const HEADLINE: Record<Exclude<PlansReason, null>, { title: string; text: string }> = {
  inactive: { title: 'Escolha seu plano', text: 'Para usar o Tramado, é só assinar. Você pode pagar por mês ou por ano.' },
  limit: { title: 'Suas imagens deste mês acabaram', text: 'No Básico são {limit} imagens novas por mês. Assine o Plus para criar sem limite.' },
  tools: { title: 'Disponível no plano Plus', text: 'A Calculadora de preço e o Assistente de vendas fazem parte do Plus, junto com imagens ilimitadas.' },
}

type Pix = Extract<CheckoutResult, { kind: 'pix' }>

export function Plans({ reason, preselect, onBack, onAdmin }: { reason: PlansReason; /** Plano já escolhido ao abrir (vem da janela de upgrade). */ preselect?: PaidPlan; onBack?: () => void; onAdmin?: () => void }) {
  const { user, signOut } = useAuth()
  const { account, reload, store, resetDemo } = useAccount()
  const [cycle, setCycle] = useState<Cycle>('yearly')
  const [choice, setChoice] = useState<PaidPlan | null>(preselect ?? null)
  const [method, setMethod] = useState<Method>('pix')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pix, setPix] = useState<Pix | null>(null)
  /** Endereço do pagamento aberto em outra aba (cartão): enquanto houver, esta tela confere se o plano foi liberado. */
  const [payUrl, setPayUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [couponText, setCouponText] = useState('')
  const [couponBusy, setCouponBusy] = useState(false)
  const [couponMsg, setCouponMsg] = useState<{ kind: 'ok' | 'erro'; text: string } | null>(null)
  const startExpiry = useRef<string | null>(null)
  const payRef = useRef<HTMLElement>(null)

  // Veio da janela de upgrade com o plano já escolhido: leva direto à escolha da forma de pagamento.
  useEffect(() => {
    if (preselect) window.setTimeout(() => payRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
  }, [preselect])

  // Depois de gerar o Pix ou abrir o pagamento em outra aba, confere sozinho a cada 5 s se o pagamento entrou.
  const waiting = pix !== null || payUrl !== null
  useEffect(() => {
    if (!waiting) return
    // A cada 5 s: confere no Mercado Pago (segunda via, caso o aviso atrase) e atualiza a conta.
    const check = () => void store.sync().then(() => reload())
    check()
    const t = window.setInterval(check, 5000)
    return () => window.clearInterval(t)
  }, [waiting, reload, store])
  // Ao abrir a tela sem plano: se um pagamento já foi aprovado e o aviso não chegou, libera agora.
  const noPlan = !!account && account.effective === 'none' && !account.demo
  useEffect(() => {
    if (noPlan) void store.sync().then(() => reload())
  }, [noPlan, store, reload])
  useEffect(() => {
    if (waiting && account && account.expiresAt !== startExpiry.current && account.effective !== 'none') {
      setPix(null)
      setPayUrl(null)
      setChoice(null)
      setDone('Pagamento confirmado! Seu plano já está ativo.')
    }
  }, [waiting, account])

  if (!user || !account) return null
  const prices = account.prices
  const active = account.effective !== 'none'
  const left = daysLeft(account.expiresAt)
  const trialLeft = daysLeft(account.trialEndsAt)
  const lim = imageLimit(account)
  const headline = reason ? HEADLINE[reason] : null
  const needsEmail = !account.demo && !user.email && !account.email

  const pay = async () => {
    if (!choice) return
    setBusy(true)
    setError(null)
    startExpiry.current = account.expiresAt
    // A aba é aberta já no toque (antes da espera pela rede) para o navegador não bloquear; depois recebe o endereço do pagamento.
    const tab = method === 'card' && !account.demo ? window.open('', '_blank') : null
    if (tab) tab.opener = null
    try {
      const r = await store.checkout({ plan: choice, cycle, method, email: email.trim() || undefined })
      if (r.kind === 'redirect') {
        if (tab) tab.location.href = r.url
        setPayUrl(r.url)
        return
      }
      tab?.close()
      if (r.kind === 'pix') setPix(r)
      else {
        await reload()
        setChoice(null)
        setDone('Pagamento simulado (demonstração): plano ativado.')
      }
    } catch (e) {
      tab?.close()
      setError(e instanceof Error ? e.message : 'Não consegui iniciar o pagamento.')
    } finally {
      setBusy(false)
    }
  }

  const applyCoupon = async (e: FormEvent) => {
    e.preventDefault()
    setCouponBusy(true)
    setCouponMsg(null)
    try {
      const c = await store.applyCoupon(couponText)
      await reload()
      setCouponText('')
      setCouponMsg({ kind: 'ok', text: `Cupom ${c.code} aplicado: ${couponLabel(c)} de desconto${couponScope(c) ? ` (${couponScope(c)})` : ''}.` })
    } catch (err) {
      setCouponMsg({ kind: 'erro', text: err instanceof Error ? err.message : 'Não consegui aplicar o cupom.' })
    } finally {
      setCouponBusy(false)
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
    const list = priceCents(prices, plan, cycle)
    const total = finalPriceCents(prices, plan, cycle, account.coupon)
    const off = list - total
    const isCurrent = account.effective === plan && !account.trialEndsAt
    const features = PLAN_FEATURES[plan].map((f) => f.replace('{limit}', String(prices.basicImageLimit)))
    return (
      <article className={`plan${plan === 'plus' ? ' plan--plus' : ''}${choice === plan ? ' plan--picked' : ''}`} key={plan}>
        {plan === 'plus' && <em className="badge plan__tag">Recomendado</em>}
        <h3>{PLAN_LABEL[plan]}</h3>
        {off > 0 && <s className="plan__was">{formatCents(list)}</s>}
        <p className="plan__price">
          <b>{formatCents(total)}</b>
          <span>{cycle === 'yearly' ? '/ano' : '/mês'}</span>
        </p>
        {off > 0 && account.coupon && <em className="plan__coupon">🎟 {account.coupon.code} · você economiza {formatCents(off)}</em>}
        {cycle === 'yearly' ? (
          <p className="hint">Equivale a {formatCents(Math.round(total / 12))} por mês · você economiza {formatCents(priceCents(prices, plan, 'monthly') * 12 - total)} no ano</p>
        ) : (
          <p className="hint">Renova todo mês</p>
        )}
        <ul className="plan__list">
          {features.map((f) => <li key={f}>{f}</li>)}
        </ul>
        <button
          className="btn btn--primary"
          onClick={() => { setChoice(plan); setDone(null); setError(null) }}
          aria-pressed={choice === plan}
        >
          {isCurrent ? 'Renovar' : active && plan === 'plus' ? 'Fazer upgrade para o Plus' : `Assinar o ${PLAN_LABEL[plan]}`}
        </button>
      </article>
    )
  }

  return (
    <div className="studio-page plans-page">
      <AppBar title="Assinatura" onBack={active || account.isAdmin ? onBack : undefined} />
      <div className="app tool-page">
        <header className="phero">
          {!active && !account.blocked && <span className="phero__eyebrow">✨ Bem-vinda ao Tramado</span>}
          <h1>{headline?.title ?? 'Minha assinatura'}</h1>
          <p>{headline?.text.replace('{limit}', String(prices.basicImageLimit)) ?? 'Veja seu plano e escolha como renovar ou mudar.'}</p>
          {!account.blocked && (
            <ul className="phero__trust" aria-label="Vantagens">
              <li>💳 Pix ou cartão</li>
              <li>🔒 Pagamento pelo Mercado Pago</li>
              <li>⚡ Liberação automática</li>
            </ul>
          )}
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
                <p className="status__plan"><b>{PLAN_LABEL[account.effective]}</b>{account.method === 'manual' ? <em className="badge">Cortesia</em> : null}{account.trialEndsAt ? <em className="badge">Período grátis</em> : null}</p>
                <ul className="status__list">
                  <li>{account.trialEndsAt ? <>Grátis até <b>{new Date(account.trialEndsAt).toLocaleDateString('pt-BR')}</b>{trialLeft !== null ? ` (${trialLeft} dia${trialLeft === 1 ? '' : 's'})` : ''}. Assine antes para não ficar sem acesso: o plano pago começa quando o teste acaba.</> : account.expiresAt ? <>Vale até <b>{new Date(account.expiresAt).toLocaleDateString('pt-BR')}</b>{left !== null && left >= 0 ? ` (${left} dia${left === 1 ? '' : 's'})` : ' (em tolerância: renove já)'}</> : 'Sem data de vencimento'}</li>
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

            <section className="card coupon" aria-label="Cupom de desconto">
              <h2 className="card__title">Tem um cupom de desconto?</h2>
              {account.coupon && (
                <p className="ok" role="status">
                  🎟 Cupom <b>{account.coupon.code}</b> ligado à sua conta: {couponLabel(account.coupon)} de desconto{couponScope(account.coupon) ? ` (${couponScope(account.coupon)})` : ''}.
                </p>
              )}
              <form className="coupon__form" onSubmit={applyCoupon}>
                <input
                  className="input input--coupon" aria-label="Código do cupom" placeholder="Digite o código" autoComplete="off" autoCapitalize="characters" maxLength={32}
                  value={couponText} onChange={(e) => setCouponText(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                />
                <button className="btn" type="submit" disabled={couponBusy || couponText.length < 3}>{couponBusy ? 'Conferindo…' : account.coupon ? 'Trocar cupom' : 'Aplicar'}</button>
              </form>
              {couponMsg && <p className={couponMsg.kind === 'ok' ? 'ok' : 'error'} role={couponMsg.kind === 'ok' ? 'status' : 'alert'}>{couponMsg.text}</p>}
              <p className="hint">No cartão mensal, o desconto vale em todas as cobranças da assinatura.</p>
            </section>

            {payUrl && (
              <section className="card pix" aria-live="polite">
                <h2 className="card__title">Finalize o pagamento na outra aba</h2>
                <p>O pagamento abriu em uma nova aba do navegador. Quando concluir, volte para esta aba: o seu plano é liberado sozinho, em alguns segundos.</p>
                <a className="btn btn--primary" href={payUrl} target="_blank" rel="noopener noreferrer">Abrir o pagamento de novo</a>
                <button className="btn" onClick={() => { setPayUrl(null); setChoice(null) }}>Escolher outro plano ou forma de pagamento</button>
                <p className="hint">Se a aba não abriu, libere os pop-ups deste site ou use o botão acima.</p>
              </section>
            )}

            {choice && !pix && !payUrl && (
              <section className="card" aria-live="polite" ref={payRef}>
                <h2 className="card__title">Como você quer pagar o {PLAN_LABEL[choice]} {cycle === 'yearly' ? 'anual' : 'mensal'}?</h2>
                <div className="seg" role="group" aria-label="Forma de pagamento">
                  <button className={`seg__btn${method === 'pix' ? ' seg__btn--on' : ''}`} onClick={() => setMethod('pix')}>Pix</button>
                  <button className={`seg__btn${method === 'card' ? ' seg__btn--on' : ''}`} onClick={() => setMethod('card')}>Cartão</button>
                </div>
                <p className="hint">
                  {method === 'pix'
                    ? `Você paga ${formatCents(finalPriceCents(prices, choice, cycle, account.coupon))} agora, na hora, pelo QR Code. O Pix não renova sozinho: no vencimento você paga de novo.`
                    : cycle === 'monthly'
                      ? `Cobrança de ${formatCents(finalPriceCents(prices, choice, cycle, account.coupon))} todo mês no cartão, renovada sozinha. Cancele quando quiser.`
                      : `Pagamento de ${formatCents(finalPriceCents(prices, choice, cycle, account.coupon))} no cartão, com parcelamento se o seu cartão permitir. Não renova sozinho.`}
                </p>
                {(needsEmail || (account.isAdmin && !account.demo)) && (
                  <label className="field">
                    <span>{needsEmail ? 'Seu e-mail (para o comprovante)' : 'E-mail do comprador de teste (só no ambiente de teste; ex.: test_user_123@testuser.com)'}</span>
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
