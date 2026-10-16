import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount } from '../billing/AccountProvider'
import type { AdminPayment, AdminStats, AdminUser, AuditEntry } from '../billing/adminStore'
import { DEFAULT_PRICES, daysLeft, formatCents, PLAN_LABEL, type Plan, type Prices } from '../billing/plans'
import { AppBar } from '../components/AppBar'
import { NumberField } from '../components/NumberField'

type Filter = 'todos' | 'ativos' | 'vencendo' | 'sem' | 'bloqueados'
const FILTERS: Array<[Filter, string]> = [['todos', 'Todos'], ['ativos', 'Ativos'], ['vencendo', 'Vencem em 7 dias'], ['sem', 'Sem plano'], ['bloqueados', 'Desativados']]

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
  return true
}

function statusOf(u: AdminUser): { label: string; kind: 'ok' | 'warn' | 'off' } {
  if (u.blocked) return { label: 'Desativada', kind: 'off' }
  if (u.effective === 'none') return { label: u.plan === 'none' ? 'Sem plano' : 'Vencida', kind: u.plan === 'none' ? 'off' : 'warn' }
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
      <label className="field">
        <span>Anotação (só você vê)</span>
        <textarea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </label>
      {msg && <p className={msg.kind === 'ok' ? 'ok' : 'error'} role={msg.kind === 'ok' ? 'status' : 'alert'}>{msg.text}</p>}
      <button className="btn btn--primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Salvando…' : 'Salvar alterações'}</button>

      <h4 className="editor-user__h">Pagamentos</h4>
      {payments === null ? <p className="hint">Carregando…</p> : payments.length === 0 ? <p className="hint">Nenhum pagamento registrado.</p> : (
        <ul className="paylist">
          {payments.map((p) => (
            <li key={p.id}>
              <span>{fmt(p.paidAt)} · {PLAN_LABEL[p.plan]} {p.cycle === 'yearly' ? 'anual' : 'mensal'} · {p.method === 'pix' ? 'Pix' : 'Cartão'}</span>
              <b>{formatCents(p.amountCents)}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
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
      await admin.updateSettings({ ...p, basicMonthlyCents: Math.max(1, p.basicMonthlyCents), plusMonthlyCents: Math.max(1, p.plusMonthlyCents), yearlyFreeMonths: Math.min(11, p.yearlyFreeMonths), basicImageLimit: Math.max(1, p.basicImageLimit) })
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
          <p className="hint">Anual: {formatCents(p.basicMonthlyCents * (12 - p.yearlyFreeMonths))} no Básico e {formatCents(p.plusMonthlyCents * (12 - p.yearlyFreeMonths))} no Plus.</p>
          {msg && <p className="hint" role="status">{msg}</p>}
          <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar preços'}</button>
        </>
      )}
    </details>
  )
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
              <span>{new Date(r.createdAt).toLocaleString('pt-BR')} · {r.action === 'update_settings' ? 'Preços e limites' : 'Usuária editada'}</span>
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
                    <span className="user__main">
                      <b>{u.name || 'Sem nome'}</b>
                      <small>{contact(u)}</small>
                    </span>
                    <span className="user__meta">
                      <em className={`pill pill--${u.effective}`}>{PLAN_LABEL[u.effective]}</em>
                      <em className={`pill pill--${st.kind}`}>{st.label}</em>
                    </span>
                  </button>
                  {isOpen && (
                    <>
                      <p className="hint">Cadastro em {fmt(u.createdAt)} · vence em {fmt(u.expiresAt)} · imagens no mês: {u.imagesUsed} · último pagamento: {fmt(u.lastPaymentAt)}{u.method ? ` · ${u.method === 'manual' ? 'manual' : u.method === 'pix' ? 'Pix' : 'cartão'}` : ''}</p>
                      <UserEditor key={`${u.id}-${u.plan}-${u.expiresAt}-${u.blocked}`} u={u} onSaved={() => void load()} />
                    </>
                  )}
                </li>
              )
            })}
          </ul>
          {users && shown.length === 0 && <p className="hint">Ninguém encontrado.</p>}
        </section>

        <Settings />
        <Audit />
      </div>
    </div>
  )
}
