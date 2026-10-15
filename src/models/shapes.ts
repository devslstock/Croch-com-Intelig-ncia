/**
 * Desenhos feitos de formas simples (círculos, elipses, retângulos, polígonos) numa caixa de 100 × 100.
 * São rasterizados no tamanho do gráfico, então ficam nítidos em qualquer largura.
 */
export type Shape =
  | { t: 'c'; x: number; y: number; r: number; f: string }
  | { t: 'e'; x: number; y: number; rx: number; ry: number; f: string; rot?: number }
  | { t: 'r'; x: number; y: number; w: number; h: number; f: string; rad?: number }
  | { t: 'p'; pts: Array<[number, number]>; f: string }

export const circle = (x: number, y: number, r: number, f: string): Shape => ({ t: 'c', x, y, r, f })
export const ellipse = (x: number, y: number, rx: number, ry: number, f: string, rot = 0): Shape => ({ t: 'e', x, y, rx, ry, f, rot })
export const rect = (x: number, y: number, w: number, h: number, f: string, rad = 0): Shape => ({ t: 'r', x, y, w, h, f, rad })
export const poly = (f: string, ...pts: Array<[number, number]>): Shape => ({ t: 'p', pts, f })

/** Coração de largura `s`, com o topo em (cx, cy). */
export function heart(cx: number, cy: number, s: number, f: string): Shape[] {
  return [
    circle(cx - 0.25 * s, cy + 0.25 * s, 0.25 * s, f),
    circle(cx + 0.25 * s, cy + 0.25 * s, 0.25 * s, f),
    poly(f, [cx - 0.25 * s, cy + 0.25 * s], [cx + 0.25 * s, cy + 0.25 * s], [cx + 0.46 * s, cy + 0.36 * s], [cx - 0.46 * s, cy + 0.36 * s]),
    poly(f, [cx - 0.46 * s, cy + 0.36 * s], [cx + 0.46 * s, cy + 0.36 * s], [cx, cy + 0.95 * s]),
  ]
}

/** Estrela de 5 pontas. */
export function star(cx: number, cy: number, R: number, f: string): Shape {
  const pts: Array<[number, number]> = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 === 0 ? R : R * 0.42
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return { t: 'p', pts, f }
}

export function covers(s: Shape, px: number, py: number): boolean {
  switch (s.t) {
    case 'c':
      return (px - s.x) ** 2 + (py - s.y) ** 2 <= s.r * s.r
    case 'e': {
      const a = ((s.rot ?? 0) * Math.PI) / 180
      const dx = px - s.x
      const dy = py - s.y
      const u = dx * Math.cos(a) + dy * Math.sin(a)
      const v = -dx * Math.sin(a) + dy * Math.cos(a)
      return (u / s.rx) ** 2 + (v / s.ry) ** 2 <= 1
    }
    case 'r': {
      if (px < s.x || py < s.y || px > s.x + s.w || py > s.y + s.h) return false
      const r = Math.min(s.rad ?? 0, s.w / 2, s.h / 2)
      if (r <= 0) return true
      const cx = Math.min(Math.max(px, s.x + r), s.x + s.w - r)
      const cy = Math.min(Math.max(py, s.y + r), s.y + s.h - r)
      return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
    }
    case 'p': {
      let inside = false
      const p = s.pts
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const [xi, yi] = p[i]
        const [xj, yj] = p[j]
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
      }
      return inside
    }
  }
}

/**
 * Desenha as formas numa grade `size` × `size`: cada ponto leva a cor que aparece mais dentro dele
 * (3 × 3 amostras). Devolve uma cor (hex) por ponto, de cima para baixo.
 */
export function rasterize(shapes: Shape[], colors: Record<string, string>, size: number, bg: string): string[] {
  const out: string[] = new Array(size * size)
  const SS = 3
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tally = new Map<string, number>()
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = ((x + (sx + 0.5) / SS) / size) * 100
          const py = ((y + (sy + 0.5) / SS) / size) * 100
          let hex = bg
          for (let i = shapes.length - 1; i >= 0; i--) {
            if (covers(shapes[i], px, py)) {
              hex = colors[shapes[i].f] ?? bg
              break
            }
          }
          tally.set(hex, (tally.get(hex) ?? 0) + 1)
        }
      }
      let best = bg
      let bestN = -1
      for (const [hex, n] of tally) {
        if (n > bestN) {
          best = hex
          bestN = n
        }
      }
      out[y * size + x] = best
    }
  }
  return out
}
