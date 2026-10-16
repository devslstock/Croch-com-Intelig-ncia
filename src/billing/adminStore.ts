import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_PRICES, effectivePlan, type Cycle, type PaidPlan, type Plan, type Prices } from './plans'
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
  /** Gráficos de presente que ainda restam. */
  bonusImages: number
  /** Código do cupom ligado à conta. */
  coupon: string | null
  createdAt: string
  lastPaymentAt: string | null
}

export interface AdminCoupon {
  id: string
  code: string
  description: string
  kind: 'percent' | 'fixed'
  value: number
  plans: PaidPlan[]
  cycles: 'both' | Cycle
  maxUses: number | null
  expiresAt: string | null
  active: boolean
  createdAt: string
  /** Pessoas que já pagaram com o cupom. */
  uses: number
  /** Contas com o cupom ligado. */
  attached: number
}

/** Campos editáveis de um cupom (sem `id` = cupom novo). */
export type CouponInput = Omit<AdminCoupon, 'id' | 'createdAt' | 'uses' | 'attached'> & { id?: string }

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
  coupon?: string | null
  discountCents?: number
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
  coupons(): Promise<AdminCoupon[]>
  saveCoupon(c: CouponInput): Promise<void>
  deleteCoupon(id: string): Promise<void>
  setBonus(userId: string, bonus: number): Promise<void>
}

export const COUPON_FORM_ERRORS: Record<string, string> = {
  codigo_invalido: 'O código deve ter de 3 a 32 letras, números, - ou _ (sem espaços).',
  desconto_invalido: 'Desconto inválido: em % use de 1 a 99; em reais, mais que zero.',
  cupom_em_uso: 'Esse cupom já foi usado em pagamentos. Desative-o em vez de apagar.',
  cupom_inexistente: 'Cupom não encontrado.',
  bonus_invalido: 'A quantidade de bônus deve ser de 0 a 10.000.',
}

const must = <T>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) {
    const msg = r.error.message
    const known = Object.keys(COUPON_FORM_ERRORS).find((k) => msg.includes(k))
    if (known) throw new Error(COUPON_FORM_ERRORS[known])
    if (/duplicate key|coupons_code_key/.test(msg)) throw new Error('Já existe um cupom com esse código.')
    throw new Error(msg.includes('sem_permissao') ? 'Você não tem permissão para o painel.' : 'Não foi possível concluir. Tente de novo.')
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
        signupBonusImages: data.signup_bonus_images ?? 0,
      }
    },
    async updateSettings(p) {
      must(await client.rpc('admin_update_settings', {
        p_basic_cents: p.basicMonthlyCents, p_plus_cents: p.plusMonthlyCents, p_free_months: p.yearlyFreeMonths,
        p_image_limit: p.basicImageLimit, p_grace_days: p.graceDays, p_signup_bonus: p.signupBonusImages,
      }))
    },
    async audit() {
      return must(await client.rpc('admin_audit_list', { p_limit: 30 })) as AuditEntry[]
    },
    async coupons() {
      return must(await client.rpc('admin_list_coupons')) as AdminCoupon[]
    },
    async saveCoupon(c) {
      must(await client.rpc('admin_save_coupon', {
        p_id: c.id ?? null, p_code: c.code, p_description: c.description, p_kind: c.kind, p_value: c.value,
        p_plans: c.plans, p_cycles: c.cycles, p_max_uses: c.maxUses, p_expires: c.expiresAt, p_active: c.active,
      }))
    },
    async deleteCoupon(id) {
      must(await client.rpc('admin_delete_coupon', { p_id: id }))
    },
    async setBonus(userId, bonus) {
      must(await client.rpc('admin_set_bonus', { p_user: userId, p_bonus: bonus }))
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
  coupons: AdminCoupon[]
}

export const DEMO_ADMIN_KEY = 'tramado:demo:admin'
const day = 86_400_000

