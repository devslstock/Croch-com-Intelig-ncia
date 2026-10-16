import { useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { AppBar } from '../components/AppBar'
import { NumberField } from '../components/NumberField'
import { analyze, buildReplies, EXAMPLE_CHAT, INTENT_LABEL, INTENT_ORDER, quickReplies, TONE_LABEL, type Intent, type Tone } from '../tools/chat'
import { money } from '../tools/pricing'
import { toolsStorage, type ShopSettings } from '../tools/storage'

export function SalesAssistant({ onBack, onCalculator }: { onBack: () => void; onCalculator: () => void }) {
  const { user } = useAuth()
  const db = useMemo(() => toolsStorage(user?.id ?? 'anon', window.localStorage), [user?.id])
  const [settings, setSettings] = useState<ShopSettings>(() => db.getSettings())
  const quotes = useMemo(() => db.listQuotes(), [db])
  const [raw, setRaw] = useState('')
  const [nameOverride, setNameOverride] = useState<string | null>(null)
  const [picked, setPicked] = useState<Intent[] | null>(null)
  const [tone, setTone] = useState<Tone>('simpatica')
  const [emoji, setEmoji] = useState(true)
  const [quoteId, setQuoteId] = useState('')
  const [manualPrice, setManualPrice] = useState(0)
  const [manualMin, setManualMin] = useState(0)
  const [variantId, setVariantId] = useState<'completa' | 'curta' | 'fechar'>('completa')
  const [edited, setEdited] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const setSetting = <K extends keyof ShopSettings>(k: K, v: ShopSettings[K]) =>
    setSettings((s) => {
      const next = { ...s, [k]: v }
      db.saveSettings(next)
      return next
    })

  const analysis = useMemo(() => analyze(raw, settings.myName), [raw, settings.myName])
  const quote = quotes.find((q) => q.id === quoteId)
  const price = quote
    ? { price: quote.price, minPrice: quote.minPrice, deposit: quote.deposit, days: quote.days }
    : { price: manualPrice > 0 ? manualPrice : null, minPrice: manualMin > 0 ? manualMin : null, deposit: null, days: null }

  const hasText = raw.trim().length > 0
  const intents = picked ?? analysis.intents
  const named = {
    ...analysis,
    intents,
    ...(nameOverride !== null ? { customerName: nameOverride.trim() || null } : {}),
  }
  const toggle = (i: Intent) => {
    const base = picked ?? analysis.intents
    const next = base.includes(i) ? base.filter((x) => x !== i) : INTENT_ORDER.filter((x) => x === i || base.includes(x))
    setPicked(next)
    setEdited(null)
  }
  const suggestion = useMemo(
    () => (hasText ? buildReplies(named, { tone, emoji, price, settings }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasText, raw, nameOverride, picked, tone, emoji, quoteId, manualPrice, manualMin, settings],
  )
  const variant = suggestion?.variants.find((v) => v.id === variantId) ?? suggestion?.variants[0]
  const text = edited ?? variant?.text ?? ''
  const quick = useMemo(() => quickReplies(settings, emoji), [settings, emoji])

  const flash = (t: string) => {
    setMsg(t)
    window.setTimeout(() => setMsg(''), 2500)
  }
  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t)
      flash('Copiado! Agora é só colar na conversa.')
    } catch {
      flash('Não consegui copiar: selecione o texto e copie.')
    }
  }
  const paste = async () => {
    try {
      setRaw(await navigator.clipboard.readText())
      setEdited(null)
    } catch {
      flash('O navegador não deixou colar sozinho: toque no campo e cole.')
    }
  }
  const whatsapp = (t: string) => window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank', 'noopener')

  return (
    <div className="studio-page">
      <AppBar title="Assistente de vendas" onBack={onBack} />
      <div className="app tool-page">
        <header className="top">
          <h1>Assistente de vendas</h1>
          <p>Cole a conversa e receba uma resposta sugerida.</p>
        </header>

        <section className="card">
          <h2 className="card__title">1. A conversa</h2>
          <label className="field">
            <span>Cole aqui as mensagens da cliente</span>
            <textarea
              rows={7}
              value={raw}
              onChange={(e) => { setRaw(e.target.value); setEdited(null); setNameOverride(null); setPicked(null) }}
              placeholder="Cole a conversa do WhatsApp, Instagram ou e-mail…"
            />
          </label>
          <div className="row row--tight">
            <button className="btn btn--soft btn--sm" onClick={paste}>📋 Colar</button>
            <button className="btn btn--sm" onClick={() => { setRaw(EXAMPLE_CHAT); setEdited(null); setNameOverride(null); setPicked(null) }}>Ver exemplo</button>
            {hasText && <button className="btn btn--sm" onClick={() => { setRaw(''); setEdited(null); setNameOverride(null); setPicked(null) }}>Limpar</button>}
          </div>
          <p className="hint">As sugestões são montadas no seu aparelho, por regras simples, sem IA e sem enviar a conversa para lugar nenhum. Revise antes de enviar.</p>
        </section>

        {hasText && suggestion && (
          <>
            <section className="card">
              <h2 className="card__title">2. O que ela quer</h2>
              <p className="hint">Toque para ligar ou desligar o que entra na resposta.</p>
              <div className="chips" role="group" aria-label="O que a cliente quer">
                {INTENT_ORDER.map((i) => (
                  <button key={i} type="button" aria-pressed={intents.includes(i)} className={`chip${intents.includes(i) ? ' chip--on' : ''}`} onClick={() => toggle(i)}>
                    {intents.includes(i) ? '✓ ' : ''}{INTENT_LABEL[i]}
                  </button>
                ))}
              </div>
              <p className="hint">
                {analysis.product ? `Peça: ${analysis.product}. ` : ''}
                {analysis.quantity ? `Quantidade: ${analysis.quantity}. ` : ''}
                {analysis.deadline ? `Precisa para ${analysis.deadline.label} (${analysis.deadline.daysAway} dias).` : ''}
              </p>
              <label className="field">
                <span>Nome da cliente</span>
                <input value={nameOverride ?? analysis.customerName ?? ''} onChange={(e) => { setNameOverride(e.target.value); setEdited(null) }} placeholder="Como você a chama" maxLength={40} />
              </label>

              <div className="field">
                <span>Valor para usar na resposta</span>
                {quotes.length > 0 ? (
                  <select value={quoteId} onChange={(e) => { setQuoteId(e.target.value); setEdited(null) }} aria-label="Orçamento salvo">
                    <option value="">Digitar o valor</option>
                    {quotes.map((q) => <option key={q.id} value={q.id}>{q.name} — {money(q.price)}</option>)}
                  </select>
                ) : (
                  <p className="hint">Você ainda não salvou orçamentos. <button className="btn btn--ghost" onClick={onCalculator}>Abrir a Calculadora de preço</button></p>
                )}
                {!quote && (
                  <div className="row">
                    <NumberField label="Preço" prefix="R$" value={manualPrice} onChange={(v) => { setManualPrice(v); setEdited(null) }} />
                    <NumberField label="Preço mínimo" prefix="R$" value={manualMin} onChange={(v) => { setManualMin(v); setEdited(null) }} hint="Para limitar o desconto." />
                  </div>
                )}
              </div>
            </section>

            <section className="card">
              <h2 className="card__title">3. Resposta sugerida</h2>
              <div className="seg seg--3" role="group" aria-label="Tom da resposta">
                {(Object.keys(TONE_LABEL) as Tone[]).map((t) => (
                  <button key={t} className={`seg__btn${tone === t ? ' seg__btn--on' : ''}`} onClick={() => { setTone(t); setEdited(null) }}>{TONE_LABEL[t]}</button>
                ))}
              </div>
              <label className="field field--inline">
                <input type="checkbox" checked={emoji} onChange={(e) => { setEmoji(e.target.checked); setEdited(null) }} />
                <span>Usar emojis</span>
              </label>
              <div className="chips" role="group" aria-label="Versão da resposta">
                {suggestion.variants.map((v) => (
                  <button key={v.id} className={`chip${variant?.id === v.id ? ' chip--on' : ''}`} onClick={() => { setVariantId(v.id); setEdited(null) }}>{v.label}</button>
                ))}
              </div>
              <label className="field">
                <span>Você pode editar antes de copiar</span>
                <textarea className="reply" rows={9} value={text} onChange={(e) => setEdited(e.target.value)} />
              </label>
              {suggestion.warnings.length > 0 && (
                <ul className="warnings" role="alert">
                  {suggestion.warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              )}
              {/\[[^\]]+\]/.test(text) && <p className="hint">Troque o que está entre [colchetes] antes de enviar.</p>}
              <div className="row row--tight">
                <button className="btn btn--primary" onClick={() => copy(text)}>Copiar resposta</button>
                <button className="btn" onClick={() => whatsapp(text)}>Abrir no WhatsApp</button>
              </div>
              {msg && <p className="toast" role="status">{msg}</p>}
            </section>
          </>
        )}

        <section className="card">
          <h2 className="card__title">Respostas rápidas</h2>
          <p className="hint">Mensagens prontas com os seus dados. Toque em Copiar.</p>
          <ul className="quick">
            {quick.map((q) => (
              <li key={q.id}>
                <details>
                  <summary>{q.title}</summary>
                  <p className="quick__text">{q.text}</p>
                  <div className="row row--tight">
                    <button className="btn btn--soft btn--sm" onClick={() => copy(q.text)}>Copiar</button>
                    <button className="btn btn--sm" onClick={() => whatsapp(q.text)}>WhatsApp</button>
                  </div>
                </details>
              </li>
            ))}
          </ul>
          {!hasText && msg && <p className="toast" role="status">{msg}</p>}
        </section>

        <section className="card">
          <details className="more" open={!settings.myName}>
            <summary>Seus dados (usados nas respostas)</summary>
            <label className="field">
              <span>Seu nome na conversa</span>
              <input value={settings.myName} onChange={(e) => setSetting('myName', e.target.value)} placeholder="Igual aparece no WhatsApp" maxLength={40} />
              <small className="hint">Assim o assistente sabe qual lado é você.</small>
            </label>
            <label className="field">
              <span>Nome do ateliê (opcional)</span>
              <input value={settings.shopName} onChange={(e) => setSetting('shopName', e.target.value)} maxLength={40} />
            </label>
            <div className="row">
              <NumberField label="Prazo padrão" suffix="dias" value={settings.standardDays} onChange={(v) => setSetting('standardDays', v)} max={365} />
              <NumberField label="Sinal" suffix="%" value={settings.depositPct} onChange={(v) => setSetting('depositPct', v)} max={100} />
            </div>
            <label className="field">
              <span>Chave Pix</span>
              <input value={settings.pixKey} onChange={(e) => setSetting('pixKey', e.target.value)} autoCapitalize="off" maxLength={80} />
            </label>
            <label className="field">
              <span>Envio e retirada</span>
              <textarea rows={2} value={settings.shipping} onChange={(e) => setSetting('shipping', e.target.value)} placeholder="Ex.: Envio pelos Correios, frete por conta da cliente. Retirada combinada." maxLength={300} />
            </label>
            <label className="field">
              <span>Trocas e garantia</span>
              <textarea rows={2} value={settings.exchangePolicy} onChange={(e) => setSetting('exchangePolicy', e.target.value)} placeholder="Ex.: Se houver defeito de costura, conserto sem custo." maxLength={300} />
            </label>
            <p className="hint">Salvo só neste aparelho.</p>
          </details>
        </section>
      </div>
    </div>
  )
}
