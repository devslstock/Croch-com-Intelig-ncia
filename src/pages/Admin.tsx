import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount } from '../billing/AccountProvider'
import type { AdminChatbot, AdminChatItem, AdminCoupon, AdminPayment, AdminStats, AdminUser, AuditEntry, ChatItemInput, CouponInput, PaymentCheck, PaymentConfig, PaymentEvent, PaymentMode, PaymentSide } from '../billing/adminStore'
import { DEFAULT_PRICES, daysLeft, formatCents, PLAN_LABEL, type PaidPlan, type Plan, type Prices } from '../billing/plans'
import { AppBar } from '../components/AppBar'
import { NumberField } from '../components/NumberField'
import type { ChatConfig } from '../landing/chatbot'

type Filter = 'todos' | 'ativos' | 'vencendo' | 'sem' | 'bloqueados' | 'cupom'
const FILTERS: Array<[Filter, string]> = [['todos', 'Todos'], ['ativos', 'Ativos'], ['vencendo', 'Vencem em 7 dias'], ['sem', 'Sem plano'], ['bloqueados', 'Desativados'], ['cupom', 'Com cupom']]

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')
const contact = (u: AdminUser) => u.email ?? u.phone ?? 'sem contato'

function matches(u: AdminUser, f: Filter): boolean {
  if (f === 'ativos') return u.effective !== 'none'
  if (f === 'vencendo') {
    const d = daysLeft(u.expiresAt)
    return u.effective !== 'none' && d !== null && d <= 7
  }
  if (f === 'sem') return u.effective === 'none' && !u.blocked
  if (f === 'bloqueados') return u.blocked
  if (f === 'cupom') return !!u.coupon
  return true
}

function statusOf(u: AdminUser): { label: string; kind: 'ok' | 'warn' | 'off' } {
  if (u.blocked) return { label: 'Desativada', kind: 'off' }
  if (u.effective === 'none') return { label: u.plan === 'none' ? 'Sem plano' : 'Vencida', kind: u.plan === 'none' ? 'off' : 'warn' }
  if (u.trialEndsAt) return { label: `Teste grátis até ${new Date(u.trialEndsAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`, kind: 'ok' }
  const d = daysLeft(u.expiresAt)
  if (d !== null && d <= 7) return { label: `Vence em ${Math.max(0, d)} d`, kind: 'warn' }
  return { label: 'Ativa', kind: 'ok' }
}

