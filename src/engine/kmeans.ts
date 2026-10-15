import type { Lab } from './color'

/** Gerador pseudoaleatório com semente: mesma foto + mesmos parâmetros = mesmo gráfico. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface KMeansResult {
  /** Centros livres primeiro, depois os fixos. */
  centers: Lab[]
  assign: Uint16Array
}

/**
 * k-means++ em Lab. `points` guarda n trios (L, a, b) contíguos.
 * `fixed` são centros que nunca se movem (cores de destaque).
 */
export function kmeans(
  points: Float32Array,
  k: number,
  seed: number,
  fixed: Lab[] = [],
  maxIter = 20,
): KMeansResult {
  const n = points.length / 3
  const rng = mulberry32(seed)
  const centers: Lab[] = []
  const d2 = new Float64Array(n).fill(Infinity)

  const dist2 = (i: number, c: Lab) => {
    const dl = points[i * 3] - c[0]
    const da = points[i * 3 + 1] - c[1]
    const db = points[i * 3 + 2] - c[2]
    return dl * dl + da * da + db * db
  }
  const absorb = (c: Lab) => {
    for (let i = 0; i < n; i++) d2[i] = Math.min(d2[i], dist2(i, c))
  }

  for (const f of fixed) absorb(f)

  for (let c = 0; c < k; c++) {
    let idx = -1
    if (c === 0 && fixed.length === 0) {
      idx = Math.floor(rng() * n)
    } else {
      let total = 0
      for (let i = 0; i < n; i++) total += d2[i]
      if (total <= 0) break // menos cores distintas do que k
      let r = rng() * total
      for (let i = 0; i < n; i++) {
        r -= d2[i]
        if (r <= 0) {
          idx = i
          break
        }
      }
      if (idx < 0) idx = n - 1
    }
    const center: Lab = [points[idx * 3], points[idx * 3 + 1], points[idx * 3 + 2]]
    centers.push(center)
    absorb(center)
  }

  const free = centers.length
  const all = [...centers, ...fixed]
  const assign = new Uint16Array(n)
  const sums = new Float64Array(free * 3)
  const counts = new Uint32Array(free)

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = 0
    sums.fill(0)
    counts.fill(0)
    for (let i = 0; i < n; i++) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < all.length; c++) {
        const d = dist2(i, all[c])
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      if (assign[i] !== best || iter === 0) changed++
      assign[i] = best
      if (best < free) {
        sums[best * 3] += points[i * 3]
        sums[best * 3 + 1] += points[i * 3 + 1]
        sums[best * 3 + 2] += points[i * 3 + 2]
        counts[best]++
      }
    }
    for (let c = 0; c < free; c++) {
      if (counts[c] > 0) {
        all[c] = [sums[c * 3] / counts[c], sums[c * 3 + 1] / counts[c], sums[c * 3 + 2] / counts[c]]
      }
    }
    if (changed === 0) break
  }

  return { centers: all, assign }
}
