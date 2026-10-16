import { useMemo, useState } from 'react'
import { APP_NAME } from '../brand'
import { formatCents, PLAN_FEATURES, PLAN_LABEL, priceCents, type Cycle, type PaidPlan } from '../billing/plans'
import { ChartThumb } from '../components/ChartThumb'
import { ChatBot } from '../components/ChatBot'
import { fillTokens } from '../landing/chatbot'
import type { PublicRoute } from '../landing/route'
import { usePublicInfo } from '../landing/publicStore'
import { composeModel } from '../models/compose'
import { MODELS } from '../models/library'

const STEPS = [
  { n: '1', icon: '📷', title: 'Escolha', text: 'Envie uma foto ou comece por um modelo pronto, como o ursinho com o nome do bebê.' },
  { n: '2', icon: '🎨', title: 'Ajuste', text: 'Defina o tamanho e as cores, confira os fios sugeridos e acerte ponto a ponto no editor.' },
  { n: '3', icon: '🧶', title: 'Crochete', text: 'O modo guiado mostra a carreira certa, conta os pontos e guarda onde você parou.' },
]

const FEATURES = [
  { icon: '📷', title: 'Foto em gráfico', text: 'Qualquer foto vira um gráfico com carreiras numeradas e cores separadas. Sua foto não sai do seu aparelho.' },
  { icon: '🧸', title: 'Modelos prontos', text: `${MODELS.length} desenhos próprios, com nome e data em pontos: bebê, pet, casal, alfabeto e números.` },
  { icon: '✏️', title: 'Editor ponto a ponto', text: 'Lápis, balde de tinta, conta-gotas, texto e desfazer. Veja também como a peça fica em crochê.' },
  { icon: '🧾', title: 'Lista de fios', text: 'Cores sugeridas das cartelas DMC e Anchor, com opções parecidas e a conta dos novelos.' },
  { icon: '▶️', title: 'Modo Crochetar', text: 'Carreira atual em destaque, lado certo de cada volta e contador de pontos por cor.' },
  { icon: '🖨', title: 'PDF e impressão', text: 'Baixe o gráfico em PDF ou imagem, ou imprima para crochetar longe da tela.' },
  { icon: '🧮', title: 'Calculadora de preço', text: 'Fio, materiais, horas e lucro: o preço certo da peça, sem chute. No plano Plus.', plus: true },
  { icon: '💬', title: 'Assistente de vendas', text: 'Cole a conversa com a cliente e receba respostas prontas para preço, prazo e envio. No plano Plus.', plus: true },
]

