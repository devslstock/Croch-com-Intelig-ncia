/** Cálculo do preço de uma peça: material + mão de obra + imprevistos, depois taxas, impostos e lucro sobre o preço final. */

export type RoundTo = 'none' | '1' | '5' | '10' | '90'

export interface ExtraCost {
  name: string
  cost: number
}

export interface PricingInput {
  skeinPrice: number
  skeinGrams: number
  gramsUsed: number
  /** Cobrar novelos inteiros (o que você realmente compra) em vez de só os gramas usados. */
  wholeSkeins: boolean
  extras: ExtraCost[]
  hours: number
  hourlyRate: number
  /** Percentuais de 0 a 100 sobre o PREÇO FINAL. */
  feesPct: number
  taxPct: number
  marginPct: number
  /** Percentual de 0 a 100 sobre o custo (material + mão de obra), para imprevistos. */
  contingencyPct: number
  depositPct: number
  roundTo: RoundTo
}

export interface PricingResult {
  valid: boolean
  error?: string
  skeins: number
  yarnCost: number
  extrasCost: number
  materialCost: number
  laborCost: number
  contingency: number
  baseCost: number
  /** Preço de venda sugerido (já arredondado). */
  price: number
  feesValue: number
  taxValue: number
  /** Lucro que sobra no bolso depois de tudo (inclui o efeito do arredondamento). */
  profit: number
  /** Lucro em % do preço final. */
  profitPct: number
  /** Menor preço sem prejuízo: cobre custo, taxas e impostos, com lucro zero. */
  minPrice: number
  deposit: number
  balance: number
  breakdown: Array<{ key: 'material' | 'labor' | 'contingency' | 'fees' | 'profit'; label: string; value: number }>
}

const num = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0)
const cents = (v: number) => Math.round(v * 100) / 100

export function roundPrice(value: number, mode: RoundTo): number {
  const v = Math.max(0, value)
  switch (mode) {
    case 'none':
      return Math.ceil(v * 100 - 1e-9) / 100
    case '1':
      return Math.ceil(v - 1e-9)
    case '5':
      return Math.ceil(v / 5 - 1e-9) * 5
    case '10':
      return Math.ceil(v / 10 - 1e-9) * 10
    case '90':
      // menor número terminado em ,90 que não fica abaixo do valor
      return cents(Math.ceil(v - 0.9 - 1e-9) + 0.9)
  }
}

export function stitchesToGrams(stitches: number, gramsPer100: number): number {
  return (num(stitches) / 100) * num(gramsPer100)
}

export function stitchesToHours(stitches: number, stitchesPerHour: number): number {
  const pph = num(stitchesPerHour)
  return pph > 0 ? num(stitches) / pph : 0
}

export function calcPrice(i: PricingInput): PricingResult {
  const skeinGrams = num(i.skeinGrams)
  const gramsUsed = num(i.gramsUsed)
  const skeinsExact = skeinGrams > 0 ? gramsUsed / skeinGrams : 0
  const skeins = i.wholeSkeins ? Math.ceil(skeinsExact - 1e-9) : skeinsExact
  const yarnCost = skeins * num(i.skeinPrice)
  const extrasCost = i.extras.reduce((s, e) => s + num(e.cost), 0)
  const materialCost = yarnCost + extrasCost
  const laborCost = num(i.hours) * num(i.hourlyRate)
  const contingency = (materialCost + laborCost) * (num(i.contingencyPct) / 100)
  const baseCost = materialCost + laborCost + contingency

  const rate = (num(i.feesPct) + num(i.taxPct) + num(i.marginPct)) / 100
  const empty: PricingResult = {
    valid: false, skeins, yarnCost, extrasCost, materialCost, laborCost, contingency, baseCost,
    price: 0, feesValue: 0, taxValue: 0, profit: 0, profitPct: 0, minPrice: 0, deposit: 0, balance: 0, breakdown: [],
  }
  if (rate >= 1) return { ...empty, error: 'Taxas, impostos e lucro somam 100% ou mais: não existe preço que feche a conta. Diminua algum deles.' }
  if (baseCost <= 0) return { ...empty, error: 'Preencha o material ou as horas para calcular o preço.' }

  const priceExact = baseCost / (1 - rate)
  const price = roundPrice(priceExact, i.roundTo)
  const feesValue = price * (num(i.feesPct) / 100)
  const taxValue = price * (num(i.taxPct) / 100)
  const profit = price - baseCost - feesValue - taxValue
  const minPrice = roundPrice(baseCost / (1 - (num(i.feesPct) + num(i.taxPct)) / 100), 'none')
  const deposit = cents(price * (num(i.depositPct) / 100))

  return {
    valid: true, skeins, yarnCost, extrasCost, materialCost, laborCost, contingency, baseCost,
    price, feesValue, taxValue, profit, profitPct: price > 0 ? profit / price : 0, minPrice, deposit, balance: cents(price - deposit),
    breakdown: [
      { key: 'material', label: 'Material', value: materialCost },
      { key: 'labor', label: 'Mão de obra', value: laborCost },
      { key: 'contingency', label: 'Imprevistos', value: contingency },
      { key: 'fees', label: 'Taxas e impostos', value: feesValue + taxValue },
      { key: 'profit', label: 'Lucro', value: Math.max(0, profit) },
    ],
  }
}

export interface DiscountView {
  price: number
  profit: number
  /** Abaixo do custo (com taxas): dá prejuízo. */
  loss: boolean
}

/** O que acontece se a cliente pedir `pct`% de desconto. */
export function simulateDiscount(r: PricingResult, i: Pick<PricingInput, 'feesPct' | 'taxPct'>, pct: number): DiscountView {
  const price = cents(r.price * (1 - Math.min(100, Math.max(0, pct)) / 100))
  const profit = price - r.baseCost - price * ((num(i.feesPct) + num(i.taxPct)) / 100)
  return { price, profit, loss: profit < 0 }
}

/** Maior desconto (em %, inteiro) que ainda deixa lucro ≥ 0. */
export function maxDiscountPct(r: PricingResult): number {
  if (!r.valid || r.price <= 0) return 0
  return Math.max(0, Math.floor(((r.price - r.minPrice) / r.price) * 100))
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const money = (v: number) => BRL.format(Number.isFinite(v) ? v : 0)

/** "12,50" / "1.234,5" / "12.5" → número. Vazio ou inválido → 0. */
export function parseDecimal(text: string): number {
  const t = text.trim().replace(/\s/g, '').replace('R$', '')
  if (!t) return 0
  // com vírgula: ponto é separador de milhar; sem vírgula: ponto é decimal
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(normal)
  return Number.isFinite(n) && n >= 0 ? n : 0
}
