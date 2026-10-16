import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_PRICES, effectivePlan, type Cycle, type Plan, type Prices } from './plans'
import { readJson, type StorageLike } from '../tools/storage'

export interface AdminUser {
  id: string
  name: string
  email: string | null
  phone: string | null
  plan: Plan
  effective: Plan
  expiresAt: string | null
  blocked: boolean
  cycle: Cycle | null
  method: 'card' | 'pix' | 'manual' | null
  isAdmin: boolean
  note: string
  imagesUsed: number
  createdAt: string
  lastPaymentAt: string | null
}

export interface AdminStats {
  users: number
  basic: number
  plus: number
  withoutPlan: number
  blocked: number
  expiringSoon: number
  newThisWeek: number
  revenue30dCents: number
}

export interface AdminPayment {
  id: string
  plan: 'basic' | 'plus'
  cycle: Cycle
  method: 'card' | 'pix'
  amountCents: number
  paidAt: string
  periodEnd: string | null
}

export interface AuditEntry {
  id: number
  action: string
  userId: string | null
  detail: Record<string, unknown>
  createdAt: string
}

/** O que o painel pode ajustar à mão. `expiresAt: null` = sem vencimento (cortesia). */
export interface UserPatch {
  plan: Plan
  expiresAt: string | null
  blocked: boolean
  note: string
}

export interface AdminStore {
  stats(): Promise<AdminStats>
  users(search?: string): Promise<AdminUser[]>
  payments(userId: string): Promise<AdminPayment[]>
  update(userId: string, patch: UserPatch): Promise<void>
  settings(): Promise<Prices>
  updateSettings(p: Prices): Promise<void>
  audit(): Promise<AuditEntry[]>
}

const must = <T>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) {
    throw new Error(r.error.message.includes('sem_permissao') ? 'Você não tem permissão para o painel.' : 'Não foi possível concluir. Tente de novo.')
  }
  return (r.data ?? ([] as unknown)) as T
}

export function supabaseAdminStore(client: SupabaseClient): AdminStore {
  return {
    async stats() {
      return must(await client.rpc('admin_stats')) as AdminStats
    },
    async users(search) {
      return must(await client.rpc('admin_list_users', { p_search: search?.trim() || null, p_limit: 300 })) as AdminUser[]
    },
    async payments(userId) {
      return must(await client.rpc('admin_payments', { p_user: userId })) as AdminPayment[]
    },
    async update(userId, patch) {
      must(await client.rpc('admin_update_user', { p_user: userId, p_plan: patch.plan, p_expires: patch.expiresAt, p_blocked: patch.blocked, p_note: patch.note }))
    },
    async settings() {
      const { data, error } = await client.from('app_settings').select('*').single()
      if (error || !data) throw new Error('Não consegui carregar os preços.')
      return {
        basicMonthlyCents: data.basic_monthly_cents,
        plusMonthlyCents: data.plus_monthly_cents,
        yearlyFreeMonths: data.yearly_free_months,
        basicImageLimit: data.basic_image_limit,
        graceDays: data.grace_days,
      }
    },
    async updateSettings(p) {
      must(await client.rpc('admin_update_settings', {
        p_basic_cents: p.basicMonthlyCents, p_plus_cents: p.plusMonthlyCents, p_free_months: p.yearlyFreeMonths,
        p_image_limit: p.basicImageLimit, p_grace_days: p.graceDays,
      }))
    },
    async audit() {
      return must(await client.rpc('admin_audit_list', { p_limit: 30 })) as AuditEntry[]
    },
  }
}

// ---------------------------------------------------------------------------
// Demonstração: usuárias de mentira, guardadas no navegador, para testar o painel.
// ---------------------------------------------------------------------------
interface DemoAdmin {
  users: AdminUser[]
  payments: Record<string, AdminPayment[]>
  prices: Prices
  audit: AuditEntry[]
}

export const DEMO_ADMIN_KEY = 'tramado:demo:admin'
const day = 86_400_000

