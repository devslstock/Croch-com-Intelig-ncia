import type { SupabaseClient } from '@supabase/supabase-js'
import { addPeriod, DEFAULT_PRICES, effectivePlan, planWithTrial, MONTH_KEY, AccessError, LIMIT_MESSAGE, INACTIVE_MESSAGE, type Account, type AccountCoupon, type Cycle, type Method, type PaidPlan, type Plan, type Prices } from './plans'
import { DEMO_ADMIN_KEY, seedDemoAdmin, type AdminCoupon } from './adminStore'
import { readJson, type StorageLike } from '../tools/storage'

export interface CheckoutRequest {
  plan: PaidPlan
  cycle: Cycle
  method: Method
  /** Só para quem entrou sem e-mail (ex.: WhatsApp): o Mercado Pago exige um. */
  email?: string
}

export type CheckoutResult =
  | { kind: 'redirect'; url: string }
  | { kind: 'pix'; amountCents: number; qrCode: string; qrCodeBase64?: string; ticketUrl?: string; expiresAt?: string }
  | { kind: 'demo' }

export interface AccountStore {
  get(): Promise<Account>
  checkout(req: CheckoutRequest): Promise<CheckoutResult>
  /** Liga um cupom à conta (o desconto aparece nos preços). Recusa código inválido. */
  applyCoupon(code: string): Promise<AccountCoupon>
}

export const COUPON_ERRORS: Record<string, string> = {
  cupom_invalido: 'Cupom inválido, vencido ou esgotado.',
  muitas_tentativas: 'Muitas tentativas erradas. Tente de novo daqui a 1 hora.',
}

const parseCoupon = (c: unknown): AccountCoupon | null => {
  if (!c || typeof c !== 'object') return null
  const r = c as Record<string, unknown>
  if (typeof r.code !== 'string' || (r.kind !== 'percent' && r.kind !== 'fixed')) return null
  return {
    code: r.code,
    description: typeof r.description === 'string' ? r.description : '',
    kind: r.kind,
    value: Number(r.value ?? 0),
    plans: (Array.isArray(r.plans) ? r.plans : ['basic', 'plus']).filter((p): p is PaidPlan => p === 'basic' || p === 'plus'),
    cycles: r.cycles === 'monthly' || r.cycles === 'yearly' ? r.cycles : 'both',
  }
}

/** Converte o jsonb de my_account() no formato do app. */
export function accountFromRow(r: Record<string, unknown>): Account {
  const prices = (r.prices ?? {}) as Partial<Prices>
  return {
    plan: (r.plan as Plan) ?? 'none',
    effective: (r.effective as Plan) ?? 'none',
    expiresAt: (r.expiresAt as string | null) ?? null,
    trialEndsAt: (r.trialEndsAt as string | null) ?? null,
    blocked: Boolean(r.blocked),
    cycle: (r.cycle as Cycle | null) ?? null,
    method: (r.method as Account['method']) ?? null,
    isAdmin: Boolean(r.isAdmin),
    email: (r.email as string | null) ?? null,
    imagesUsed: Number(r.imagesUsed ?? 0),
    bonusImages: Number(r.bonusImages ?? 0),
    coupon: parseCoupon(r.coupon),
    prices: { ...DEFAULT_PRICES, ...prices },
  }
}

export function supabaseAccountStore(client: SupabaseClient): AccountStore {
  return {
    async get() {
      const { data, error } = await client.rpc('my_account')
      if (error || !data) throw new Error('Não consegui carregar sua assinatura.')
      return accountFromRow(data as Record<string, unknown>)
    },
    async checkout(req) {
      const { data, error } = await client.functions.invoke('mp-checkout', { body: req })
      let body = data as { error?: string } | null
      // Em resposta de erro (4xx/5xx) o corpo vem dentro do erro, não em `data`.
      if (error && !body) {
        try {
          body = (await (error as { context?: Response }).context?.json()) as { error?: string } | null
        } catch {
          body = null
        }
      }
      if (error || !data || (data as { error?: string }).error) {
        const code = body?.error
        if (code === 'pix_so_em_producao') throw new Error('O Pix só funciona no ambiente de produção (o ambiente de teste do Mercado Pago não oferece Pix). Para testar agora, use o cartão.')
        if (code === 'preco_indisponivel') throw new Error('O preço não está disponível agora. Tente de novo em instantes.')
        if (code === 'email_necessario') throw new Error('Informe um e-mail para receber o comprovante.')
        if (code === 'pagamento_nao_configurado') throw new Error('O pagamento ainda não foi configurado.')
        throw new Error('Não consegui iniciar o pagamento. Tente de novo em instantes.')
      }
      return data as CheckoutResult
    },
    async applyCoupon(code) {
      const { data, error } = await client.rpc('redeem_coupon', { p_code: code })
      const r = data as { ok?: boolean; error?: string; coupon?: unknown } | null
      if (error || !r) throw new Error('Não consegui validar o cupom. Tente de novo.')
      const coupon = r.ok ? parseCoupon(r.coupon) : null
      if (!coupon) throw new Error(COUPON_ERRORS[r.error ?? ''] ?? COUPON_ERRORS.cupom_invalido)
      return coupon
    },
  }
}

