import { labToHex, rgbToLab, type Lab } from './color'
import { kmeans } from './kmeans'
import type { ChartResult, EngineParams, PaletteEntry, RawImage } from './types'

const SEED = 1337
export const MIN_WIDTH = 20
export const MAX_WIDTH = 150
export const MIN_COLORS = 1
export const MAX_COLORS = 24
const MAX_HIGHLIGHTS = 2
const SYMBOLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const PRINT_SYMBOLS = ['●', '■', '▲', '◆', '✚', '✖', '★', '○', '□', '△', '◇', '♥', '♣', '♠', '▼', '◐', '◑', '☀', '☂', '✿', '▣', '▤', '▥', '▦', '▧', '▨']

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Reduz a imagem para `w` × `h` células usando a média por área (não o pixel do centro). */
export function resizeArea(img: RawImage, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h * 3) // RGB 0–255
  const sx = img.width / w
  const sy = img.height / h
  for (let y = 0; y < h; y++) {
    const y0 = y * sy
    const y1 = (y + 1) * sy
    for (let x = 0; x < w; x++) {
      const x0 = x * sx
      const x1 = (x + 1) * sx
      let r = 0
      let g = 0
      let b = 0
      let wt = 0
      for (let py = Math.floor(y0); py < Math.min(img.height, Math.ceil(y1)); py++) {
        const wy = Math.min(y1, py + 1) - Math.max(y0, py)
        for (let px = Math.floor(x0); px < Math.min(img.width, Math.ceil(x1)); px++) {
          const wx = Math.min(x1, px + 1) - Math.max(x0, px)
          const w2 = wx * wy
          const i = (py * img.width + px) * 4
          const a = img.data[i + 3] / 255
          // Transparência vira fundo branco.
          r += (img.data[i] * a + 255 * (1 - a)) * w2
          g += (img.data[i + 1] * a + 255 * (1 - a)) * w2
          b += (img.data[i + 2] * a + 255 * (1 - a)) * w2
          wt += w2
        }
      }
      const o = (y * w + x) * 3
      out[o] = r / wt
      out[o + 1] = g / wt
      out[o + 2] = b / wt
    }
  }
  return out
}

/**
 * Procura pequenas regiões de cor muito distante dos centros (olhos, dentes, lábios)
 * e devolve centros extras para serem fixados antes do k-means final.
 */
function findHighlights(points: Float32Array, centers: Lab[], max: number): Lab[] {
  const n = points.length / 3
  const found: Lab[] = []
  const skip = new Uint8Array(n)
  const dist = (i: number, c: Lab) => {
    const dl = points[i * 3] - c[0]
    const da = points[i * 3 + 1] - c[1]
    const db = points[i * 3 + 2] - c[2]
    return Math.sqrt(dl * dl + da * da + db * db)
  }
  const nearest = (i: number, extra: Lab[]) => {
    let d = Infinity
    for (const c of centers) d = Math.min(d, dist(i, c))
    for (const c of extra) d = Math.min(d, dist(i, c))
    return d
  }
  const minCount = Math.max(3, Math.round(n * 0.002))
  const maxCount = Math.round(n * 0.05)

  for (let tries = 0; tries < max * 4 && found.length < max; tries++) {
    let far = -1
    let farD = 22
    for (let i = 0; i < n; i++) {
      if (skip[i]) continue
      const d = nearest(i, found)
      if (d > farD) {
        farD = d
        far = i
      }
    }
    if (far < 0) break
    const seed: Lab = [points[far * 3], points[far * 3 + 1], points[far * 3 + 2]]
    let cnt = 0
    const sum = [0, 0, 0]
    const members: number[] = []
    for (let i = 0; i < n; i++) {
      if (dist(i, seed) < 15 && nearest(i, found) > 18) {
        members.push(i)
        sum[0] += points[i * 3]
        sum[1] += points[i * 3 + 1]
        sum[2] += points[i * 3 + 2]
        cnt++
      }
    }
    if (cnt >= minCount && cnt <= maxCount) {
      found.push([sum[0] / cnt, sum[1] / cnt, sum[2] / cnt])
    } else {
      for (const i of members) skip[i] = 1
      skip[far] = 1
    }
  }
  return found
}

const NEIGHBORS: Array<[number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
]