export function seedDemoAdmin(now: Date): DemoAdmin {
  const iso = (offsetDays: number) => new Date(now.getTime() + offsetDays * day).toISOString()
  const mk = (id: string, name: string, over: Partial<AdminUser>): AdminUser => ({
    id, name, email: `${name.split(' ')[0].toLowerCase()}@exemplo.com`, phone: null, plan: 'none', effective: 'none', expiresAt: null,
    blocked: false, cycle: null, method: null, isAdmin: false, note: '', imagesUsed: 0, createdAt: iso(-20), lastPaymentAt: null, ...over,
  })
  const users: AdminUser[] = [
    mk('d1', 'Marina Alves', { plan: 'plus', cycle: 'monthly', method: 'card', expiresAt: iso(18), imagesUsed: 31, createdAt: iso(-80), lastPaymentAt: iso(-12) }),
    mk('d2', 'Joana Lima', { plan: 'basic', cycle: 'monthly', method: 'pix', expiresAt: iso(4), imagesUsed: 12, createdAt: iso(-45), lastPaymentAt: iso(-26) }),
    mk('d3', 'Paula Souza', { plan: 'basic', cycle: 'yearly', method: 'card', expiresAt: iso(250), imagesUsed: 5, createdAt: iso(-115), lastPaymentAt: iso(-115) }),
    mk('d4', 'Rita Campos', { plan: 'plus', cycle: 'yearly', method: 'pix', expiresAt: iso(-9), createdAt: iso(-380), lastPaymentAt: iso(-374) }),
    mk('d5', 'Bia Torres', { createdAt: iso(-2), email: null, phone: '+5581999990000' }),
    mk('d6', 'Lúcia Prado', { plan: 'plus', method: 'manual', note: 'Cortesia: parceira do ateliê', createdAt: iso(-60) }),
    mk('d7', 'Carol Nunes', { plan: 'basic', cycle: 'monthly', method: 'card', expiresAt: iso(10), blocked: true, note: 'Chargeback em análise', createdAt: iso(-30), lastPaymentAt: iso(-20) }),
  ]
  const prices = DEFAULT_PRICES
  const pay = (plan: 'basic' | 'plus', cycle: Cycle, method: 'card' | 'pix', paidAgo: number, end: number): AdminPayment => ({
    id: `p${paidAgo}${plan}`, plan, cycle, method,
    amountCents: (plan === 'basic' ? prices.basicMonthlyCents : prices.plusMonthlyCents) * (cycle === 'yearly' ? 12 - prices.yearlyFreeMonths : 1),
    paidAt: iso(-paidAgo), periodEnd: iso(end),
  })
  return {
    users: users.map((u) => ({ ...u, effective: effectivePlan(u.plan, u.blocked, u.expiresAt, prices.graceDays, now) })),
    payments: {
      d1: [pay('plus', 'monthly', 'card', 12, 18), pay('plus', 'monthly', 'card', 42, -12)],
      d2: [pay('basic', 'monthly', 'pix', 26, 4)],
      d3: [pay('basic', 'yearly', 'card', 115, 250)],
      d4: [pay('plus', 'yearly', 'pix', 374, -9)],
      d7: [pay('basic', 'monthly', 'card', 20, 10)],
    },
    prices,
    audit: [],
  }
}

export function localAdminStore(storage: StorageLike, now: () => Date = () => new Date()): AdminStore {
  const read = (): DemoAdmin => {
    const saved = readJson<Partial<DemoAdmin>>(storage, DEMO_ADMIN_KEY, {})
    return saved.users ? (saved as DemoAdmin) : seedDemoAdmin(now())
  }
  const write = (d: DemoAdmin) => {
    try {
      storage.setItem(DEMO_ADMIN_KEY, JSON.stringify(d))
    } catch {
      /* sem armazenamento */
    }
  }
  const refresh = (d: DemoAdmin): AdminUser[] =>
    d.users.map((u) => ({ ...u, effective: effectivePlan(u.plan, u.blocked, u.expiresAt, d.prices.graceDays, now()) }))

  return {
    async stats() {
      const us = refresh(read())
      const d = read()
      const t = now().getTime()
      const cents = Object.values(d.payments).flat().filter((p) => t - new Date(p.paidAt).getTime() < 30 * day).reduce((s, p) => s + p.amountCents, 0)
      return {
        users: us.length,
        basic: us.filter((u) => u.effective === 'basic').length,
        plus: us.filter((u) => u.effective === 'plus').length,
        withoutPlan: us.filter((u) => u.effective === 'none' && !u.blocked).length,
        blocked: us.filter((u) => u.blocked).length,
        expiringSoon: us.filter((u) => u.effective !== 'none' && u.expiresAt && new Date(u.expiresAt).getTime() < t + 7 * day).length,
        newThisWeek: us.filter((u) => t - new Date(u.createdAt).getTime() < 7 * day).length,
        revenue30dCents: cents,
      }
    },
    async users(search) {
      const q = (search ?? '').trim().toLowerCase()
      return refresh(read())
        .filter((u) => !q || [u.name, u.email, u.phone].some((x) => (x ?? '').toLowerCase().includes(q)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    async payments(userId) {
      return read().payments[userId] ?? []
    },
    async update(userId, patch) {
      const d = read()
      const old = d.users.find((u) => u.id === userId)
      if (!old) throw new Error('Usuária não encontrada.')
      const changed = patch.plan !== old.plan || patch.expiresAt !== old.expiresAt
      Object.assign(old, { plan: patch.plan, expiresAt: patch.expiresAt, blocked: patch.blocked, note: patch.note, method: changed ? 'manual' : old.method })
      d.audit.unshift({
        id: Date.now(), action: 'update_user', userId, createdAt: now().toISOString(),
        detail: { after: { plan: patch.plan, expiresAt: patch.expiresAt, blocked: patch.blocked } },
      })
      write(d)
    },
    async settings() {
      return read().prices
    },
    async updateSettings(p) {
      const d = read()
      d.prices = p
      d.audit.unshift({ id: Date.now(), action: 'update_settings', userId: null, createdAt: now().toISOString(), detail: { ...p } })
      write(d)
    },
    async audit() {
      return read().audit.slice(0, 30)
    },
  }
}