// ---------------------------------------------------------------------------
// Modo demonstração: tudo no navegador, para testar as telas sem Supabase nem Mercado Pago.
// ---------------------------------------------------------------------------
interface DemoState {
  plan: Plan
  expiresAt: string | null
  cycle: Cycle | null
  method: Account['method']
  imagesMonth: string
  imagesCount: number
  /** Gráficos de presente restantes (ausente = ainda não definido: usa o valor do painel de demonstração). */
  bonus?: number
  couponCode?: string
  /** Fim do período grátis (ausente = ainda não definido; null = sem período grátis). */
  trialEnds?: string | null
}

const EMPTY: DemoState = { plan: 'none', expiresAt: null, cycle: null, method: null, imagesMonth: '', imagesCount: 0 }
export const DEMO_KEY = 'tramado:demo:account'

export function localAccountStore(storage: StorageLike, now: () => Date = () => new Date()) {
  const read = () => readJson<DemoState>(storage, DEMO_KEY, EMPTY)
  const write = (s: DemoState) => {
    try {
      storage.setItem(DEMO_KEY, JSON.stringify(s))
    } catch {
      /* sem armazenamento */
    }
  }
  /** Cupons e preços do painel de demonstração (guardados no mesmo navegador). */
  const demoAdmin = () => {
    const saved = readJson<{ coupons?: AdminCoupon[]; prices?: Partial<Prices> }>(storage, DEMO_ADMIN_KEY, {})
    return { coupons: saved.coupons ?? seedDemoAdmin(now()).coupons, prices: { ...DEFAULT_PRICES, ...saved.prices } }
  }
  const couponOf = (code?: string): AccountCoupon | null => {
    const c = code ? demoAdmin().coupons.find((x) => x.code === code) : undefined
    if (!c || !c.active || (c.expiresAt && new Date(c.expiresAt) <= now())) return null
    return { code: c.code, description: c.description, kind: c.kind, value: c.value, plans: c.plans, cycles: c.cycles }
  }
  const view = (s: DemoState): Account => {
    const prices = demoAdmin().prices
    const paid = effectivePlan(s.plan, false, s.expiresAt, prices.graceDays, now())
    const effective = planWithTrial(s.plan, false, s.expiresAt, prices.graceDays, s.trialEnds, now())
    return {
      plan: s.plan,
      effective,
      expiresAt: s.expiresAt,
      trialEndsAt: paid === 'none' && effective === 'basic' ? s.trialEnds ?? null : null,
      blocked: false,
      cycle: s.cycle,
      method: s.method,
      isAdmin: true, // só na demonstração, para você ver o painel
      email: null,
      imagesUsed: s.imagesMonth === MONTH_KEY(now()) ? s.imagesCount : 0,
      bonusImages: s.bonus ?? prices.signupBonusImages,
      coupon: couponOf(s.couponCode),
      prices,
      demo: true,
    }
  }
  return {
    async get(): Promise<Account> {
      let s = read()
      if (s.trialEnds === undefined) {
        // Primeiro acesso da demonstração = "cadastro": começa o período grátis do painel.
        const days = demoAdmin().prices.trialDays
        s = { ...s, trialEnds: days > 0 ? new Date(now().getTime() + days * 86_400_000).toISOString() : null }
        write(s)
      }
      return view(s)
    },
    async checkout(req: CheckoutRequest): Promise<CheckoutResult> {
      const s = read()
      write({ ...s, plan: req.plan, cycle: req.cycle, method: req.method, expiresAt: addPeriod(now(), req.cycle).toISOString() })
      return { kind: 'demo' }
    },
    async applyCoupon(code: string): Promise<AccountCoupon> {
      const c = couponOf(code.trim().toUpperCase())
      if (!c) throw new Error(COUPON_ERRORS.cupom_invalido)
      write({ ...read(), couponCode: c.code })
      return c
    },
    /** Mesma regra do gatilho do banco: conta ao criar um gráfico novo (o bônus cobre "sem plano" e "acabou a cota"). */
    consumeImage() {
      const s = read()
      const a = view(s)
      const cur = MONTH_KEY(now())
      const used = s.imagesMonth === cur ? s.imagesCount : 0
      if (a.effective === 'none') {
        if (a.bonusImages <= 0) throw new AccessError('assinatura_inativa', INACTIVE_MESSAGE)
        write({ ...s, bonus: a.bonusImages - 1 })
      } else if (a.effective === 'basic' && used >= a.prices.basicImageLimit) {
        if (a.bonusImages <= 0) throw new AccessError('limite_mensal', LIMIT_MESSAGE)
        write({ ...s, bonus: a.bonusImages - 1 })
      } else {
        write({ ...s, imagesMonth: cur, imagesCount: used + 1 })
      }
    },
    /** Só demonstração: volta ao estado "sem assinatura". */
    reset() {
      write(EMPTY)
    },
  }
}
