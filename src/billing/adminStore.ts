import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_PRICES, effectivePlan, type Cycle, type PaidPlan, type Plan, type Prices } from './plans'
import { DEFAULT_CONFIG, DEFAULT_ITEMS, type ChatConfig } from '../landing/chatbot'
import { readJson, type StorageLike } from '../tools/storage'

export interface AdminUser {
  id: string
  name: string
  email: string | null
  phone: string | null
  plan: Plan
  effective: Plan
  expiresAt: string | null
  /** Fim do período grátis, quando é ele que dá acesso agora. */
  trialEndsAt?: string | null
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

/** Pergunta do chatbot como o painel enxerga (inclui pausadas e a ordem). */
export interface AdminChatItem {
  id: string
  question: string
  answer: string
  keywords: string
  sort: number
  active: boolean
}

export type ChatItemInput = Omit<AdminChatItem, 'id'> & { id?: string }

export interface AdminChatbot {
  config: ChatConfig
  items: AdminChatItem[]
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

/** O que o painel vê das credenciais do Mercado Pago: nunca o valor inteiro, só se existe e os 4 últimos caracteres. */
export interface PaymentSide {
  hasToken: boolean
  tokenHint: string
  hasSecret: boolean
  secretHint: string
}

export type PaymentMode = 'test' | 'production'

export interface PaymentConfig {
  mode: PaymentMode
  updatedAt: string | null
  test: PaymentSide
  production: PaymentSide
}

/** Campo vazio = mantém o que já está salvo. */
export interface PaymentConfigInput {
  mode: PaymentMode
  testToken: string
  testSecret: string
  prodToken: string
  prodSecret: string
}

export interface PaymentCheck {
  ok: boolean
  mode: PaymentMode
  error?: 'sem_token' | 'token_recusado' | 'mp_indisponivel' | 'demo'
  hasWebhookSecret?: boolean
  account?: { id: number | string | null; nickname: string | null; siteId: string | null }
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
  chatbot(): Promise<AdminChatbot>
  saveChatItem(i: ChatItemInput): Promise<void>
  deleteChatItem(id: string): Promise<void>
  saveChatConfig(c: ChatConfig): Promise<void>
  paymentConfig(): Promise<PaymentConfig>
  savePaymentConfig(i: PaymentConfigInput): Promise<void>
  checkPayment(): Promise<PaymentCheck>
}

export const ADMIN_ERRORS: Record<string, string> = {
  codigo_invalido: 'O código deve ter de 3 a 32 letras, números, - ou _ (sem espaços).',
  desconto_invalido: 'Desconto inválido: em % use de 1 a 99; em reais, mais que zero.',
  cupom_em_uso: 'Esse cupom já foi usado em pagamentos. Desative-o em vez de apagar.',
  cupom_inexistente: 'Cupom não encontrado.',
  bonus_invalido: 'A quantidade de bônus deve ser de 0 a 10.000.',
  pergunta_invalida: 'A pergunta deve ter de 3 a 120 caracteres.',
  resposta_invalida: 'A resposta deve ter de 1 a 1.200 caracteres.',
  texto_invalido: 'As mensagens de boas-vindas e de "não achei" devem ter de 1 a 300 caracteres.',
  whatsapp_invalido: 'O WhatsApp deve ter de 10 a 15 números, com DDI e DDD (ex.: 5581999990000).',
  item_inexistente: 'Pergunta não encontrada.',
  modo_invalido: 'Escolha teste ou produção.',
  token_invalido: 'O Access Token parece inválido: copie o valor inteiro, sem espaços (ele tem de 20 a 255 caracteres).',
  segredo_invalido: 'A assinatura secreta do webhook deve ter de 8 a 200 caracteres, sem espaços.',
  faltam_credenciais_producao: 'Para usar produção, preencha o Access Token e a assinatura secreta de produção.',
  faltam_credenciais_teste: 'Para usar teste, preencha o Access Token e a assinatura secreta de teste.',
}

const must = <T>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) {
    const msg = r.error.message
    const known = Object.keys(ADMIN_ERRORS).find((k) => msg.includes(k))
    if (known) throw new Error(ADMIN_ERRORS[known])
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
        trialDays: data.trial_days ?? 0,
      }
    },
    async updateSettings(p) {
      must(await client.rpc('admin_update_settings', {
        p_basic_cents: p.basicMonthlyCents, p_plus_cents: p.plusMonthlyCents, p_free_months: p.yearlyFreeMonths,
        p_image_limit: p.basicImageLimit, p_grace_days: p.graceDays, p_signup_bonus: p.signupBonusImages, p_trial_days: p.trialDays,
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
    async chatbot() {
      return must(await client.rpc('admin_list_chatbot')) as AdminChatbot
    },
    async saveChatItem(i) {
      must(await client.rpc('admin_save_chatbot_item', {
        p_id: i.id ?? null, p_question: i.question, p_answer: i.answer, p_keywords: i.keywords, p_sort: i.sort, p_active: i.active,
      }))
    },
    async deleteChatItem(id) {
      must(await client.rpc('admin_delete_chatbot_item', { p_id: id }))
    },
    async saveChatConfig(c) {
      must(await client.rpc('admin_save_chatbot_config', { p_greeting: c.greeting, p_fallback: c.fallback, p_whatsapp: c.whatsapp }))
    },
    async paymentConfig() {
      return must(await client.rpc('admin_payment_config')) as PaymentConfig
    },
    async savePaymentConfig(i) {
      must(await client.rpc('admin_save_payment_config', {
        p_mode: i.mode, p_test_token: i.testToken, p_test_secret: i.testSecret, p_prod_token: i.prodToken, p_prod_secret: i.prodSecret,
      }))
    },
    async checkPayment() {
      const { data, error } = await client.functions.invoke('mp-check')
      if (error || !data) throw new Error('Não consegui testar agora. Tente de novo em instantes.')
      return data as PaymentCheck
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
  chatbot: AdminChatbot
  payment?: PaymentConfig
}

const emptySide = (): PaymentSide => ({ hasToken: false, tokenHint: '', hasSecret: false, secretHint: '' })
const seedPayment = (): PaymentConfig => ({ mode: 'test', updatedAt: null, test: emptySide(), production: emptySide() })

const seedChatbot = (): AdminChatbot => ({
  config: { ...DEFAULT_CONFIG },
  items: DEFAULT_ITEMS.map((i, n) => ({ ...i, sort: (n + 1) * 10, active: true })),
})

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
    chatbot: seedChatbot(),
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
          chatbot: saved.chatbot ?? seedChatbot(),
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
      if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new Error(ADMIN_ERRORS.codigo_invalido)
      if (!Number.isInteger(c.value) || c.value < 1 || (c.kind === 'percent' && c.value > 99)) throw new Error(ADMIN_ERRORS.desconto_invalido)
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
      if (!c) throw new Error(ADMIN_ERRORS.cupom_inexistente)
      if (c.uses > 0) throw new Error(ADMIN_ERRORS.cupom_em_uso)
      d.coupons = d.coupons.filter((x) => x.id !== id)
      d.audit.unshift({ id: Date.now(), action: 'delete_coupon', userId: null, createdAt: now().toISOString(), detail: { code: c.code } })
      write(d)
    },
    async chatbot() {
      const c = read().chatbot
      return { config: c.config, items: [...c.items].sort((a, b) => a.sort - b.sort) }
    },
    async saveChatItem(i) {
      const d = read()
      const question = i.question.trim()
      const answer = i.answer.trim()
      if (question.length < 3 || question.length > 120) throw new Error(ADMIN_ERRORS.pergunta_invalida)
      if (answer.length < 1 || answer.length > 1200) throw new Error(ADMIN_ERRORS.resposta_invalida)
      const base = { question, answer, keywords: i.keywords.slice(0, 300), sort: i.sort, active: i.active }
      const old = i.id ? d.chatbot.items.find((x) => x.id === i.id) : undefined
      if (i.id && !old) throw new Error(ADMIN_ERRORS.item_inexistente)
      if (old) Object.assign(old, base)
      else d.chatbot.items.push({ ...base, id: `q${Date.now()}` })
      d.audit.unshift({ id: Date.now(), action: 'save_chatbot_item', userId: null, createdAt: now().toISOString(), detail: { question: question.slice(0, 80), active: i.active } })
      write(d)
    },
    async deleteChatItem(id) {
      const d = read()
      const q = d.chatbot.items.find((x) => x.id === id)
      if (!q) throw new Error(ADMIN_ERRORS.item_inexistente)
      d.chatbot.items = d.chatbot.items.filter((x) => x.id !== id)
      d.audit.unshift({ id: Date.now(), action: 'delete_chatbot_item', userId: null, createdAt: now().toISOString(), detail: { question: q.question.slice(0, 80) } })
      write(d)
    },
    async saveChatConfig(c) {
      const wa = c.whatsapp.replace(/\D/g, '')
      if (!c.greeting.trim() || c.greeting.length > 300 || !c.fallback.trim() || c.fallback.length > 300) throw new Error(ADMIN_ERRORS.texto_invalido)
      if (wa && !/^[0-9]{10,15}$/.test(wa)) throw new Error(ADMIN_ERRORS.whatsapp_invalido)
      const d = read()
      d.chatbot.config = { greeting: c.greeting.trim(), fallback: c.fallback.trim(), whatsapp: wa }
      d.audit.unshift({ id: Date.now(), action: 'save_chatbot_config', userId: null, createdAt: now().toISOString(), detail: { whatsapp: wa !== '' } })
      write(d)
    },
    async paymentConfig() {
      return read().payment ?? seedPayment()
    },
    async savePaymentConfig(i) {
      if (i.mode !== 'test' && i.mode !== 'production') throw new Error(ADMIN_ERRORS.modo_invalido)
      const tok = (v: string) => v.trim()
      const badToken = (v: string) => v !== '' && !/^[A-Za-z0-9_-]{20,255}$/.test(v)
      const badSecret = (v: string) => v !== '' && !/^\S{8,200}$/.test(v)
      const [tt, ts, pt, ps] = [tok(i.testToken), tok(i.testSecret), tok(i.prodToken), tok(i.prodSecret)]
      if (badToken(tt) || badToken(pt)) throw new Error(ADMIN_ERRORS.token_invalido)
      if (badSecret(ts) || badSecret(ps)) throw new Error(ADMIN_ERRORS.segredo_invalido)
      const d = read()
      const cur = d.payment ?? seedPayment()
      // Na demonstração só guardamos "tem / não tem" e os 4 últimos caracteres, nunca o valor.
      const side = (old: PaymentSide, token: string, secret: string): PaymentSide => ({
        hasToken: token !== '' || old.hasToken, tokenHint: token !== '' ? token.slice(-4) : old.tokenHint,
        hasSecret: secret !== '' || old.hasSecret, secretHint: secret !== '' ? secret.slice(-4) : old.secretHint,
      })
      const next: PaymentConfig = { mode: i.mode, updatedAt: now().toISOString(), test: side(cur.test, tt, ts), production: side(cur.production, pt, ps) }
      const chosen = i.mode === 'production' ? next.production : next.test
      if (!chosen.hasToken || !chosen.hasSecret) throw new Error(i.mode === 'production' ? ADMIN_ERRORS.faltam_credenciais_producao : ADMIN_ERRORS.faltam_credenciais_teste)
      const changed = [tt && 'test_token', ts && 'test_secret', pt && 'prod_token', ps && 'prod_secret', i.mode !== cur.mode && 'mode'].filter(Boolean)
      d.payment = next
      d.audit.unshift({ id: Date.now(), action: 'save_payment_config', userId: null, createdAt: now().toISOString(), detail: { mode: i.mode, changed } })
      write(d)
    },
    async checkPayment() {
      const c = read().payment ?? seedPayment()
      return { ok: false, mode: c.mode, error: 'demo' }
    },
    async setBonus(userId, bonus) {
      if (!Number.isInteger(bonus) || bonus < 0 || bonus > 10000) throw new Error(ADMIN_ERRORS.bonus_invalido)
      const d = read()
      const u = d.users.find((x) => x.id === userId)
      if (!u) throw new Error('Usuária não encontrada.')
      u.bonusImages = bonus
      d.audit.unshift({ id: Date.now(), action: 'set_bonus', userId, createdAt: now().toISOString(), detail: { after: bonus } })
      write(d)
    },
  }
}
