import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { AppBar } from '../components/AppBar'
import { NumberField } from '../components/NumberField'
import type { ChartStore, SavedChart } from '../storage/charts'
import {
  calcPrice, maxDiscountPct, money, simulateDiscount, stitchesToGrams, stitchesToHours,
  type ExtraCost, type RoundTo,
} from '../tools/pricing'
import { toolsStorage, type PricingPrefs, type Quote } from '../tools/storage'

const ROUND_LABEL: Record<RoundTo, string> = { none: 'Sem arredondar', '1': 'Inteiro', '5': 'De 5 em 5', '10': 'De 10 em 10', '90': 'Termina em ,90' }
const BAR_COLOR = { material: 'var(--sky)', labor: 'var(--mint)', contingency: 'var(--butter)', fees: 'var(--peach)', profit: 'var(--brand)' } as const

export function PriceCalculator({ store, onBack, onAssistant }: { store: ChartStore; onBack: () => void; onAssistant: () => void }) {
  const { user } = useAuth()
  const db = useMemo(() => toolsStorage(user?.id ?? 'anon', window.localStorage), [user?.id])
  const [prefs, setPrefs] = useState<PricingPrefs>(() => db.getPrefs())
  const [name, setName] = useState('')
  const [gramsUsed, setGramsUsed] = useState(0)
  const [hours, setHours] = useState(0)
  const [extras, setExtras] = useState<ExtraCost[]>([])
  const [days, setDays] = useState(0)
  const [charts, setCharts] = useState<SavedChart[]>([])
  const [chartId, setChartId] = useState('')
  const [quotes, setQuotes] = useState<Quote[]>(() => db.listQuotes())
  const [discount, setDiscount] = useState(10)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!user) return
    let alive = true
    store.list(user.id).then((l) => alive && setCharts(l)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [store, user])

  const setPref = <K extends keyof PricingPrefs>(k: K, v: PricingPrefs[K]) =>
    setPrefs((p) => {
      const next = { ...p, [k]: v }
      db.savePrefs(next)
      return next
    })

  const chart = charts.find((c) => c.id === chartId)
  const stitches = chart ? chart.width * chart.height : 0
  const importChart = (id: string) => {
    setChartId(id)
    const c = charts.find((x) => x.id === id)
    if (!c) return
    if (!name) setName(c.name)
    const n = c.width * c.height
    setGramsUsed(Math.round(stitchesToGrams(n, prefs.gramsPer100)))
    setHours(Math.round(stitchesToHours(n, prefs.stitchesPerHour) * 10) / 10)
  }

  const input = { ...prefs, gramsUsed, extras, hours }
  const r = calcPrice(input)
  const maxDisc = maxDiscountPct(r)
  const sim = r.valid ? simulateDiscount(r, prefs, discount) : null

  const flash = (t: string) => {
    setMsg(t)
    window.setTimeout(() => setMsg(''), 2500)
  }
  const copy = async (text: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(text)
      flash(ok)
    } catch {
      flash('Não consegui copiar: selecione o texto e copie.')
    }
  }
  const quoteText = () =>
    `${name ? `Orçamento: ${name}\n` : 'Orçamento\n'}Valor: ${money(r.price)}\nSinal (${prefs.depositPct}%): ${money(r.deposit)}\nRestante na entrega: ${money(r.balance)}${days ? `\nPrazo: ${days} dias` : ''}`

  const saveQuote = () => {
    if (!r.valid) return
    db.addQuote({ name: name.trim() || 'Sem nome', price: r.price, minPrice: r.minPrice, deposit: r.deposit, days: days || null })
    setQuotes(db.listQuotes())
    flash('Orçamento salvo. O Assistente de vendas já pode usar.')
  }

  const setExtra = (i: number, patch: Partial<ExtraCost>) => setExtras((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  return (
    <div className="studio-page">
      <AppBar title="Calculadora de preço" onBack={onBack} />
      <div className="app tool-page">
        <header className="top">
          <h1>Calculadora de preço</h1>
          <p>Material, horas e lucro: o preço certo da peça.</p>
        </header>

        <section className="card">
          <h2 className="card__title">1. A peça</h2>
          <label className="field">
            <span>Nome da peça ou da cliente</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Manta Helena" maxLength={60} />
          </label>
          {charts.length > 0 && (
            <label className="field">
              <span>Calcular a partir de um gráfico seu (opcional)</span>
              <select value={chartId} onChange={(e) => importChart(e.target.value)}>
                <option value="">Não usar</option>
                {charts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.width * c.height} pontos</option>
                ))}
              </select>
              {chart && (
                <small className="hint">
                  {stitches} pontos → {gramsUsed} g e {hours} h, com {prefs.gramsPer100} g a cada 100 pontos e {prefs.stitchesPerHour} pontos por hora. Ajuste abaixo se quiser.
                </small>
              )}
            </label>
          )}
          <NumberField label="Prazo para entregar (opcional)" value={days} onChange={setDays} suffix="dias" max={365} />
        </section>

        <section className="card">
          <h2 className="card__title">2. Fio e materiais</h2>
          <div className="row">
            <NumberField label="Preço do novelo" prefix="R$" value={prefs.skeinPrice} onChange={(v) => setPref('skeinPrice', v)} />
            <NumberField label="Peso do novelo" suffix="g" value={prefs.skeinGrams} onChange={(v) => setPref('skeinGrams', v)} />
          </div>
          <NumberField label="Fio gasto na peça" suffix="g" value={gramsUsed} onChange={setGramsUsed} hint="Pese o novelo antes e depois de uma peça parecida." />
          <label className="field field--inline">
            <input type="checkbox" checked={prefs.wholeSkeins} onChange={(e) => setPref('wholeSkeins', e.target.checked)} />
            <span>Cobrar novelos inteiros{r.valid || gramsUsed > 0 ? ` (${Math.ceil(gramsUsed / Math.max(1, prefs.skeinGrams) - 1e-9)} novelo(s))` : ''}</span>
          </label>
          <div className="extras">
            <span className="side-label">Outros materiais (enchimento, olhos, forro, embalagem…)</span>
            {extras.map((x, i) => (
              <div className="extras__row" key={i}>
                <input value={x.name} onChange={(e) => setExtra(i, { name: e.target.value })} placeholder="Item" aria-label={`Item ${i + 1}`} maxLength={40} />
                <NumberField label="Valor" prefix="R$" value={x.cost} onChange={(v) => setExtra(i, { cost: v })} />
                <button type="button" className="btn btn--sm" onClick={() => setExtras((l) => l.filter((_, j) => j !== i))} aria-label={`Remover item ${i + 1}`}>✕</button>
              </div>
            ))}
            <button type="button" className="btn btn--soft btn--sm" onClick={() => setExtras((l) => [...l, { name: '', cost: 0 }])}>+ Adicionar material</button>
          </div>
        </section>

        <section className="card">
          <h2 className="card__title">3. Seu trabalho</h2>
          <div className="row">
            <NumberField label="Horas trabalhadas" suffix="h" value={hours} onChange={setHours} />
            <NumberField label="Valor da sua hora" prefix="R$" value={prefs.hourlyRate} onChange={(v) => setPref('hourlyRate', v)} />
          </div>
          <details className="more">
            <summary>Seu ritmo (para calcular a partir do gráfico)</summary>
            <div className="row">
              <NumberField label="Fio por 100 pontos" suffix="g" value={prefs.gramsPer100} onChange={(v) => setPref('gramsPer100', v)} />
              <NumberField label="Pontos por hora" value={prefs.stitchesPerHour} onChange={(v) => setPref('stitchesPerHour', v)} />
            </div>
            <p className="hint">Valores de exemplo: use os seus. Cronometre 10 minutos de crochê e conte os pontos.</p>
          </details>
        </section>

        <section className="card">
          <h2 className="card__title">4. Taxas e lucro</h2>
          <div className="row">
            <NumberField label="Imprevistos" suffix="%" value={prefs.contingencyPct} onChange={(v) => setPref('contingencyPct', v)} max={100} hint="Sobre material + trabalho." />
            <NumberField label="Lucro desejado" suffix="%" value={prefs.marginPct} onChange={(v) => setPref('marginPct', v)} max={95} hint="Sobre o preço final." />
          </div>
          <div className="row">
            <NumberField label="Taxas (maquininha, plataforma)" suffix="%" value={prefs.feesPct} onChange={(v) => setPref('feesPct', v)} max={95} />
            <NumberField label="Impostos" suffix="%" value={prefs.taxPct} onChange={(v) => setPref('taxPct', v)} max={95} />
          </div>
          <div className="row">
            <NumberField label="Sinal para reservar" suffix="%" value={prefs.depositPct} onChange={(v) => setPref('depositPct', v)} max={100} />
            <label className="field">
              <span>Arredondar o preço</span>
              <select value={prefs.roundTo} onChange={(e) => setPref('roundTo', e.target.value as RoundTo)}>
                {(Object.keys(ROUND_LABEL) as RoundTo[]).map((k) => <option key={k} value={k}>{ROUND_LABEL[k]}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="card result" aria-live="polite">
          <h2 className="card__title">Resultado</h2>
          {!r.valid ? (
            <p className="notice">{r.error}</p>
          ) : (
            <>
              <div className="result__price">
                <span>Preço sugerido</span>
                <b>{money(r.price)}</b>
                <small>Lucro de {money(r.profit)} ({Math.round(r.profitPct * 100)}% do preço) · não venda por menos de {money(r.minPrice)}</small>
              </div>
              <div className="stackbar" role="img" aria-label="Para onde vai o dinheiro">
                {r.breakdown.filter((b) => b.value > 0).map((b) => (
                  <span key={b.key} style={{ flexGrow: b.value, background: BAR_COLOR[b.key] }} title={`${b.label}: ${money(b.value)}`} />
                ))}
              </div>
              <ul className="legend-list">
                {r.breakdown.filter((b) => b.value > 0).map((b) => (
                  <li key={b.key}><i style={{ background: BAR_COLOR[b.key] }} />{b.label}<b>{money(b.value)}</b></li>
                ))}
              </ul>
              <p className="hint">
                Sinal de {prefs.depositPct}%: <b>{money(r.deposit)}</b> · restante na entrega: <b>{money(r.balance)}</b>
              </p>

              <div className="discount">
                <NumberField label="E se a cliente pedir desconto de" suffix="%" value={discount} onChange={setDiscount} max={100} />
                {sim && (
                  <p className={sim.loss ? 'error' : 'hint'}>
                    {sim.loss
                      ? `Com ${discount}% você fica em ${money(sim.price)} e teria prejuízo de ${money(-sim.profit)}.`
                      : `Com ${discount}% fica em ${money(sim.price)} e você ainda lucra ${money(sim.profit)}.`}
                    {' '}Desconto máximo sem prejuízo: {maxDisc}%.
                  </p>
                )}
              </div>

              <div className="row row--tight">
                <button className="btn btn--primary" onClick={saveQuote}>Salvar orçamento</button>
                <button className="btn" onClick={() => copy(quoteText(), 'Texto do orçamento copiado.')}>Copiar para a cliente</button>
              </div>
            </>
          )}
          {msg && <p className="toast" role="status">{msg}</p>}
        </section>

        {quotes.length > 0 && (
          <section className="card">
            <h2 className="card__title">Orçamentos salvos</h2>
            <ul className="quotes">
              {quotes.map((q) => (
                <li key={q.id}>
                  <span><b>{q.name}</b><small className="hint">{new Date(q.createdAt).toLocaleDateString('pt-BR')} · mínimo {money(q.minPrice)}</small></span>
                  <b>{money(q.price)}</b>
                  <button className="btn btn--ghost" onClick={() => { db.removeQuote(q.id); setQuotes(db.listQuotes()) }} aria-label={`Apagar orçamento ${q.name}`}>Apagar</button>
                </li>
              ))}
            </ul>
            <button className="btn btn--outline" onClick={onAssistant}>💬 Responder uma cliente com esses valores</button>
          </section>
        )}

        {r.valid && (
          <div className="pricebar" aria-hidden>
            <span>{name || 'Preço sugerido'}</span>
            <b>{money(r.price)}</b>
          </div>
        )}
        <div className="pricebar-gap" />
      </div>
    </div>
  )
}
