import type { SupabaseClient } from '@supabase/supabase-js'
import { addPeriod, DEFAULT_PRICES, effectivePlan, MONTH_KEY, AccessError, LIMIT_MESSAGE, INACTIVE_MESSAGE, type Account, type Cycle, type Method, type PaidPlan, type Plan, type Prices } from './plans'
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
}

/** Converte o jsonb de my_account() no formato do app. */
export function accountFromRow(r: Record<string, unknown>): Account {
  const prices = (r.prices ?? {}) as Partial<Prices>
  return {
    plan: (r.plan as Plan) ?? 'none',
    effective: (r.effective as Plan) ?? 'none',
    expiresAt: (r.expiresAt as string | null) ?? null,
    blocked: Boolean(r.blocked),
    cycle: (r.cycle as Cycle | null) ?? null,
    method: (r.method as Account['method']) ?? null,
    isAdmin: Boolean(r.isAdmin),
    email: (r.email as string | null) ?? null,
    imagesUsed: Number(r.imagesUsed ?? 0),
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
      if (error || !data || (data as { error?: string }).error) {
        const code = (data as { error?: string } | null)?.error
        if (code === 'email_necessario') throw new Error('Informe um e-mail para receber o comprovante.')
        if (code === 'pagamento_nao_configurado') throw new Error('O pagamento ainda não foi configurado.')
        throw new Error('Não consegui iniciar o pagamento. Tente de novo em instantes.')
      }
      return data as CheckoutResult
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
  const view = (s: DemoState): Account => {
    const prices = DEFAULT_PRICES
    return {
      plan: s.plan,
      effective: effectivePlan(s.plan, false, s.expiresAt, prices.graceDays, now()),
      expiresAt: s.expiresAt,
      blocked: false,
      cycle: s.cycle,
      method: s.method,
      isAdmin: true, // só na demonstração, para você ver o painel
      email: null,
      imagesUsed: s.imagesMonth === MONTH_KEY(now()) ? s.imagesCount : 0,
      prices,
      demo: true,
    }
  }
  return {
    async get(): Promise<Account> {
      return view(read())
    },
    async checkout(req: CheckoutRequest): Promise<CheckoutResult> {
      const s = read()
      write({ ...s, plan: req.plan, cycle: req.cycle, method: req.method, expiresAt: addPeriod(now(), req.cycle).toISOString() })
      return { kind: 'demo' }
    },
    /** Mesma regra do gatilho do banco: conta ao criar um gráfico novo. */
    consumeImage() {
      const s = read()
      const a = view(s)
      if (a.effective === 'none') throw new AccessError('assinatura_inativa', INACTIVE_MESSAGE)
      const cur = MONTH_KEY(now())
      const used = s.imagesMonth === cur ? s.imagesCount : 0
      if (a.effective === 'basic' && used >= a.prices.basicImageLimit) throw new AccessError('limite_mensal', LIMIT_MESSAGE)
      write({ ...s, imagesMonth: cur, imagesCount: used + 1 })
    },
    /** Só demonstração: volta ao estado "sem assinatura". */
    reset() {
      write(EMPTY)
    },
  }
}
