import { deltaE2000, rgbToLab, type Lab } from '../engine/color'
import type { ChartResult } from '../engine/types'

export interface YarnColor {
  /** Número/código impresso no novelo. */
  code: string
  name: string
  hex: string
  lab: Lab
}

export type YarnKind = 'croche' | 'ponto-cruz'

export interface YarnPalette {
  id: string
  /** Tipo de trabalho: define o grupo no campo "Fio". */
  kind: YarnKind
  brand: string
  line: string
  colors: YarnColor[]
}

export interface YarnChoice {
  yarn: YarnColor
  /** Distância de cor (CIEDE2000) entre a cor do gráfico e o fio. Abaixo de ~6 é difícil de notar. */
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

/** Divide uma linha CSV respeitando campos entre aspas (nomes com vírgula). */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"'
        i++
      } else quoted = !quoted
    } else if (ch === ',' && !quoted) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

const HEADERS = {
  code: ['codigo', 'código', 'dmc code', 'number', 'numero', 'número', 'code', 'no', 'n'],
  name: ['nome', 'name', 'color name'],
  hex: ['hex', 'hexcode', 'hex code', 'cor'],
}

/**
 * CSV com cabeçalho. Aceita `codigo,nome,hex` e também planilhas de terceiros
 * (ex.: `Number,Name,HEX,RGB,CMYK`): as colunas são achadas pelo nome; colunas extras são ignoradas.
 * Linhas vazias e começando com # são ignoradas.
 */
export function parseYarnCsv(id: string, brand: string, line: string, csv: string): YarnPalette {
  const colors: YarnColor[] = []
  const rows = csv.replace(/^\uFEFF/, '').split(/\r?\n/).map((r) => r.trim()).filter((r) => r && !r.startsWith('#'))
  if (rows.length === 0) return { id, kind: 'croche', brand, line, colors }
  const head = splitCsvLine(rows[0]).map((h) => h.toLowerCase())
  const find = (names: string[], fallback: number) => {
    const i = head.findIndex((h) => names.includes(h))
    return i >= 0 ? i : fallback
  }
  const iCode = find(HEADERS.code, 0)
  const iName = find(HEADERS.name, 1)
  const iHex = find(HEADERS.hex, 2)
  for (const row of rows.slice(1)) {
    const cells = splitCsvLine(row)
    const code = cells[iCode]
    const raw = (cells[iHex] ?? '').toLowerCase()
    const hex = raw.startsWith('#') ? raw : `#${raw}`
    if (!code || !/^#[0-9a-f]{6}$/.test(hex)) continue
    colors.push({ code, name: cells[iName] ?? '', hex, lab: hexToLab(hex) })
  }
  return { id, kind: 'croche', brand, line, colors }
}

function ranked(hex: string, yarn: YarnPalette): YarnChoice[] {
  const lab = hexToLab(hex)
  return yarn.colors
    .map((y) => ({ yarn: y, deltaE: deltaE2000(lab, y.lab) }))
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
    if (m.count === 0) continue // cor que deixou de ser usada depois das edições
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