export function seedDemoAdmin(now: Date): DemoAdmin {
  const iso = (offsetDays: number) => new Date(now.getTime() + offsetDays * day).toISOString()
  const mk = (id: string, name: string, over: Partial<AdminUser>): AdminUser => ({
    id, name, email: `${name.split(' ')[0].toLowerCase()}@exemplo.com`, phone: null, plan: 'none', effective: 'none', expiresAt: null,
    blocked: false, cycle: null, method: null, isAdmin: false, note: '', imagesUsed: 0, bonusImages: 0, coupon: null, createdAt: iso(-20), lastPaymentAt: null, ...over,
  })
  const users: AdminUser[] = [
    mk('d1', 'Marina Alves', { plan: 'plus', cycle: 'monthly', method: 'card', expiresAt: iso(18), imagesUsed: 31, createdAt: iso(-80), lastPaymentAt: iso(-12) }),
    mk('d2', 'Joana Lima', { plan: 'basic', cycle: 'monthly', method: 'pix', expiresAt: iso(4), imagesUsed: 12, createdAt: iso(-45), lastPaymentAt: iso(-26) }),
    mk('d3', 'Paula Souza', { plan: 'basic', cycle: 'yearly', method: 'card', expiresAt: iso(250), imagesUsed: 5, createdAt: iso(-115), lastPaymentAt: iso(-115) }),
    mk('d4', 'Rita Campos', { plan: 'plus', cycle: 'yearly', method: 'pix', expiresAt: iso(-9), createdAt: iso(-380), lastPaymentAt: iso(-374) }),
    mk('d5', 'Bia Torres', { createdAt: iso(-2), email: null, phone: '+5581999990000' }),
    mk('d6', 'Lúcia Prado', { plan: 'plus', method: 'manual', note: 'Cortesia: parceira do ateliê', createdAt: iso(-60) }),
    mk('d8', 'Nina Rocha', { bonusImages: 3, coupon: 'BEMVINDA10', note: 'Cupom usado: BEMVINDA10', createdAt: iso(-1) }),
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
    coupons: [
      { id: 'c1', code: 'BEMVINDA10', description: 'Boas-vindas', kind: 'percent', value: 10, plans: ['basic', 'plus'], cycles: 'both', maxUses: null, expiresAt: null, active: true, createdAt: iso(-30), uses: 0, attached: 1 },
    ],
  }
}

export function localAdminStore(storage: StorageLike, now: () => Date = () => new Date()): AdminStore {
  const read = (): DemoAdmin => {
    const saved = readJson<Partial<DemoAdmin>>(storage, DEMO_ADMIN_KEY, {})
    // Dados salvos antes dos cupons/bônus não têm esses campos: completa com valores neutros.
    return saved.users
      ? ({
          ...saved,
          coupons: saved.coupons ?? seedDemoAdmin(now()).coupons,
          prices: { ...DEFAULT_PRICES, ...saved.prices },
          users: saved.users.map((u) => ({ ...u, bonusImages: u.bonusImages ?? 0, coupon: u.coupon ?? null })),
        } as DemoAdmin)
      : seedDemoAdmin(now())
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
    async coupons() {
      const d = read()
      const attached = (code: string) => d.users.filter((u) => u.coupon === code).length
      return d.coupons.map((c) => ({ ...c, attached: Math.max(attached(c.code), c.attached ?? 0) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    async saveCoupon(c) {
      const d = read()
      const code = c.code.trim().toUpperCase()
      if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new Error(COUPON_FORM_ERRORS.codigo_invalido)
      if (!Number.isInteger(c.value) || c.value < 1 || (c.kind === 'percent' && c.value > 99)) throw new Error(COUPON_FORM_ERRORS.desconto_invalido)
      if (d.coupons.some((x) => x.code === code && x.id !== c.id)) throw new Error('Já existe um cupom com esse código.')
      const base = { code, description: c.description.slice(0, 120), kind: c.kind, value: c.value, plans: c.plans, cycles: c.cycles, maxUses: c.maxUses, expiresAt: c.expiresAt, active: c.active }
      const old = c.id ? d.coupons.find((x) => x.id === c.id) : undefined
      if (old) Object.assign(old, base)
      else d.coupons.unshift({ ...base, id: `c${Date.now()}`, createdAt: now().toISOString(), uses: 0, attached: 0 })
      d.audit.unshift({ id: Date.now(), action: 'save_coupon', userId: null, createdAt: now().toISOString(), detail: { code, kind: c.kind, value: c.value, active: c.active } })
      write(d)
    },
    async deleteCoupon(id) {
      const d = read()
      const c = d.coupons.find((x) => x.id === id)
      if (!c) throw new Error(COUPON_FORM_ERRORS.cupom_inexistente)
      if (c.uses > 0) throw new Error(COUPON_FORM_ERRORS.cupom_em_uso)
      d.coupons = d.coupons.filter((x) => x.id !== id)
      d.audit.unshift({ id: Date.now(), action: 'delete_coupon', userId: null, createdAt: now().toISOString(), detail: { code: c.code } })
      write(d)
    },
    async setBonus(userId, bonus) {
      if (!Number.isInteger(bonus) || bonus < 0 || bonus > 10000) throw new Error(COUPON_FORM_ERRORS.bonus_invalido)
      const d = read()
      const u = d.users.find((x) => x.id === userId)
      if (!u) throw new Error('Usuária não encontrada.')
      u.bonusImages = bonus
      d.audit.unshift({ id: Date.now(), action: 'set_bonus', userId, createdAt: now().toISOString(), detail: { after: bonus } })
      write(d)
    },
  }
}
