import { describe, expect, it } from 'vitest'
import { addPeriod, canCreateImage, canUseTools, DEFAULT_PRICES, effectivePlan, imageLimit, imagesLeft, priceCents, yearlySavingCents, type Account } from './plans'
import { localAccountStore, DEMO_KEY } from './store'
import { localAdminStore } from './adminStore'

const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}
const acc = (over: Partial<Account>): Account => ({ plan: 'basic', effective: 'basic', expiresAt: null, blocked: false, cycle: null, method: null, isAdmin: false, email: null, imagesUsed: 0, prices: DEFAULT_PRICES, ...over })

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
    expect(st.users).toBe(7)
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
