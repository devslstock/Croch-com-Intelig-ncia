import { describe, expect, it } from 'vitest'
import { calcPrice, maxDiscountPct, money, parseDecimal, roundPrice, simulateDiscount, stitchesToGrams, stitchesToHours, type PricingInput } from './pricing'

const base: PricingInput = {
  skeinPrice: 20, skeinGrams: 100, gramsUsed: 150, wholeSkeins: false,
  extras: [{ name: 'Enchimento', cost: 10 }],
  hours: 5, hourlyRate: 10,
  feesPct: 10, taxPct: 5, marginPct: 25, contingencyPct: 0, depositPct: 50, roundTo: 'none',
}

describe('calculadora de preço', () => {
  it('soma material e mão de obra e cobra taxas e lucro sobre o preço final', () => {
    const r = calcPrice(base)
    expect(r.valid).toBe(true)
    expect(r.yarnCost).toBeCloseTo(30) // 1,5 novelo × 20
    expect(r.materialCost).toBeCloseTo(40)
    expect(r.laborCost).toBeCloseTo(50)
    expect(r.baseCost).toBeCloseTo(90)
    // taxas 10% + impostos 5% + lucro 25% = 40% do preço → preço = 90 / 0,6 = 150
    expect(r.price).toBeCloseTo(150, 1)
    expect(r.feesValue).toBeCloseTo(15, 1)
    expect(r.taxValue).toBeCloseTo(7.5, 1)
    expect(r.profit).toBeCloseTo(37.5, 1)
    expect(r.profitPct).toBeCloseTo(0.25, 2)
    // o que entra bate com o que sai
    expect(r.baseCost + r.feesValue + r.taxValue + r.profit).toBeCloseTo(r.price, 5)
  })

  it('novelo inteiro: compra-se o novelo todo mesmo gastando só uma parte', () => {
    const r = calcPrice({ ...base, wholeSkeins: true })
    expect(r.skeins).toBe(2)
    expect(r.yarnCost).toBeCloseTo(40)
  })

  it('imprevistos aumentam o custo sobre material e mão de obra', () => {
    const r = calcPrice({ ...base, contingencyPct: 10 })
    expect(r.contingency).toBeCloseTo(9)
    expect(r.baseCost).toBeCloseTo(99)
  })

  it('preço mínimo cobre custo, taxas e impostos, sem lucro', () => {
    const r = calcPrice(base)
    expect(r.minPrice).toBeCloseTo(90 / 0.85, 1)
    const d = simulateDiscount(r, base, 0)
    expect(d.loss).toBe(false)
    expect(simulateDiscount(r, base, 50).loss).toBe(true)
    // no desconto máximo ainda não dá prejuízo; 1 ponto a mais já dá
    const max = maxDiscountPct(r)
    expect(simulateDiscount(r, base, max).loss).toBe(false)
    expect(simulateDiscount(r, base, max + 1).loss).toBe(true)
  })

  it('sinal e saldo somam o preço', () => {
    const r = calcPrice(base)
    expect(r.deposit + r.balance).toBeCloseTo(r.price, 2)
    expect(r.deposit).toBeCloseTo(r.price / 2, 1)
  })

  it('arredondamentos sempre para cima e o lucro absorve a diferença', () => {
    expect(roundPrice(166.67, '1')).toBe(167)
    expect(roundPrice(166.67, '5')).toBe(170)
    expect(roundPrice(166.67, '10')).toBe(170)
    expect(roundPrice(166.67, '90')).toBe(166.9)
    expect(roundPrice(166.95, '90')).toBe(167.9)
    expect(roundPrice(120, '90')).toBe(120.9)
    expect(roundPrice(119.9, '90')).toBe(119.9)
    const r = calcPrice({ ...base, roundTo: '10' })
    expect(r.price % 10).toBe(0)
    expect(r.price).toBeGreaterThanOrEqual(150)
    expect(r.profit).toBeGreaterThanOrEqual(37.5)
  })

  it('avisa quando a conta não fecha ou falta informação', () => {
    expect(calcPrice({ ...base, feesPct: 50, taxPct: 30, marginPct: 20 }).valid).toBe(false)
    expect(calcPrice({ ...base, feesPct: 50, taxPct: 30, marginPct: 20 }).error).toMatch(/100%/)
    expect(calcPrice({ ...base, extras: [], gramsUsed: 0, hours: 0 }).valid).toBe(false)
  })

  it('valores negativos ou inválidos viram zero', () => {
    const r = calcPrice({ ...base, hours: -5, extras: [{ name: 'x', cost: Number.NaN }] })
    expect(r.laborCost).toBe(0)
    expect(r.extrasCost).toBe(0)
  })

  it('pontos viram gramas e horas', () => {
    expect(stitchesToGrams(6510, 1.8)).toBeCloseTo(117.18, 1)
    expect(stitchesToHours(6510, 200)).toBeCloseTo(32.55, 2)
    expect(stitchesToHours(100, 0)).toBe(0)
  })

  it('lê números no formato brasileiro', () => {
    expect(parseDecimal('12,50')).toBe(12.5)
    expect(parseDecimal('1.234,5')).toBe(1234.5)
    expect(parseDecimal('R$ 15')).toBe(15)
    expect(parseDecimal('12.5')).toBe(12.5)
    expect(parseDecimal('')).toBe(0)
    expect(parseDecimal('abc')).toBe(0)
    expect(parseDecimal('-3')).toBe(0)
  })

  it('formata em reais', () => {
    expect(money(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50')
  })
})
