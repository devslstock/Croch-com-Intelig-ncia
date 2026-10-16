import { describe, expect, it } from 'vitest'
import { canUseApp, couponDiscountCents, finalPriceCents, monthlyLeft, type AccountCoupon } from './plans'
import { addPeriod, onTrial, planWithTrial, canCreateImage, canUseTools, DEFAULT_PRICES, effectivePlan, imageLimit, imagesLeft, offersOnlyBasic, priceCents, yearlySavingCents, type Account } from './plans'
import { localAccountStore, DEMO_KEY } from './store'
import { localAdminStore } from './adminStore'

const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}
const acc = (over: Partial<Account>): Account => ({ plan: 'basic', effective: 'basic', expiresAt: null, trialEndsAt: null, blocked: false, cycle: null, method: null, isAdmin: false, email: null, imagesUsed: 0, bonusImages: 0, coupon: null, prices: DEFAULT_PRICES, ...over })

describe('preços', () => {
  it('anual = 12 mensalidades menos 2', () => {
    expect(priceCents(DEFAULT_PRICES, 'basic', 'yearly')).toBe(19900)
    expect(priceCents(DEFAULT_PRICES, 'plus', 'yearly')).toBe(39900)
    expect(yearlySavingCents(DEFAULT_PRICES, 'plus')).toBe(7980)
    expect(priceCents({ ...DEFAULT_PRICES, yearlyFreeMonths: 0 }, 'basic', 'yearly')).toBe(1990 * 12)
  })
})

describe('acesso', () => {
  it('Básico: 12 imagens; Plus: ilimitado; sem plano: nada', () => {
    expect(imageLimit(acc({}))).toBe(12)
    expect(imagesLeft(acc({ imagesUsed: 5 }))).toBe(7)
    expect(canCreateImage(acc({ imagesUsed: 12 }))).toBe(false)
    expect(imageLimit(acc({ effective: 'plus' }))).toBeNull()
    expect(canCreateImage(acc({ effective: 'plus', imagesUsed: 999 }))).toBe(true)
    expect(canCreateImage(acc({ effective: 'none' }))).toBe(false)
  })
  it('ferramentas só no Plus', () => {
    expect(canUseTools(acc({ effective: 'basic' }))).toBe(false)
    expect(canUseTools(acc({ effective: 'plus' }))).toBe(true)
  })
  it('quem nunca assinou só vê o Básico; quem já teve plano vê os dois', () => {
    expect(offersOnlyBasic(acc({ plan: 'none', effective: 'none' }))).toBe(true)
    expect(offersOnlyBasic(acc({ plan: 'basic' }))).toBe(false)
    // Plus vencido: renovar mostra os dois planos
    expect(offersOnlyBasic(acc({ plan: 'plus', effective: 'none' }))).toBe(false)
  })
  it('vencimento, tolerância e bloqueio', () => {
    const now = new Date('2026-10-16T12:00:00Z')
    expect(effectivePlan('plus', false, '2026-10-20T00:00:00Z', 3, now)).toBe('plus')
    expect(effectivePlan('plus', false, '2026-10-14T00:00:00Z', 3, now)).toBe('plus') // 2 dias vencido, tolerância 3
    expect(effectivePlan('plus', false, '2026-10-10T00:00:00Z', 3, now)).toBe('none')
    expect(effectivePlan('plus', true, null, 3, now)).toBe('none')
    expect(effectivePlan('plus', false, null, 3, now)).toBe('plus')
    expect(effectivePlan('none', false, null, 3, now)).toBe('none')
  })
  it('addPeriod soma mês e ano', () => {
    expect(addPeriod(new Date('2026-01-15T00:00:00Z'), 'monthly').toISOString().slice(0, 10)).toBe('2026-02-15')
    expect(addPeriod(new Date('2026-01-15T00:00:00Z'), 'yearly').toISOString().slice(0, 10)).toBe('2027-01-15')
  })
})

describe('demonstração', () => {
  it('sem assinatura bloqueia; Básico conta 12; Plus libera', async () => {
    const st = mem()
    const s = localAccountStore(st)
    expect((await s.get()).effective).toBe('none')
    expect(() => s.consumeImage()).toThrow(/assinatura/)
    await s.checkout({ plan: 'basic', cycle: 'monthly', method: 'pix' })
    expect((await s.get()).effective).toBe('basic')
    for (let i = 0; i < 12; i++) s.consumeImage()
    expect((await s.get()).imagesUsed).toBe(12)
    expect(() => s.consumeImage()).toThrow(/Plus/)
    await s.checkout({ plan: 'plus', cycle: 'yearly', method: 'card' })
    expect(() => s.consumeImage()).not.toThrow()
    s.reset()
    expect(JSON.parse(st.getItem(DEMO_KEY)!).plan).toBe('none')
  })
  it('a cota volta no mês seguinte', async () => {
    const st = mem()
    let now = new Date('2026-10-16T12:00:00Z')
    const s = localAccountStore(st, () => now)
    await s.checkout({ plan: 'basic', cycle: 'yearly', method: 'card' })
    for (let i = 0; i < 12; i++) s.consumeImage()
    now = new Date('2026-11-02T12:00:00Z')
    expect((await s.get()).imagesUsed).toBe(0)
    expect(() => s.consumeImage()).not.toThrow()
  })
})