/** Filtro de maioria 3×3: pontos sem nenhum vizinho da mesma cor assumem a cor mais comum ao redor. */
function removeIsolated(grid: Uint8Array, w: number, h: number, passes: number) {
  for (let p = 0; p < passes; p++) {
    const next = grid.slice()
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const me = grid[y * w + x]
        const tally = new Map<number, number>()
        for (const [dx, dy] of NEIGHBORS) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const c = grid[ny * w + nx]
          tally.set(c, (tally.get(c) ?? 0) + 1)
        }
        if ((tally.get(me) ?? 0) > 0) continue
        let best = me
        let bestN = 0
        for (const [c, cnt] of tally) {
          if (cnt > bestN || (cnt === bestN && c < best)) {
            best = c
            bestN = cnt
          }
        }
        next[y * w + x] = best
      }
    }
    grid.set(next)
  }
}

/** Regiões conectadas (4 vizinhos) menores que `minSize` são absorvidas pela cor vizinha mais comum. */
function removeSmallRegions(grid: Uint8Array, w: number, h: number, minSize: number) {
  const seen = new Uint8Array(w * h)
  const stack: number[] = []
  for (let start = 0; start < w * h; start++) {
    if (seen[start]) continue
    const color = grid[start]
    const region: number[] = []
    const border = new Map<number, number>()
    stack.push(start)
    seen[start] = 1
    while (stack.length) {
      const cur = stack.pop()!
      region.push(cur)
      const cx = cur % w
      const cy = (cur - cx) / w
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx
        const ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const ni = ny * w + nx
        if (grid[ni] === color) {
          if (!seen[ni]) {
            seen[ni] = 1
            stack.push(ni)
          }
        } else {
          border.set(grid[ni], (border.get(grid[ni]) ?? 0) + 1)
        }
      }
    }
    if (region.length < minSize && border.size > 0) {
      let best = -1
      let bestN = 0
      for (const [c, cnt] of border) {
        if (cnt > bestN || (cnt === bestN && c < best)) {
          best = c
          bestN = cnt
        }
      }
      for (const i of region) grid[i] = best
    }
  }
}

/** Converte uma imagem já recortada em grade de pontos + paleta. Determinístico. */
export function buildChart(img: RawImage, params: EngineParams): ChartResult {
  const width = clamp(Math.round(params.width), MIN_WIDTH, MAX_WIDTH)
  const height = Math.max(1, Math.round((img.height * width) / img.width))
  const n = width * height

  const rgb = resizeArea(img, width, height)
  const points = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const [l, a, b] = rgbToLab(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2])
    points[i * 3] = l
    points[i * 3 + 1] = params.style === 'pb' ? 0 : a
    points[i * 3 + 2] = params.style === 'pb' ? 0 : b
  }

  const k = clamp(Math.round(params.colors), MIN_COLORS, MAX_COLORS)
  const first = kmeans(points, k, SEED)
  const highlights = params.style === 'pb' ? [] : findHighlights(points, first.centers, MAX_HIGHLIGHTS)
  const final = highlights.length ? kmeans(points, k, SEED, highlights) : first

  const grid = new Uint8Array(n)
  for (let i = 0; i < n; i++) grid[i] = final.assign[i]

  if (params.cleanSpeckles) {
    removeIsolated(grid, width, height, 2)
    removeSmallRegions(grid, width, height, 3)
  }

  // Descarta cores sem pontos e ordena da mais clara para a mais escura.
  const counts = new Array<number>(final.centers.length).fill(0)
  for (let i = 0; i < n; i++) counts[grid[i]]++
  const order = final.centers
    .map((c, i) => ({ c, i }))
    .filter((e) => counts[e.i] > 0)
    .sort((a, b) => b.c[0] - a.c[0] || a.i - b.i)
  const remap = new Map<number, number>()
  order.forEach((e, idx) => remap.set(e.i, idx))
  for (let i = 0; i < n; i++) grid[i] = remap.get(grid[i])!

  const palette: PaletteEntry[] = order.map((e, idx) => ({
    letter: SYMBOLS[idx] ?? String(idx),
    symbol: PRINT_SYMBOLS[idx] ?? SYMBOLS[idx] ?? '?',
    hex: labToHex(e.c[0], e.c[1], e.c[2]),
    count: counts[e.i],
  }))

  return { width, height, grid, palette }
}
