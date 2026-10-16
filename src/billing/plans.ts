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
}

/** Valores de EXEMPLO (mesmos do banco): o painel de gestão altera os de verdade. */
export const DEFAULT_PRICES: Prices = {
  basicMonthlyCents: 1990,
  plusMonthlyCents: 3990,
  yearlyFreeMonths: 2,
  basicImageLimit: 12,
  graceDays: 3,
}

export interface Account {
  plan: Plan
  /** Plano que vale agora (já considera bloqueio, vencimento e tolerância). */
  effective: Plan
  expiresAt: string | null
  blocked: boolean
  cycle: Cycle | null
  method: 'card' | 'pix' | 'manual' | null
  isAdmin: boolean
  email: string | null
  imagesUsed: number
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

/** Limite de imagens novas por mês: número (Básico), null (ilimitado) ou 0 (sem assinatura). */
export function imageLimit(a: Account): number | null {
  if (a.effective === 'plus') return null
  if (a.effective === 'basic') return a.prices.basicImageLimit
  return 0
}

export function imagesLeft(a: Account): number | null {
  const lim = imageLimit(a)
  return lim === null ? null : Math.max(0, lim - a.imagesUsed)
}

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