describe('painel (demonstração)', () => {
  it('estatísticas, busca e edição manual', async () => {
    const now = new Date('2026-10-16T12:00:00Z')
    const a = localAdminStore(mem(), () => now)
    const st = await a.stats()
    expect(st.users).toBe(8)
    expect(st.blocked).toBe(1)
    expect((await a.users('joana')).length).toBe(1)
    const joana = (await a.users('joana'))[0]
    await a.update(joana.id, { plan: 'plus', expiresAt: null, blocked: false, note: 'cortesia' })
    const after = (await a.users('joana'))[0]
    expect(after.effective).toBe('plus')
    expect(after.method).toBe('manual')
    expect((await a.audit()).length).toBe(1)
    await a.updateSettings({ ...(await a.settings()), basicMonthlyCents: 2500 })
    expect((await a.settings()).basicMonthlyCents).toBe(2500)
  })
})

const pct = (value: number, over: Partial<AccountCoupon> = {}): AccountCoupon => ({ code: 'BEMVINDA10', description: '', kind: 'percent', value, plans: ['basic', 'plus'], cycles: 'both', ...over })

describe('cupons', () => {
  it('porcentagem e valor fixo, sobre o preço de tabela', () => {
    expect(couponDiscountCents(19900, pct(10), 'basic', 'yearly')).toBe(1990)
    expect(couponDiscountCents(1990, pct(10), 'basic', 'monthly')).toBe(199)
    expect(couponDiscountCents(1990, pct(0, { kind: 'fixed', value: 500 }), 'basic', 'monthly')).toBe(500)
    expect(finalPriceCents(DEFAULT_PRICES, 'plus', 'yearly', pct(10))).toBe(35910)
    expect(finalPriceCents(DEFAULT_PRICES, 'plus', 'yearly', null)).toBe(39900)
  })
  it('só vale no plano e no período do cupom', () => {
    const c = pct(20, { plans: ['basic'], cycles: 'yearly' })
    expect(couponDiscountCents(19900, c, 'basic', 'yearly')).toBe(3980)
    expect(couponDiscountCents(39900, c, 'plus', 'yearly')).toBe(0)
    expect(couponDiscountCents(1990, c, 'basic', 'monthly')).toBe(0)
  })
  it('o preço final nunca fica abaixo de R$ 1,00', () => {
    expect(couponDiscountCents(1990, pct(0, { kind: 'fixed', value: 99999 }), 'basic', 'monthly')).toBe(1890)
    expect(finalPriceCents(DEFAULT_PRICES, 'basic', 'monthly', pct(0, { kind: 'fixed', value: 99999 }))).toBe(100)
  })
})

describe('gráficos de bônus', () => {
  it('sem plano, o bônus libera o app e conta como imagens restantes', () => {
    const none = acc({ plan: 'none', effective: 'none', bonusImages: 3 })
    expect(canUseApp(none)).toBe(true)
    expect(imagesLeft(none)).toBe(3)
    expect(canCreateImage(none)).toBe(true)
    expect(canUseApp(acc({ plan: 'none', effective: 'none', bonusImages: 0 }))).toBe(false)
    expect(canCreateImage(acc({ plan: 'none', effective: 'none', bonusImages: 0 }))).toBe(false)
  })
  it('no Básico, o bônus soma à cota do mês', () => {
    const a = acc({ imagesUsed: 12, bonusImages: 2 })
    expect(monthlyLeft(a)).toBe(0)
    expect(imagesLeft(a)).toBe(2)
    expect(canCreateImage(a)).toBe(true)
    expect(imagesLeft(acc({ imagesUsed: 5, bonusImages: 2 }))).toBe(9)
  })
  it('Plus segue ilimitado e conta bloqueada não usa o bônus', () => {
    expect(imagesLeft(acc({ effective: 'plus', bonusImages: 5 }))).toBeNull()
    const blocked = acc({ plan: 'none', effective: 'none', blocked: true, bonusImages: 5 })
    expect(canUseApp(blocked)).toBe(false)
    expect(canCreateImage(blocked)).toBe(false)
  })
  it('demonstração: o bônus cobre "sem plano" e "acabou a cota"', async () => {
    const st = mem()
    const admin = localAdminStore(st)
    await admin.updateSettings({ ...(await admin.settings()), signupBonusImages: 2 })
    const s = localAccountStore(st)
    expect((await s.get()).bonusImages).toBe(2)
    s.consumeImage()
    s.consumeImage()
    expect(() => s.consumeImage()).toThrow(/assinatura/)
    await s.checkout({ plan: 'basic', cycle: 'monthly', method: 'pix' })
    for (let i = 0; i < 12; i++) s.consumeImage()
    expect(() => s.consumeImage()).toThrow(/Plus/)
  })
})