/** Página de apresentação para quem ainda não entrou: conhecer, tirar dúvidas e contratar. */
export function Landing({ go }: { go: (r: PublicRoute) => void }) {
  const info = usePublicInfo()
  const { prices } = info
  const [cycle, setCycle] = useState<Cycle>('yearly')
  const [coupon, setCoupon] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const showcase = useMemo(
    () =>
      MODELS.filter((m) => !m.recipe && !m.plain)
        .slice(0, 8)
        .map((m) => ({ model: m, chart: composeModel(m, { name: m.sample, date: '', textColor: m.sampleColor, width: 40, withBg: true }) })),
    [],
  )
  const hero = showcase.slice(0, 3)

  const create = () => go({ page: 'login', mode: 'criar', coupon: coupon.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '') })
  const enter = () => go({ page: 'login', mode: 'entrar', coupon: '' })
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const planCard = (plan: PaidPlan) => {
    const total = priceCents(prices, plan, cycle)
    return (
      <article className={`plan${plan === 'plus' ? ' plan--plus' : ''}`} key={plan}>
        {plan === 'basic' && <em className="plan__ribbon">Comece aqui</em>}
        {plan === 'plus' && <em className="badge plan__tag">Para quem vende</em>}
        <h3>{PLAN_LABEL[plan]}</h3>
        <p className="plan__price"><b>{formatCents(total)}</b><span>{cycle === 'yearly' ? '/ano' : '/mês'}</span></p>
        <p className="hint">
          {cycle === 'yearly'
            ? `Equivale a ${formatCents(Math.round(total / 12))} por mês · você paga ${12 - prices.yearlyFreeMonths} meses e leva 12`
            : 'Renova todo mês no cartão'}
        </p>
        <ul className="plan__list">
          {PLAN_FEATURES[plan].map((f) => <li key={f}>{f.replace('{limit}', String(prices.basicImageLimit))}</li>)}
        </ul>
        <button className="btn btn--primary" onClick={create}>
          {plan === 'basic' ? (prices.trialDays > 0 ? `Testar grátis por ${prices.trialDays} dia${prices.trialDays === 1 ? '' : 's'}` : 'Quero começar') : 'Criar conta e fazer o upgrade depois'}
        </button>
      </article>
    )
  }

  return (
    <div className="landing">
      <header className="lp-bar">
        <span className="lp-bar__brand"><img src="/logo-symbol.svg" alt="" width={32} height={32} /> {APP_NAME}</span>
        <span className="lp-bar__actions">
          <button className="btn btn--ghost" onClick={enter}>Entrar</button>
          <button className="btn btn--primary btn--sm" onClick={create}>Criar conta</button>
        </span>
      </header>

      <main className="lp">
        <section className="lp-hero">
          <span className="phero__eyebrow">🧶 Para quem ama crochê</span>
          <h1>Sua foto vira um gráfico de crochê, pronto para começar</h1>
          <p>
            Envie uma foto ou escolha um modelo. O {APP_NAME} monta o gráfico com as carreiras numeradas, separa as cores, sugere os fios
            e guia você carreira por carreira.
          </p>
          <div className="lp-hero__cta">
            <button className="btn btn--primary" onClick={() => scrollTo('planos')}>Quero contratar</button>
            <button className="btn" onClick={() => scrollTo('como-funciona')}>Ver como funciona</button>
          </div>
          <ul className="phero__trust" aria-label="Vantagens">
            <li>📱 Funciona no celular</li>
            <li>🔒 A foto fica no seu aparelho</li>
            <li>💳 Pix ou cartão</li>
          </ul>
          <div className="lp-hero__art" aria-hidden>
            {hero.map(({ model, chart }, i) => (
              <span key={model.id} className={`lp-hero__chart lp-hero__chart--${i + 1}`} style={{ background: model.bg }}><ChartThumb chart={chart} /></span>
            ))}
          </div>
        </section>

        {prices.trialDays > 0 && (
          <p className="lp-gift">🎉 Crie sua conta e use o plano Básico <b>grátis por {prices.trialDays} dia{prices.trialDays === 1 ? '' : 's'}</b>. Sem pagar nada agora.</p>
        )}
        {prices.signupBonusImages > 0 && (
          <p className="lp-gift">🎁 Crie sua conta e ganhe <b>{prices.signupBonusImages} gráfico{prices.signupBonusImages === 1 ? '' : 's'} de presente</b> para experimentar.</p>
        )}

        <section id="como-funciona" className="lp-section">
          <h2>Como funciona</h2>
          <ol className="lp-steps">
            {STEPS.map((s) => (
              <li key={s.n} className="lp-step">
                <span className="lp-step__n" aria-hidden>{s.icon}</span>
                <b>{s.n}. {s.title}</b>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-section">
          <h2>Tudo o que você precisa</h2>
          <ul className="lp-features">
            {FEATURES.map((f) => (
              <li key={f.title} className="lp-feature">
                <span className="lp-feature__icon" aria-hidden>{f.icon}</span>
                <b>{f.title}{f.plus && <em className="badge">Plus</em>}</b>
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-section">
          <h2>Modelos prontos para personalizar</h2>
          <p className="lp-lead">Escreva o nome ou a data e o gráfico sai pronto, com as letras já em pontos.</p>
          <ul className="lp-models">
            {showcase.map(({ model, chart }) => (
              <li key={model.id}>
                <span className="model-card__img" style={{ background: model.bg }}><ChartThumb chart={chart} /></span>
                <span className="model-card__title">{model.title}</span>
              </li>
            ))}
          </ul>
        </section>

        <section id="planos" className="lp-section">
          <h2>Planos e preços</h2>
          <p className="lp-lead">Pague por mês ou por ano, com Pix ou cartão. Você escolhe a forma de pagamento depois de criar a conta.</p>
          <div className="seg lp-seg" role="group" aria-label="Período">
            <button className={`seg__btn${cycle === 'monthly' ? ' seg__btn--on' : ''}`} onClick={() => setCycle('monthly')}>Mensal</button>
            <button className={`seg__btn${cycle === 'yearly' ? ' seg__btn--on' : ''}`} onClick={() => setCycle('yearly')}>
              Anual <span className="seg__sub">{prices.yearlyFreeMonths} meses grátis</span>
            </button>
          </div>
          <div className="plans lp-plans">{(['basic', 'plus'] as const).map(planCard)}</div>
          <label className="field lp-coupon">
            <span>Tem um cupom de desconto?</span>
            <input className="input input--coupon" value={coupon} placeholder="Digite o código (opcional)" maxLength={32} autoCapitalize="characters" autoComplete="off"
              onChange={(e) => setCoupon(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} />
            <small className="hint">Ele já vai preenchido quando você criar a conta.</small>
          </label>
        </section>

        {info.items.length > 0 && (
          <section className="lp-section">
            <h2>Perguntas frequentes</h2>
            <ul className="lp-faq">
              {info.items.map((q) => (
                <li key={q.id} className="lp-faq__item">
                  <button className="lp-faq__q" aria-expanded={open === q.id} onClick={() => setOpen(open === q.id ? null : q.id)}>
                    <span>{q.question}</span><span aria-hidden>{open === q.id ? '−' : '+'}</span>
                  </button>
                  {open === q.id && <p className="lp-faq__a">{fillTokens(q.answer, prices)}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="lp-final">
          <h2>Pronta para começar o seu próximo gráfico?</h2>
          <p>Crie a conta em menos de um minuto.</p>
          <div className="lp-hero__cta">
            <button className="btn btn--primary" onClick={create}>Criar minha conta</button>
            <button className="btn" onClick={enter}>Já tenho conta</button>
          </div>
        </section>
      </main>

      <ChatBot info={info} />
    </div>
  )
}
