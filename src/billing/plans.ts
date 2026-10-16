/** Planos, preços e regras de acesso (o servidor decide de verdade; isto só espelha para a tela). */

export type Plan = 'none' | 'basic' | 'plus'
export type PaidPlan = 'basic' | 'plus'
export type Cycle = 'monthly' | 'yearly'
export type Method = 'card' | 'pix'

export interface Prices {
  basicMonthlyCents: number
  plusMonthlyCents: number
  /** Plano anual = (12 − N) mensalidades. */
  yearlyFreeMonths: number
  basicImageLimit: number
  graceDays: number
  /** Gráficos de presente que cada conta nova recebe (funcionam mesmo sem plano). */
  signupBonusImages: number
  /** Dias de Básico grátis para cada conta nova (0 = sem período grátis). */
  trialDays: number
}

/** Valores de EXEMPLO (mesmos do banco): o painel de gestão altera os de verdade. */
export const DEFAULT_PRICES: Prices = {
  basicMonthlyCents: 1990,
  plusMonthlyCents: 3990,
  yearlyFreeMonths: 2,
  basicImageLimit: 12,
  graceDays: 3,
  signupBonusImages: 0,
  trialDays: 0,
}

/** Cupom ligado à conta (o banco decide se vale; isto só espelha para mostrar o preço). */
export interface AccountCoupon {
  code: string
  description: string
  kind: 'percent' | 'fixed'
  /** percent: 1–99 (%); fixed: centavos. */
  value: number
  plans: PaidPlan[]
  cycles: 'both' | Cycle
}

export interface Account {
  plan: Plan
  /** Plano que vale agora (já considera bloqueio, vencimento e tolerância). */
  effective: Plan
  expiresAt: string | null
  /** Fim do período grátis, quando é ele que dá acesso agora (o plano é o Básico). */
  trialEndsAt: string | null
  blocked: boolean
  cycle: Cycle | null
  method: 'card' | 'pix' | 'manual' | null
  isAdmin: boolean
  email: string | null
  imagesUsed: number
  /** Gráficos de presente que ainda restam. */
  bonusImages: number
  coupon: AccountCoupon | null
  prices: Prices
  demo?: boolean
}

export const PLAN_LABEL: Record<Plan, string> = { none: 'Sem assinatura', basic: 'Básico', plus: 'Plus' }

export const PLAN_FEATURES: Record<PaidPlan, string[]> = {
  basic: ['Foto em gráfico, Modelos, editor e modo Crochetar', 'Até {limit} imagens novas por mês', 'Lista de fios e Meus gráficos'],
  plus: ['Tudo do Básico', 'Imagens ilimitadas', 'Calculadora de preço', 'Assistente de vendas'],
}

export function monthlyCents(p: Prices, plan: PaidPlan): number {
  return plan === 'basic' ? p.basicMonthlyCents : p.plusMonthlyCents
}

export function priceCents(p: Prices, plan: PaidPlan, cycle: Cycle): number {
  const m = monthlyCents(p, plan)
  return cycle === 'yearly' ? m * (12 - p.yearlyFreeMonths) : m
}

/** Quanto se economiza pagando o ano de uma vez. */
export function yearlySavingCents(p: Prices, plan: PaidPlan): number {
  return monthlyCents(p, plan) * 12 - priceCents(p, plan, 'yearly')
}

export function effectivePlan(plan: Plan, blocked: boolean, expiresAt: string | null, graceDays: number, now: Date = new Date()): Plan {
  if (blocked || plan === 'none') return 'none'
  if (!expiresAt) return plan
  return new Date(expiresAt).getTime() + graceDays * 86_400_000 > now.getTime() ? plan : 'none'
}

/** Como effectivePlan, mas o período grátis (sem tolerância extra) vale como Básico quando não há assinatura ativa. */
export function planWithTrial(plan: Plan, blocked: boolean, expiresAt: string | null, graceDays: number, trialEndsAt: string | null | undefined, now: Date = new Date()): Plan {
  const paid = effectivePlan(plan, blocked, expiresAt, graceDays, now)
  if (paid !== 'none' || blocked) return paid
  return trialEndsAt && new Date(trialEndsAt).getTime() > now.getTime() ? 'basic' : 'none'
}

/** Está usando o período grátis (e ainda não assinou). */
export const onTrial = (a: Pick<Account, 'trialEndsAt'>) => a.trialEndsAt !== null

/** Limite de imagens novas por mês: número (Básico), null (ilimitado) ou 0 (sem assinatura). */
export function imageLimit(a: Account): number | null {
  if (a.blocked) return 0
  if (a.effective === 'plus') return null
  if (a.effective === 'basic') return a.prices.basicImageLimit
  return 0
}

/** Quantas imagens ainda dá para criar: o resto da cota do mês + os gráficos de bônus. Nulo = ilimitado. */
export function imagesLeft(a: Account): number | null {
  const lim = imageLimit(a)
  if (lim === null) return null
  if (a.blocked) return 0
  return Math.max(0, lim - a.imagesUsed) + a.bonusImages
}

/** Resto da cota mensal do plano, sem o bônus. */
export const monthlyLeft = (a: Account): number | null => {
  const lim = imageLimit(a)
  return lim === null ? null : Math.max(0, lim - a.imagesUsed)
}

/** Entra no app (fora da tela de planos): plano ativo, ou ainda tem gráficos de presente. */
export const canUseApp = (a: Account) => !a.blocked && (a.effective !== 'none' || a.bonusImages > 0)

/** Desconto (centavos) do cupom neste plano e período; 0 se não vale. Espelha coupon_discount() do banco (mínimo final: R$ 1,00). */
export function couponDiscountCents(list: number, c: AccountCoupon | null, plan: PaidPlan, cycle: Cycle): number {
  if (!c || !c.plans.includes(plan) || (c.cycles !== 'both' && c.cycles !== cycle)) return 0
  const d = c.kind === 'percent' ? Math.round((list * c.value) / 100) : c.value
  return Math.max(0, Math.min(d, list - 100))
}

/** Preço do plano já com o cupom da conta. */
export function finalPriceCents(p: Prices, plan: PaidPlan, cycle: Cycle, c: AccountCoupon | null): number {
  const list = priceCents(p, plan, cycle)
  return list - couponDiscountCents(list, c, plan, cycle)
}

export const couponLabel = (c: Pick<AccountCoupon, 'kind' | 'value'>) => (c.kind === 'percent' ? `${c.value}%` : formatCents(c.value))

export const canCreateImage = (a: Account) => imagesLeft(a) !== 0
export const canUseTools = (a: Account) => a.effective === 'plus'

export function daysLeft(expiresAt: string | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null
  return Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86_400_000)
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const formatCents = (c: number) => BRL.format(c / 100)

export const MONTH_KEY = (d: Date = new Date()) => {
  // mês em America/Sao_Paulo, como no banco
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(d)
  return parts.slice(0, 7)
}

export function addPeriod(from: Date, cycle: Cycle): Date {
  const d = new Date(from)
  if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d
}

export class AccessError extends Error {
  constructor(public code: 'limite_mensal' | 'assinatura_inativa', message: string) {
    super(message)
  }
}

export const LIMIT_MESSAGE = 'Você usou todas as imagens deste mês no plano Básico. Assine o Plus para criar sem limite.'
export const INACTIVE_MESSAGE = 'Sua assinatura não está ativa. Escolha um plano para continuar.'
