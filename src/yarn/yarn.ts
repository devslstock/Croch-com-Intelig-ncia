import { deltaE, rgbToLab, type Lab } from '../engine/color'
import type { ChartResult } from '../engine/types'

export interface YarnColor {
  /** Número/código impresso no novelo. */
  code: string
  name: string
  hex: string
  lab: Lab
}

export interface YarnPalette {
  id: string
  brand: string
  line: string
  colors: YarnColor[]
}

export interface YarnChoice {
  yarn: YarnColor
  /** Distância de cor (ΔE76) entre a cor do gráfico e o fio. Abaixo de ~6 é difícil de notar. */
  deltaE: number
}

export interface ColorMatch {
  letter: string
  count: number
  best: YarnChoice
  alternatives: YarnChoice[]
  /** Fios mais parecidos (sem o escolhido), usados para sugerir substitutos na lista de compras. */
  pool: YarnChoice[]
}

export interface ShoppingItem {
  yarn: YarnColor
  letters: string[]
  stitches: number
  /** Fios parecidos que não repetem nenhum novelo já presente no gráfico. */
  substitutes: YarnChoice[]
}

const hexToLab = (hex: string): Lab =>
  rgbToLab(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16))

/** CSV com cabeçalho `codigo,nome,hex`. Linhas vazias e começando com # são ignoradas. */
export function parseYarnCsv(id: string, brand: string, line: string, csv: string): YarnPalette {
  const colors: YarnColor[] = []
  const rows = csv.split(/\r?\n/).map((r) => r.trim()).filter((r) => r && !r.startsWith('#'))
  for (const row of rows.slice(1)) {
    const [code, name, hexRaw] = row.split(',').map((c) => c.trim())
    const hex = hexRaw?.startsWith('#') ? hexRaw.toLowerCase() : `#${hexRaw ?? ''}`.toLowerCase()
    if (!code || !/^#[0-9a-f]{6}$/.test(hex)) continue
    colors.push({ code, name: name ?? '', hex, lab: hexToLab(hex) })
  }
  return { id, brand, line, colors }
}

function ranked(hex: string, yarn: YarnPalette): YarnChoice[] {
  const lab = hexToLab(hex)
  return yarn.colors
    .map((y) => ({ yarn: y, deltaE: deltaE(lab, y.lab) }))
    .sort((a, b) => a.deltaE - b.deltaE || a.yarn.code.localeCompare(b.yarn.code))
}

/** Para cada cor do gráfico: o fio mais parecido e 3 alternativas. */
export function matchPalette(chart: ChartResult, yarn: YarnPalette, overrides: Record<string, string> = {}): ColorMatch[] {
  if (yarn.colors.length === 0) return []
  return chart.palette.map((p) => {
    const r = ranked(p.hex, yarn)
    // A artesã pode trocar o fio sugerido por outro (campo do fio ou chip "Parecidas").
    const chosen = r.find((c) => c.yarn.code === overrides[p.letter]) ?? r[0]
    const alternatives = r.filter((c) => c !== chosen).slice(0, 3)
    return { letter: p.letter, count: p.count, best: chosen, alternatives, pool: r.filter((c) => c !== chosen).slice(0, 10) }
  })
}

/** Junta as cores do gráfico que caíram no mesmo fio: o que realmente precisa ser comprado. */
export function shoppingList(matches: ColorMatch[]): ShoppingItem[] {
  const byCode = new Map<string, ShoppingItem>()
  const pools = new Map<string, YarnChoice[]>()
  for (const m of matches) {
    const cur = byCode.get(m.best.yarn.code)
    if (cur) {
      cur.letters.push(m.letter)
      cur.stitches += m.count
    } else {
      byCode.set(m.best.yarn.code, { yarn: m.best.yarn, letters: [m.letter], stitches: m.count, substitutes: [] })
      pools.set(m.best.yarn.code, m.pool)
    }
  }
  for (const item of byCode.values()) {
    item.substitutes = (pools.get(item.yarn.code) ?? []).filter((c) => !byCode.has(c.yarn.code)).slice(0, 2)
  }
  return [...byCode.values()].sort((a, b) => b.stitches - a.stitches)
}