describe('cupons (demonstração)', () => {
  it('admin cria o cupom, a conta o aplica e o preço muda', async () => {
    const st = mem()
    const admin = localAdminStore(st)
    await admin.saveCoupon({ code: 'oi25', description: '', kind: 'percent', value: 25, plans: ['basic', 'plus'], cycles: 'both', maxUses: null, expiresAt: null, active: true })
    expect((await admin.coupons()).some((c) => c.code === 'OI25')).toBe(true)
    const s = localAccountStore(st)
    await expect(s.applyCoupon('nada')).rejects.toThrow(/inválido/)
    const c = await s.applyCoupon(' oi25 ')
    expect(c.code).toBe('OI25')
    const a = await s.get()
    expect(a.coupon?.code).toBe('OI25')
    expect(finalPriceCents(a.prices, 'plus', 'monthly', a.coupon)).toBe(2992)
  })
  it('cupom pausado ou vencido não vale; código repetido e inválido são recusados', async () => {
    const st = mem()
    const admin = localAdminStore(st)
    const base = { description: '', kind: 'percent' as const, value: 10, plans: ['basic' as const], cycles: 'both' as const, maxUses: null, active: true }
    await admin.saveCoupon({ ...base, code: 'PAUSADO', active: false, expiresAt: null })
    await admin.saveCoupon({ ...base, code: 'VELHO', expiresAt: '2020-01-01T00:00:00.000Z' })
    const s = localAccountStore(st)
    await expect(s.applyCoupon('PAUSADO')).rejects.toThrow()
    await expect(s.applyCoupon('VELHO')).rejects.toThrow()
    await expect(admin.saveCoupon({ ...base, code: 'pausado', expiresAt: null })).rejects.toThrow(/já existe/i)
    await expect(admin.saveCoupon({ ...base, code: 'a b', expiresAt: null })).rejects.toThrow(/código/i)
    await expect(admin.saveCoupon({ ...base, code: 'GRANDE', value: 100, expiresAt: null })).rejects.toThrow(/inválido/i)
  })
  it('admin ajusta o bônus de uma pessoa e pausa/apaga cupons', async () => {
    const st = mem()
    const admin = localAdminStore(st)
    const u = (await admin.users('joana'))[0]
    await admin.setBonus(u.id, 5)
    expect((await admin.users('joana'))[0].bonusImages).toBe(5)
    await expect(admin.setBonus(u.id, -1)).rejects.toThrow()
    const [c] = await admin.coupons()
    await admin.saveCoupon({ id: c.id, code: c.code, description: c.description, kind: c.kind, value: c.value, plans: c.plans, cycles: c.cycles, maxUses: c.maxUses, expiresAt: c.expiresAt, active: false })
    expect((await admin.coupons())[0].active).toBe(false)
    await admin.deleteCoupon(c.id)
    expect(await admin.coupons()).toHaveLength(0)
  })
})

describe('período grátis', () => {
  const now = new Date('2026-10-16T12:00:00Z')
  it('vale como Básico até o fim do prazo, sem tolerância extra', () => {
    expect(planWithTrial('none', false, null, 3, '2026-10-20T00:00:00Z', now)).toBe('basic')
    expect(planWithTrial('none', false, null, 3, '2026-10-16T11:00:00Z', now)).toBe('none') // acabou há 1 h: sem os 3 dias de tolerância
    expect(planWithTrial('none', false, null, 3, null, now)).toBe('none')
    expect(planWithTrial('none', true, null, 3, '2026-10-20T00:00:00Z', now)).toBe('none') // conta desativada
  })
  it('assinatura ativa vale mais que o teste; Plus pago não vira Básico', () => {
    expect(planWithTrial('plus', false, '2026-11-20T00:00:00Z', 3, '2026-10-20T00:00:00Z', now)).toBe('plus')
  })
  it('onTrial', () => {
    expect(onTrial({ trialEndsAt: '2026-10-20T00:00:00Z' })).toBe(true)
    expect(onTrial({ trialEndsAt: null })).toBe(false)
  })
  it('demonstração: a conta nova ganha os dias do painel, usa o Básico e depois perde o acesso', async () => {
    const st = mem()
    await localAdminStore(st).updateSettings({ ...(await localAdminStore(st).settings()), trialDays: 7 })
    let t = new Date('2026-10-16T12:00:00Z')
    const s = localAccountStore(st, () => t)
    const a = await s.get()
    expect(a.effective).toBe('basic')
    expect(a.plan).toBe('none')
    expect(a.trialEndsAt).toBe('2026-10-23T12:00:00.000Z')
    expect(canCreateImage(a)).toBe(true)
    expect(offersOnlyBasic(a)).toBe(true) // o Plus continua só para quem assina
    s.consumeImage()
    expect((await s.get()).imagesUsed).toBe(1)
    t = new Date('2026-10-23T12:00:01Z')
    const late = await s.get()
    expect(late.effective).toBe('none')
    expect(late.trialEndsAt).toBeNull()
    expect(canCreateImage(late)).toBe(false)
  })
  it('sem dias no painel, não há período grátis', async () => {
    const s = localAccountStore(mem())
    const a = await s.get()
    expect(a.effective).toBe('none')
    expect(a.trialEndsAt).toBeNull()
  })
})
