import type { PaletteEntry } from '../engine/types'
import type { Mask, Placement } from './font'

/** Todas as edições devolvem uma grade NOVA (ou null se nada mudou): isso deixa o desfazer trivial. */

export function paintCell(grid: Uint8Array, w: number, h: number, x: number, y: number, color: number): Uint8Array | null {
  if (x < 0 || y < 0 || x >= w || y >= h) return null
  const i = y * w + x
  if (grid[i] === color) return null
  const next = grid.slice()
  next[i] = color
  return next
}

/** Balde: troca a cor da região de pontos vizinhos (4 direções) que tem a mesma cor do ponto tocado. */
export function floodFill(grid: Uint8Array, w: number, h: number, x: number, y: number, color: number): Uint8Array | null {
  if (x < 0 || y < 0 || x >= w || y >= h) return null
  const from = grid[y * w + x]
  if (from === color) return null
  const next = grid.slice()
  const stack = [y * w + x]
  next[y * w + x] = color
  while (stack.length) {
    const cur = stack.pop()!
    const cx = cur % w
    const cy = (cur - cx) / w
    if (cx > 0 && next[cur - 1] === from) { next[cur - 1] = color; stack.push(cur - 1) }
    if (cx < w - 1 && next[cur + 1] === from) { next[cur + 1] = color; stack.push(cur + 1) }
    if (cy > 0 && next[cur - w] === from) { next[cur - w] = color; stack.push(cur - w) }
    if (cy < h - 1 && next[cur + w] === from) { next[cur + w] = color; stack.push(cur + w) }
  }
  return next
}

export function maskOrigin(mask: Mask, w: number, h: number, placement: Placement): { x0: number; y0: number } {
  const x0 = Math.floor((w - mask.w) / 2)
  const margin = 2
  const y0 = placement === 'topo' ? margin : placement === 'base' ? h - mask.h - margin : Math.floor((h - mask.h) / 2)
  return { x0, y0: Math.max(0, y0) }
}

/** Escreve o texto (máscara) no gráfico, em cima, no meio ou embaixo, sempre centralizado. */
export function stampMask(grid: Uint8Array, w: number, h: number, mask: Mask, placement: Placement, color: number): Uint8Array | null {
  const { x0, y0 } = maskOrigin(mask, w, h, placement)
  const next = grid.slice()
  let changed = false
  for (let yy = 0; yy < mask.h; yy++) {
    for (let xx = 0; xx < mask.w; xx++) {
      if (!mask.bits[yy * mask.w + xx]) continue
      const x = x0 + xx
      const y = y0 + yy
      if (x < 0 || y < 0 || x >= w || y >= h) continue
      if (next[y * w + x] !== color) {
        next[y * w + x] = color
        changed = true
      }
    }
  }
  return changed ? next : null
}

/** Atualiza a contagem de pontos de cada cor depois de editar. */
export function recount(grid: Uint8Array, palette: PaletteEntry[]): PaletteEntry[] {
  const counts = new Array<number>(palette.length).fill(0)
  for (let i = 0; i < grid.length; i++) counts[grid[i]]++
  return palette.map((p, i) => ({ ...p, count: counts[i] }))
}

export interface History {
  past: Uint8Array[]
  future: Uint8Array[]
}
export const EMPTY_HISTORY: History = { past: [], future: [] }
const LIMIT = 100

export const pushHistory = (h: History, current: Uint8Array): History => ({ past: [...h.past.slice(-(LIMIT - 1)), current], future: [] })

export function undo(h: History, current: Uint8Array): { history: History; grid: Uint8Array } | null {
  const prev = h.past[h.past.length - 1]
  if (!prev) return null
  return { grid: prev, history: { past: h.past.slice(0, -1), future: [...h.future, current] } }
}

export function redo(h: History, current: Uint8Array): { history: History; grid: Uint8Array } | null {
  const next = h.future[h.future.length - 1]
  if (!next) return null
  return { grid: next, history: { past: [...h.past, current], future: h.future.slice(0, -1) } }
}
