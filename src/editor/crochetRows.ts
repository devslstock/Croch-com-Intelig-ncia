import type { StartSide } from '../engine/types'

export interface Run {
  /** Índice da cor na paleta. */
  color: number
  count: number
}

export interface RowGuide {
  /** Carreira (1 = a de baixo). */
  row: number
  /** De que lado a carreira começa a ser trabalhada. */
  from: StartSide
  runs: Run[]
  total: number
}

const opposite = (s: StartSide): StartSide => (s === 'right' ? 'left' : 'right')

/**
 * Passo a passo de uma carreira: pontos seguidos da mesma cor, na ordem em que se trabalha.
 * Carreiras de baixo para cima. A carreira 1 começa pelo lado escolhido; com `alternate`,
 * as seguintes mudam de lado (trabalho em idas e vindas).
 */
export function rowGuide(grid: Uint8Array, w: number, h: number, row: number, startSide: StartSide, alternate = true): RowGuide {
  const y = h - row
  const from = alternate && row % 2 === 0 ? opposite(startSide) : startSide
  const runs: Run[] = []
  for (let i = 0; i < w; i++) {
    const x = from === 'right' ? w - 1 - i : i
    const c = grid[y * w + x]
    const last = runs[runs.length - 1]
    if (last && last.color === c) last.count++
    else runs.push({ color: c, count: 1 })
  }
  return { row, from, runs, total: w }
}