function UserEditor({ u, onSaved }: { u: AdminUser; onSaved: () => void }) {
  const { admin } = useAccount()
  const [plan, setPlan] = useState<Plan>(u.plan)
  const [expires, setExpires] = useState<string | null>(u.expiresAt)
  const [blocked, setBlocked] = useState(u.blocked)
  const [note, setNote] = useState(u.note)
  const [bonus, setBonus] = useState(u.bonusImages)
  const [bonusBusy, setBonusBusy] = useState(false)
  const [payments, setPayments] = useState<AdminPayment[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'erro'; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    admin.payments(u.id).then((p) => alive && setPayments(p)).catch(() => alive && setPayments([]))
    return () => {
      alive = false
    }
  }, [admin, u.id])

  const extend = (days: number) => {
    const base = Math.max(Date.now(), expires ? new Date(expires).getTime() : 0)
    setExpires(new Date(base + days * 86_400_000).toISOString())
    if (plan === 'none') setPlan('basic')
  }
  const dateValue = expires ? new Date(expires).toISOString().slice(0, 10) : ''
  const dirty = plan !== u.plan || expires !== u.expiresAt || blocked !== u.blocked || note !== u.note

  const saveBonus = async () => {
    setBonusBusy(true)
    setMsg(null)
    try {
      await admin.setBonus(u.id, bonus)
      setMsg({ kind: 'ok', text: 'Bônus salvo.' })
      onSaved()
    } catch (e) {
      setMsg({ kind: 'erro', text: e instanceof Error ? e.message : 'Não foi possível salvar o bônus.' })
    } finally {
      setBonusBusy(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await admin.update(u.id, { plan, expiresAt: expires, blocked, note: note.trim() })
      setMsg({ kind: 'ok', text: 'Salvo.' })
      onSaved()
    } catch (e) {
      setMsg({ kind: 'erro', text: e instanceof Error ? e.message : 'Não foi possível salvar.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="editor-user">
      <div className="row">
        <label className="field">
          <span>Plano</span>
          <select value={plan} onChange={(e) => setPlan(e.target.value as Plan)}>
            <option value="none">Sem plano</option>
            <option value="basic">Básico</option>
            <option value="plus">Plus</option>
          </select>
        </label>
        <label className="field">
          <span>Vence em</span>
          <input type="date" value={dateValue} onChange={(e) => setExpires(e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null)} />
        </label>
      </div>
      <div className="row row--tight">
        <button className="btn btn--sm" onClick={() => extend(30)}>+30 dias</button>
        <button className="btn btn--sm" onClick={() => extend(365)}>+1 ano</button>
        <button className="btn btn--sm" onClick={() => setExpires(null)}>Sem vencimento</button>
      </div>
      <p className="hint">Sem vencimento = cortesia: o plano não expira sozinho.</p>
      <label className="field field--inline">
        <input type="checkbox" checked={blocked} onChange={(e) => setBlocked(e.target.checked)} />
        <span>Desativar esta conta (perde o acesso mesmo com plano pago)</span>
      </label>
      {u.coupon && <p className="hint">🎟 Cupom ligado à conta: <b>{u.coupon}</b></p>}
      <label className="field">
        <span>Anotação (só você vê)</span>
        <textarea rows={3} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="bonus-row">
        <NumberField label="Gráficos de bônus" value={bonus} max={10000} onChange={(v) => setBonus(Math.round(v))} hint="Gráficos de presente que a pessoa ainda pode criar." />
        <button className="btn btn--sm" onClick={saveBonus} disabled={bonusBusy || bonus === u.bonusImages}>{bonusBusy ? 'Salvando…' : 'Salvar bônus'}</button>
      </div>
      {msg && <p className={msg.kind === 'ok' ? 'ok' : 'error'} role={msg.kind === 'ok' ? 'status' : 'alert'}>{msg.text}</p>}
      <button className="btn btn--primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Salvando…' : 'Salvar alterações'}</button>

      <h4 className="editor-user__h">Pagamentos</h4>
      {payments === null ? <p className="hint">Carregando…</p> : payments.length === 0 ? <p className="hint">Nenhum pagamento registrado.</p> : (
        <ul className="paylist">
          {payments.map((p) => (
            <li key={p.id}>
              <span>{fmt(p.paidAt)} · {PLAN_LABEL[p.plan]} {p.cycle === 'yearly' ? 'anual' : 'mensal'} · {p.method === 'pix' ? 'Pix' : 'Cartão'}{p.coupon ? ` · cupom ${p.coupon} (−${formatCents(p.discountCents ?? 0)})` : ''}</span>
              <b>{formatCents(p.amountCents)}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}


const EMPTY_COUPON: CouponInput = { code: '', description: '', kind: 'percent', value: 10, plans: ['basic', 'plus'], cycles: 'both', maxUses: null, expiresAt: null, active: true }

/** "10% · todos os planos · qualquer período": resumo de um cupom. */
function couponSummary(c: Pick<AdminCoupon, 'kind' | 'value' | 'plans' | 'cycles'>): string {
  const off = c.kind === 'percent' ? `${c.value}% de desconto` : `${formatCents(c.value)} de desconto`
  const plans = c.plans.length === 2 ? 'Básico e Plus' : c.plans[0] === 'basic' ? 'só Básico' : 'só Plus'
  const cycles = c.cycles === 'both' ? 'mensal e anual' : c.cycles === 'yearly' ? 'só anual' : 'só mensal'
  return `${off} · ${plans} · ${cycles}`
}

function couponStatus(c: AdminCoupon): { label: string; kind: 'ok' | 'warn' | 'off' } {
  if (!c.active) return { label: 'Pausado', kind: 'off' }
  if (c.expiresAt && new Date(c.expiresAt) <= new Date()) return { label: 'Vencido', kind: 'warn' }
  if (c.maxUses !== null && c.uses >= c.maxUses) return { label: 'Esgotado', kind: 'warn' }
  return { label: 'Ativo', kind: 'ok' }
}

function Coupons() {
  const { admin } = useAccount()
  const [list, setList] = useState<AdminCoupon[] | null>(null)
  const [form, setForm] = useState<CouponInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'erro'; text: string } | null>(null)

  const load = useCallback(() => admin.coupons().then(setList).catch(() => setList([])), [admin])
  const set = <K extends keyof CouponInput>(k: K, v: CouponInput[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))
  const togglePlan = (p: PaidPlan) => setForm((f) => {
    if (!f) return f
    const has = f.plans.includes(p)
    const plans = has ? f.plans.filter((x) => x !== p) : [...f.plans, p]
    return plans.length ? { ...f, plans } : f // sempre pelo menos um plano
  })

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      await load()
      setMsg({ kind: 'ok', text: ok })
      return true
    } catch (e) {
      setMsg({ kind: 'erro', text: e instanceof Error ? e.message : 'Não foi possível concluir.' })
      return false
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!form) return
    if (await run(() => admin.saveCoupon({ ...form, code: form.code.trim().toUpperCase() }), form.id ? 'Cupom atualizado.' : 'Cupom criado.')) setForm(null)
  }
  const edit = (c: AdminCoupon) => {
    setMsg(null)
    setForm({ id: c.id, code: c.code, description: c.description, kind: c.kind, value: c.value, plans: c.plans, cycles: c.cycles, maxUses: c.maxUses, expiresAt: c.expiresAt, active: c.active })
  }
  const toggle = (c: AdminCoupon) =>
    run(() => admin.saveCoupon({ id: c.id, code: c.code, description: c.description, kind: c.kind, value: c.value, plans: c.plans, cycles: c.cycles, maxUses: c.maxUses, expiresAt: c.expiresAt, active: !c.active }), c.active ? 'Cupom pausado.' : 'Cupom ativado.')
  const remove = (c: AdminCoupon) => {
    if (!window.confirm(`Apagar o cupom ${c.code}?`)) return
    void run(() => admin.deleteCoupon(c.id), 'Cupom apagado.')
  }

  return (
    <details className="card more" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) void load() }}>
      <summary>Cupons de desconto</summary>
      <p className="hint">A pessoa informa o cupom ao criar a conta ou na tela de assinatura. Quem usa fica com o código escrito na anotação dela.</p>
      {msg && <p className={msg.kind === 'ok' ? 'ok' : 'error'} role={msg.kind === 'ok' ? 'status' : 'alert'}>{msg.text}</p>}

      {!form && <button className="btn btn--primary btn--sm" onClick={() => { setMsg(null); setForm({ ...EMPTY_COUPON }) }}>+ Novo cupom</button>}

      {form && (
        <div className="coupon-form">
          <h4 className="editor-user__h">{form.id ? 'Editar cupom' : 'Novo cupom'}</h4>
          <label className="field">
            <span>Código (o que a pessoa digita)</span>
            <input value={form.code} maxLength={32} autoCapitalize="characters" placeholder="Ex.: BEMVINDA10" onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} />
          </label>
          <label className="field">
            <span>Descrição (só você vê)</span>
            <input value={form.description} maxLength={120} placeholder="Ex.: Parceria com a loja X" onChange={(e) => set('description', e.target.value)} />
          </label>
          <div className="seg" role="group" aria-label="Tipo de desconto">
            <button className={`seg__btn${form.kind === 'percent' ? ' seg__btn--on' : ''}`} onClick={() => setForm({ ...form, kind: 'percent', value: Math.min(form.value, 99) })}>Porcentagem</button>
            <button className={`seg__btn${form.kind === 'fixed' ? ' seg__btn--on' : ''}`} onClick={() => setForm({ ...form, kind: 'fixed', value: form.kind === 'percent' ? 1000 : form.value })}>Valor em R$</button>
          </div>
          {form.kind === 'percent'
            ? <NumberField label="Desconto" suffix="%" value={form.value} max={99} onChange={(v) => set('value', Math.round(v))} />
            : <NumberField label="Desconto" prefix="R$" value={form.value / 100} onChange={(v) => set('value', Math.round(v * 100))} hint="O preço final nunca fica abaixo de R$ 1,00." />}
          <fieldset className="field field--group">
            <legend>Vale para</legend>
            <label className="field field--inline"><input type="checkbox" checked={form.plans.includes('basic')} onChange={() => togglePlan('basic')} /><span>Plano Básico</span></label>
            <label className="field field--inline"><input type="checkbox" checked={form.plans.includes('plus')} onChange={() => togglePlan('plus')} /><span>Plano Plus</span></label>
          </fieldset>
          <label className="field">
            <span>Período do pagamento</span>
            <select value={form.cycles} onChange={(e) => set('cycles', e.target.value as CouponInput['cycles'])}>
              <option value="both">Mensal e anual</option>
              <option value="monthly">Só mensal</option>
              <option value="yearly">Só anual</option>
            </select>
          </label>
          <div className="row">
            <NumberField label="Limite de pessoas" value={form.maxUses ?? 0} max={1_000_000} onChange={(v) => set('maxUses', v >= 1 ? Math.round(v) : null)} hint="Vazio = sem limite." />
            <label className="field">
              <span>Vale até</span>
              <input type="date" value={form.expiresAt ? new Date(form.expiresAt).toISOString().slice(0, 10) : ''} onChange={(e) => set('expiresAt', e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null)} />
            </label>
          </div>
          <label className="field field--inline">
            <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
            <span>Cupom ativo</span>
          </label>
          <p className="hint">Na assinatura mensal no cartão o desconto vale em todas as cobranças. Para desconto só no primeiro mês, use o período “Só anual” ou um cupom com data de validade.</p>
          <div className="row row--tight">
            <button className="btn btn--primary" onClick={save} disabled={busy || form.code.length < 3 || form.value < 1}>{busy ? 'Salvando…' : 'Salvar cupom'}</button>
            <button className="btn" onClick={() => { setForm(null); setMsg(null) }} disabled={busy}>Cancelar</button>
          </div>
        </div>
      )}

      {list === null ? <p className="hint">Carregando…</p> : list.length === 0 ? <p className="hint">Nenhum cupom cadastrado.</p> : (
        <ul className="coupons">
          {list.map((c) => {
            const st = couponStatus(c)
            return (
              <li key={c.id} className="coupon-item">
                <div className="coupon-item__top">
                  <b className="coupon-item__code">{c.code}</b>
                  <em className={`tag tag--${st.kind}`}>{st.label}</em>
                </div>
                <small>{couponSummary(c)}</small>
                {c.description && <small className="hint">{c.description}</small>}
                <small className="hint">
                  Pagaram com o cupom: {c.uses}{c.maxUses !== null ? ` de ${c.maxUses}` : ''} · contas com o cupom: {c.attached}{c.expiresAt ? ` · vale até ${fmt(c.expiresAt)}` : ''}
                </small>
                <div className="row row--tight">
                  <button className="btn btn--sm" onClick={() => edit(c)} disabled={busy}>Editar</button>
                  <button className="btn btn--sm" onClick={() => void toggle(c)} disabled={busy}>{c.active ? 'Pausar' : 'Ativar'}</button>
                  <button className="btn btn--sm" onClick={() => remove(c)} disabled={busy || c.uses > 0} title={c.uses > 0 ? 'Já foi usado em pagamentos: pause em vez de apagar' : ''}>Apagar</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </details>
  )
}


const EMPTY_ITEM: ChatItemInput = { question: '', answer: '', keywords: '', sort: 100, active: true }
const TOKENS = ['{{basico_mensal}}', '{{basico_anual}}', '{{plus_mensal}}', '{{plus_anual}}', '{{meses_pagos}}', '{{limite_basico}}', '{{bonus}}']

/** Perguntas e respostas do chat da página "Saiba mais" (e da tela de login). */
function Chatbot() {
  const { admin } = useAccount()
  const [data, setData] = useState<AdminChatbot | null>(null)
  const [form, setForm] = useState<ChatItemInput | null>(null)
  const [cfg, setCfg] = useState<ChatConfig | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'erro'; text: string } | null>(null)

  const load = useCallback(
    () => admin.chatbot().then((d) => { setData(d); setCfg((c) => c ?? d.config) }).catch(() => setData({ config: { greeting: '', fallback: '', whatsapp: '' }, items: [] })),
    [admin],
  )
  const set = <K extends keyof ChatItemInput>(k: K, v: ChatItemInput[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      await load()
      setMsg({ kind: 'ok', text: ok })
      return true
    } catch (e) {
      setMsg({ kind: 'erro', text: e instanceof Error ? e.message : 'Não foi possível concluir.' })
      return false
    } finally {
      setBusy(false)
    }
  }

  const saveItem = async () => {
    if (form && (await run(() => admin.saveChatItem(form), form.id ? 'Pergunta atualizada.' : 'Pergunta criada.'))) setForm(null)
  }
  const edit = (i: AdminChatItem) => {
    setMsg(null)
    setForm({ id: i.id, question: i.question, answer: i.answer, keywords: i.keywords, sort: i.sort, active: i.active })
  }
  const toggle = (i: AdminChatItem) => run(() => admin.saveChatItem({ ...i, active: !i.active }), i.active ? 'Pergunta pausada: não aparece no chat.' : 'Pergunta ativada.')
  const remove = (i: AdminChatItem) => {
    if (!window.confirm(`Apagar a pergunta “${i.question}”?`)) return
    void run(() => admin.deleteChatItem(i.id), 'Pergunta apagada.')
  }
  const saveConfig = () => cfg && run(() => admin.saveChatConfig(cfg), 'Textos do chat salvos.')

  return (
    <details className="card more" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) void load() }}>
      <summary>Chatbot de dúvidas (página “Saiba mais”)</summary>
      <p className="hint">O chat aparece para quem ainda não entrou. A pessoa toca numa pergunta ou escreve a dela, e o robô responde com a resposta cadastrada mais parecida.</p>
      {msg && <p className={msg.kind === 'ok' ? 'ok' : 'error'} role={msg.kind === 'ok' ? 'status' : 'alert'}>{msg.text}</p>}

      <h4 className="editor-user__h">Mensagens do robô</h4>
      {cfg && (
        <div className="coupon-form">
          <label className="field">
            <span>Mensagem de boas-vindas</span>
            <textarea rows={3} maxLength={300} value={cfg.greeting} onChange={(e) => setCfg({ ...cfg, greeting: e.target.value })} />
          </label>
          <label className="field">
            <span>Quando não achar a resposta</span>
            <textarea rows={3} maxLength={300} value={cfg.fallback} onChange={(e) => setCfg({ ...cfg, fallback: e.target.value })} />
          </label>
          <label className="field">
            <span>WhatsApp para falar com uma pessoa (opcional)</span>
            <input inputMode="numeric" maxLength={20} placeholder="5581999990000" value={cfg.whatsapp} onChange={(e) => setCfg({ ...cfg, whatsapp: e.target.value.replace(/\D/g, '') })} />
            <small className="hint">Só números, com 55 + DDD + número. Vazio = sem botão de WhatsApp no chat.</small>
          </label>
          <button className="btn btn--sm" onClick={saveConfig} disabled={busy}>Salvar mensagens</button>
        </div>
      )}

      <h4 className="editor-user__h">Perguntas e respostas</h4>
      {!form && <button className="btn btn--primary btn--sm" onClick={() => { setMsg(null); setForm({ ...EMPTY_ITEM, sort: ((data?.items.at(-1)?.sort ?? 90) + 10) }) }}>+ Nova pergunta</button>}

      {form && (
        <div className="coupon-form">
          <h4 className="editor-user__h">{form.id ? 'Editar pergunta' : 'Nova pergunta'}</h4>
          <label className="field">
            <span>Pergunta (aparece como botão no chat)</span>
            <input value={form.question} maxLength={120} placeholder="Ex.: Quanto custa?" onChange={(e) => set('question', e.target.value)} />
          </label>
          <label className="field">
            <span>Resposta</span>
            <textarea rows={5} maxLength={1200} value={form.answer} onChange={(e) => set('answer', e.target.value)} />
            <small className="hint">Use estes marcadores para o valor sempre acompanhar o painel de preços: {TOKENS.join('  ')}</small>
          </label>
          <label className="field">
            <span>Palavras-chave (ajudam o robô a achar esta resposta)</span>
            <input value={form.keywords} maxLength={300} placeholder="preço, valor, custa, mensalidade" onChange={(e) => set('keywords', e.target.value)} />
            <small className="hint">Separe por vírgula. Pense no que a pessoa digitaria.</small>
          </label>
          <div className="row">
            <NumberField label="Ordem" value={form.sort} max={10000} onChange={(v) => set('sort', Math.round(v))} hint="Menor aparece primeiro." />
            <label className="field field--inline">
              <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
              <span>Ativa (aparece no chat)</span>
            </label>
          </div>
          <div className="row row--tight">
            <button className="btn btn--primary" onClick={saveItem} disabled={busy || form.question.trim().length < 3 || !form.answer.trim()}>{busy ? 'Salvando…' : 'Salvar pergunta'}</button>
            <button className="btn" onClick={() => { setForm(null); setMsg(null) }} disabled={busy}>Cancelar</button>
          </div>
        </div>
      )}

      {data === null ? <p className="hint">Carregando…</p> : data.items.length === 0 ? <p className="hint">Nenhuma pergunta cadastrada.</p> : (
        <ul className="coupons">
          {data.items.map((i) => (
            <li key={i.id} className="chatbot-item">
              <div className="coupon-item__top">
                <b>{i.question}</b>
                <em className={`tag tag--${i.active ? 'ok' : 'off'}`}>{i.active ? 'Ativa' : 'Pausada'}</em>
              </div>
              <small className="hint">{i.answer.length > 140 ? `${i.answer.slice(0, 140)}…` : i.answer}</small>
              <small className="hint">Ordem {i.sort}{i.keywords ? ` · palavras-chave: ${i.keywords}` : ''}</small>
              <div className="row row--tight">
                <button className="btn btn--sm" onClick={() => edit(i)} disabled={busy}>Editar</button>
                <button className="btn btn--sm" onClick={() => void toggle(i)} disabled={busy}>{i.active ? 'Pausar' : 'Ativar'}</button>
                <button className="btn btn--sm" onClick={() => remove(i)} disabled={busy}>Apagar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

function Settings() {
  const { admin, reload } = useAccount()
  const [p, setP] = useState<Prices>(DEFAULT_PRICES)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    admin.settings().then((s) => { setP(s); setReady(true) }).catch(() => setMsg('Não consegui carregar os preços.'))
  }, [admin])

  const set = <K extends keyof Prices>(k: K, v: number) => setP((x) => ({ ...x, [k]: v }))
  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await admin.updateSettings({ ...p, basicMonthlyCents: Math.max(1, p.basicMonthlyCents), plusMonthlyCents: Math.max(1, p.plusMonthlyCents), yearlyFreeMonths: Math.min(11, p.yearlyFreeMonths), basicImageLimit: Math.max(1, p.basicImageLimit), signupBonusImages: Math.max(0, Math.min(1000, p.signupBonusImages)), trialDays: Math.max(0, Math.min(365, p.trialDays)) })
      await reload()
      setMsg('Preços salvos. Valem para os próximos pagamentos.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="card more">
      <summary>Preços e limites</summary>
      {!ready ? <p className="hint">Carregando…</p> : (
        <>
          <div className="row">
            <NumberField label="Básico por mês" prefix="R$" value={p.basicMonthlyCents / 100} onChange={(v) => set('basicMonthlyCents', Math.round(v * 100))} />
            <NumberField label="Plus por mês" prefix="R$" value={p.plusMonthlyCents / 100} onChange={(v) => set('plusMonthlyCents', Math.round(v * 100))} />
          </div>
          <div className="row">
            <NumberField label="Meses grátis no plano anual" value={p.yearlyFreeMonths} onChange={(v) => set('yearlyFreeMonths', Math.round(v))} max={11} />
            <NumberField label="Imagens por mês no Básico" value={p.basicImageLimit} onChange={(v) => set('basicImageLimit', Math.round(v))} max={10000} />
          </div>
          <NumberField label="Dias de tolerância após vencer" value={p.graceDays} onChange={(v) => set('graceDays', Math.round(v))} max={30} hint="Tempo extra para o Pix compensar ou o cartão tentar de novo." />
          <NumberField label="Dias grátis no cadastro" value={p.trialDays} onChange={(v) => set('trialDays', Math.round(v))} max={365} hint="Quem criar a conta usa o plano Básico de graça por esses dias; depois precisa assinar. 0 = sem período grátis. Só vale para quem se cadastrar depois de salvar." />
          <NumberField label="Gráficos de bônus no cadastro" value={p.signupBonusImages} onChange={(v) => set('signupBonusImages', Math.round(v))} max={1000} hint="Cada conta nova ganha esses gráficos de presente, mesmo sem assinar. 0 = nenhum. Só vale para quem se cadastrar depois de salvar." />
          <p className="hint">Anual: {formatCents(p.basicMonthlyCents * (12 - p.yearlyFreeMonths))} no Básico e {formatCents(p.plusMonthlyCents * (12 - p.yearlyFreeMonths))} no Plus.</p>
          {msg && <p className="hint" role="status">{msg}</p>}
          <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar preços'}</button>
        </>
      )}
    </details>
  )
}

const MODE_LABEL: Record<PaymentMode, string> = { test: 'Teste', production: 'Produção' }
const WEBHOOK_URL = `${(import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://SEU-PROJETO.supabase.co'}/functions/v1/mp-webhook`
const EVENT_TEXT: Record<string, string> = {
  aplicado: 'Plano liberado',
  ja_aplicado: 'Já tinha sido liberado',
  assinatura_invalida: 'Recusado: assinatura secreta não confere',
  nao_configurado: 'Credenciais não configuradas',
  sem_referencia: 'Sem referência do Tramado',
  tipo_ignorado: 'Tipo de aviso ignorado',
  erro: 'Erro ao processar (o Mercado Pago tenta de novo)',
}
const CHECK_TEXT: Record<string, string> = {
  sem_token: 'Não há Access Token cadastrado para este modo.',
  token_recusado: 'O Mercado Pago recusou este Access Token. Confira se copiou o valor inteiro e se é do modo escolhido.',
  mp_indisponivel: 'O Mercado Pago não respondeu agora. Tente de novo em instantes.',
  demo: 'Na demonstração não há conexão real com o Mercado Pago.',
}

/** Credenciais de pagamento (Mercado Pago): teste e produção, e qual está valendo. Os valores nunca voltam para a tela. */
function Banco() {
  const { admin } = useAccount()
  const [cfg, setCfg] = useState<PaymentConfig | null>(null)
  const [mode, setMode] = useState<PaymentMode>('test')
  const [f, setF] = useState({ testToken: '', testSecret: '', prodToken: '', prodSecret: '' })
  const [buyer, setBuyer] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'erro'; text: string } | null>(null)
  const [check, setCheck] = useState<PaymentCheck | null>(null)
  const [events, setEvents] = useState<PaymentEvent[] | null>(null)
  const loadEvents = useCallback(() => admin.paymentEvents().then(setEvents).catch(() => setEvents([])), [admin])

  const load = useCallback(
    () => admin.paymentConfig().then((c) => { setCfg(c); setMode(c.mode); setBuyer(c.testBuyerEmail ?? '') }).catch(() => setMsg({ kind: 'erro', text: 'Não consegui carregar as credenciais.' })),
    [admin],
  )

  const save = async () => {
    if (mode === 'production' && cfg?.mode !== 'production' && !window.confirm('Ativar PRODUÇÃO? A partir de agora os pagamentos serão cobrados de verdade.')) return
    setBusy(true)
    setMsg(null)
    setCheck(null)
    try {
      await admin.savePaymentConfig({ mode, ...f })
      if (buyer.trim() !== (cfg?.testBuyerEmail ?? '')) await admin.setTestBuyer(buyer)
      setF({ testToken: '', testSecret: '', prodToken: '', prodSecret: '' })
      await load()
      setMsg({ kind: 'ok', text: `Salvo. Ambiente ativo: ${MODE_LABEL[mode]}.` })
    } catch (e) {
      setMsg({ kind: 'erro', text: e instanceof Error ? e.message : 'Não foi possível salvar.' })
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    setMsg(null)
    setCheck(null)
    try {
      setCheck(await admin.checkPayment())
    } catch (e) {
      setMsg({ kind: 'erro', text: e instanceof Error ? e.message : 'Não consegui testar.' })
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(WEBHOOK_URL)
      setMsg({ kind: 'ok', text: 'Endereço copiado.' })
    } catch {
      setMsg({ kind: 'erro', text: 'Não consegui copiar: selecione o endereço e copie.' })
    }
  }

  const side = (title: string, s: PaymentSide | undefined, tk: 'testToken' | 'prodToken', sk: 'testSecret' | 'prodSecret') => (
    <fieldset className="bank-side">
      <legend>{title} <em className={`tag tag--${s?.hasToken && s?.hasSecret ? 'ok' : 'off'}`}>{s?.hasToken && s?.hasSecret ? 'Cadastrado' : 'Faltando'}</em></legend>
      <label className="field">
        <span>Access Token</span>
        <input className="input" type="password" autoComplete="off" spellCheck={false} value={f[tk]} onChange={(e) => setF({ ...f, [tk]: e.target.value })}
          placeholder={s?.hasToken ? `••••••••${s.tokenHint} (deixe vazio para manter)` : 'APP_USR-…'} />
      </label>
      <label className="field">
        <span>Assinatura secreta do webhook</span>
        <input className="input" type="password" autoComplete="off" spellCheck={false} value={f[sk]} onChange={(e) => setF({ ...f, [sk]: e.target.value })}
          placeholder={s?.hasSecret ? `••••••••${s.secretHint} (deixe vazio para manter)` : 'Cole a assinatura secreta'} />
      </label>
    </fieldset>
  )

  return (
    <details className="card more" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) void load() }}>
      <summary>Banco (Mercado Pago)</summary>
      <p className="hint">Credenciais para receber os pagamentos. Teste e produção têm valores diferentes no Mercado Pago: cadastre os dois e escolha qual está valendo. Os valores salvos não voltam para a tela, só os 4 últimos caracteres.</p>
      {msg && <p className={msg.kind === 'ok' ? 'ok' : 'error'} role={msg.kind === 'ok' ? 'status' : 'alert'}>{msg.text}</p>}

      <h4 className="editor-user__h">Ambiente em uso</h4>
      <div className="seg" role="group" aria-label="Ambiente">
        {(['test', 'production'] as const).map((m) => (
          <button key={m} className={`seg__btn${mode === m ? ' seg__btn--on' : ''}`} aria-pressed={mode === m} onClick={() => setMode(m)}>{MODE_LABEL[m]}</button>
        ))}
      </div>
      <p className={mode === 'production' ? 'error' : 'hint'}>
        {mode === 'production' ? '⚠️ Produção: as cobranças são reais.' : 'Teste: nada é cobrado de verdade. Use as credenciais de teste do Mercado Pago.'}
        {cfg && cfg.mode !== mode ? ' (ainda não salvo)' : ''}
      </p>

      {side('Credenciais de teste', cfg?.test, 'testToken', 'testSecret')}
      <label className="field">
        <span>E-mail do comprador de teste</span>
        <input className="input" type="email" inputMode="email" autoComplete="off" spellCheck={false} value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="test_user_123@testuser.com" />
        <small className="hint">Em ambiente de teste o Mercado Pago só aceita pagador de teste. Crie um comprador em Contas de teste e cole o e-mail dele aqui: no ambiente de teste, qualquer conta passa a pagar com ele. Em produção este campo é ignorado.</small>
      </label>
      {side('Credenciais de produção', cfg?.production, 'prodToken', 'prodSecret')}

      <h4 className="editor-user__h">Endereço do webhook</h4>
      <p className="hint">No Mercado Pago, em Webhooks, cadastre este endereço (nos modos de teste e de produção) com os eventos Pagamentos, Planos e assinaturas e Pagamentos recorrentes. A assinatura secreta que ele mostra é a que vai acima.</p>
      <div className="coupon__form">
        <input className="input" readOnly value={WEBHOOK_URL} aria-label="Endereço do webhook" onFocus={(e) => e.currentTarget.select()} />
        <button className="btn" onClick={copy}>Copiar</button>
      </div>

      {check && (
        <p className={check.ok ? 'ok' : 'error'} role="status">
          {check.ok
            ? `Conectado ao Mercado Pago (${MODE_LABEL[check.mode]})${check.account?.nickname ? ` · conta ${check.account.nickname}` : ''}.${check.hasWebhookSecret ? '' : ' Falta a assinatura secreta do webhook.'}`
            : CHECK_TEXT[check.error ?? ''] ?? 'Não consegui conectar.'}
        </p>
      )}
      <div className="row">
        <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Aguarde…' : 'Salvar'}</button>
        <button className="btn" onClick={test} disabled={busy}>Testar conexão</button>
      </div>
      <h4 className="editor-user__h">Avisos recebidos do Mercado Pago</h4>
      <p className="hint">Cada aviso de pagamento ou assinatura que chega ao Tramado aparece aqui. Se você pagou e a lista está vazia, o Mercado Pago não está avisando: confira o endereço do webhook lá.</p>
      <button className="btn btn--sm" onClick={() => void loadEvents()}>Atualizar lista</button>
      {events && events.length === 0 && <p className="hint">Nenhum aviso recebido ainda.</p>}
      {events && events.length > 0 && (
        <ul className="paylist">
          {events.map((e, n) => (
            <li key={`${e.at}-${n}`}>
              <span>{new Date(e.at).toLocaleString('pt-BR')} · {e.type || 'aviso'} {e.dataId}</span>
              <b>{EVENT_TEXT[e.outcome] ?? e.outcome}</b>
            </li>
          ))}
        </ul>
      )}
      {cfg?.updatedAt && <p className="hint">Última alteração: {new Date(cfg.updatedAt).toLocaleString('pt-BR')}. O teste usa o ambiente já salvo.</p>}
    </details>
  )
}

const AUDIT_LABEL: Record<string, string> = {
  update_settings: 'Preços e limites',
  save_coupon: 'Cupom salvo',
  delete_coupon: 'Cupom apagado',
  set_bonus: 'Bônus ajustado',
  save_chatbot_item: 'Pergunta do chatbot salva',
  delete_chatbot_item: 'Pergunta do chatbot apagada',
  save_chatbot_config: 'Textos do chatbot salvos',
  save_payment_config: 'Credenciais do Banco alteradas',
}

function Audit() {
  const { admin } = useAccount()
  const [rows, setRows] = useState<AuditEntry[] | null>(null)
  return (
    <details className="card more" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) admin.audit().then(setRows).catch(() => setRows([])) }}>
      <summary>Histórico de mudanças manuais</summary>
      {rows === null ? <p className="hint">Carregando…</p> : rows.length === 0 ? <p className="hint">Nenhuma mudança manual ainda.</p> : (
        <ul className="paylist">
          {rows.map((r) => (
            <li key={r.id}>
              <span>{new Date(r.createdAt).toLocaleString('pt-BR')} · {AUDIT_LABEL[r.action] ?? 'Usuária editada'}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

export function Admin({ onBack }: { onBack: () => void }) {
  const { admin, account } = useAccount()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('todos')
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([admin.stats(), admin.users(search)])
      setStats(s)
      setUsers(u)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui carregar o painel.')
    }
  }, [admin, search])

  useEffect(() => {
    const t = window.setTimeout(() => void load(), search ? 250 : 0)
    return () => window.clearTimeout(t)
  }, [load, search])

  const shown = useMemo(() => (users ?? []).filter((u) => matches(u, filter)), [users, filter])

  if (!account?.isAdmin) return (
    <div className="studio-page"><AppBar title="Painel" onBack={onBack} /><div className="app"><p className="error">Você não tem permissão para ver o painel.</p></div></div>
  )

  const card = (label: string, value: string | number, hint?: string) => (
    <div className="stat" key={label}><span>{label}</span><b>{value}</b>{hint && <small>{hint}</small>}</div>
  )

  return (
    <div className="studio-page">
      <AppBar title="Painel de gestão" onBack={onBack} />
      <div className="app tool-page admin">
        <header className="top">
          <h1>Painel de gestão</h1>
          <p>Cadastros e pagamentos entram sozinhos. Use o painel só para ajustes manuais.</p>
        </header>
        {account.demo && <p className="notice" role="status">Demonstração: usuárias de mentira, guardadas só neste navegador.</p>}
        {error && <p className="error" role="alert">{error}</p>}

        {stats && (
          <section className="stats" aria-label="Resumo">
            {card('Usuárias', stats.users, `${stats.newThisWeek} nesta semana`)}
            {card('Plus', stats.plus)}
            {card('Básico', stats.basic)}
            {card('Sem plano', stats.withoutPlan)}
            {card('Vencem em 7 dias', stats.expiringSoon)}
            {card('Recebido em 30 dias', formatCents(stats.revenue30dCents))}
          </section>
        )}

        <section className="card">
          <label className="field">
            <span>Buscar por nome, e-mail ou telefone</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ex.: marina" />
          </label>
          <div className="chips" role="group" aria-label="Filtro">
            {FILTERS.map(([k, label]) => (
              <button key={k} className={`chip${filter === k ? ' chip--on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
            ))}
          </div>
          <p className="hint">{users === null ? 'Carregando…' : `${shown.length} de ${users.length} usuárias`}</p>

          <ul className="users">
            {shown.map((u) => {
              const st = statusOf(u)
              const isOpen = open === u.id
              return (
                <li key={u.id} className={`user${isOpen ? ' user--open' : ''}`}>
                  <button className="user__head" onClick={() => setOpen(isOpen ? null : u.id)} aria-expanded={isOpen}>
                    <span className="user__avatar" aria-hidden>{(u.name || u.email || '?').trim().charAt(0).toUpperCase()}</span>
                    <span className="user__main">
                      <b>{u.name || 'Sem nome'}</b>
                      <small>{contact(u)}</small>
                      <span className="user__meta">
                        {u.effective !== 'none' && <em className={`tag tag--${u.effective}`}>{PLAN_LABEL[u.effective]}</em>}
                        <em className={`tag tag--${st.kind}`}>{st.label}</em>
                        {u.coupon && <em className="tag tag--ok">🎟 {u.coupon}</em>}
                        {u.isAdmin && <em className="tag tag--plus">Gestão</em>}
                      </span>
                    </span>
                    <span className="user__chev" aria-hidden>{isOpen ? '▴' : '▾'}</span>
                  </button>
                  {isOpen && (
                    <>
                      <p className="hint">Cadastro em {fmt(u.createdAt)} · vence em {fmt(u.expiresAt)} · imagens no mês: {u.imagesUsed} · bônus: {u.bonusImages} · último pagamento: {fmt(u.lastPaymentAt)}{u.method ? ` · ${u.method === 'manual' ? 'manual' : u.method === 'pix' ? 'Pix' : 'cartão'}` : ''}</p>
                      <UserEditor key={`${u.id}-${u.plan}-${u.expiresAt}-${u.blocked}-${u.note}-${u.bonusImages}`} u={u} onSaved={() => void load()} />
                    </>
                  )}
                </li>
              )
            })}
          </ul>
          {users && shown.length === 0 && <p className="hint">Ninguém encontrado.</p>}
        </section>

        <Coupons />
        <Chatbot />
        <Banco />
        <Settings />
        <Audit />
      </div>
    </div>
  )
}
