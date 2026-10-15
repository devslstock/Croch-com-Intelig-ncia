import { labToHex, rgbToLab } from '../engine/color'
import type { ChartResult, PaletteEntry } from '../engine/types'
import { renderText } from '../editor/font'
import type { Model } from './library'
import { rasterize } from './shapes'

export interface ModelOptions {
  name: string
  date: string
  textColor: string
  /** Largura do gráfico em pontos. */
  width: number
  /** Usa a cor de fundo do modelo (senão, branco). */
  withBg: boolean
}

export const MODEL_MIN_WIDTH = 30
export const MODEL_MAX_WIDTH = 110
export const WHITE = '#ffffff'
export const RECIPE_MIN_WIDTH = 66

const SYMBOLS = ['●', '■', '▲', '◆', '✚', '✖', '★', '○', '□', '△', '◇', '♥', '♣', '♠', '▼', '◐', '◑', '☀', '☂', '✿']
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

const hexL = (hex: string) => rgbToLab(...([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]))[0]

/** Cores (hex) por ponto → grade de índices + paleta ordenada do mais claro ao mais escuro, com letras A, B, C… */
export function toChart(width: number, height: number, cells: string[]): ChartResult {
  const counts = new Map<string, number>()
  for (const c of cells) counts.set(c, (counts.get(c) ?? 0) + 1)
  const order = [...counts.keys()].sort((a, b) => hexL(b) - hexL(a) || a.localeCompare(b))
  const index = new Map(order.map((hex, i) => [hex, i]))
  const grid = new Uint8Array(cells.length)
  cells.forEach((c, i) => { grid[i] = index.get(c)! })
  const palette: PaletteEntry[] = order.map((hex, i) => ({ letter: LETTERS[i] ?? String(i), symbol: SYMBOLS[i] ?? '?', hex: labToHex(...rgbToLab(...([1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)) as [number, number, number]))), count: counts.get(hex)! }))
  return { width, height, grid, palette }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)))

/** Monta o gráfico de um modelo: nome em cima, desenho no meio e data embaixo. */
export function composeModel(model: Model, o: ModelOptions): ChartResult {
  // Receitas precisam de largura para a fileira inteira de letras.
  const W = Math.max(clamp(o.width, MODEL_MIN_WIDTH, MODEL_MAX_WIDTH), model.recipe ? RECIPE_MIN_WIDTH : 0)
  const bg = o.withBg ? model.bg : WHITE

  if (model.recipe) return composeRecipe(model, W, bg, o.textColor)

  const nameRes = !model.plain && o.name.trim() ? renderText(o.name, 'auto', W - 4) : null
  const dateRes = !model.plain && o.date.trim() ? renderText(o.date, 'fina', W - 4) : null
  const A = W - 6 // lado do desenho
  const nameH = nameRes ? nameRes.mask.h : 0
  const dateH = dateRes ? dateRes.mask.h : 0
  const top = 2 + (nameH ? nameH + 3 : 1)
  const H = top + A + (dateH ? 3 + dateH + 2 : 3)

  const cells = new Array<string>(W * H).fill(bg)
  const art = rasterize(model.art, { ...model.colors, bg }, A, bg)
  for (let y = 0; y < A; y++) for (let x = 0; x < A; x++) cells[(top + y) * W + 3 + x] = art[y * A + x]

  if (nameRes) place(cells, W, nameRes.mask, 2, o.textColor)
  if (dateRes) place(cells, W, dateRes.mask, top + A + 3, o.textColor)

  return toChart(W, H, cells)
}

/** Escreve uma máscara de letras nos pontos, centralizada, a partir da linha `y0`. */
function place(cells: string[], W: number, mask: { w: number; h: number; bits: Uint8Array }, y0: number, color: string) {
  const x0 = Math.floor((W - mask.w) / 2)
  for (let y = 0; y < mask.h; y++) {
    for (let x = 0; x < mask.w; x++) {
      const i = (y0 + y) * W + x0 + x
      if (mask.bits[y * mask.w + x] && x0 + x >= 0 && x0 + x < W && i < cells.length) cells[i] = color
    }
  }
}

function composeRecipe(model: Model, W: number, bg: string, color: string): ChartResult {
  const text = model.recipe === 'alfabeto' ? 'ABCDEFGHIJK\nLMNOPQRSTUV\nWXYZ' : '0123456789'
  const res = renderText(text, 'fina', W - 4)!
  const H = res.mask.h + 6
  const cells = new Array<string>(W * H).fill(bg)
  place(cells, W, res.mask, 3, color)
  return toChart(W, H, cells)
}
