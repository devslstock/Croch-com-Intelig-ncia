import type { ElementItem, PhotoView, Region, TextItem } from './project'

/** Contas puras do editor (sem desenhar nada): posição do texto curvo, toques e enquadramento. */

const DEG = Math.PI / 180

/** Onde a foto aparece dentro da área (mesma regra de `drawPhoto`): ponto da foto → fração da área. */
export function mapPhotoToFrame(bw: number, bh: number, fw: number, fh: number, view: PhotoView, x: number, y: number): { x: number; y: number } {
  const cover = Math.max(fw / bw, fh / bh) * view.zoom
  const dw = bw * cover
  const dh = bh * cover
  return { x: ((fw - dw) / 2 + view.x * fw + x * cover) / fw, y: ((fh - dh) / 2 + view.y * fh + y * cover) / fh }
}

/** Retângulo ou elipse a partir de dois cantos arrastados (ordenados e limitados a 0–1). */
export function normalizeRegion(shape: Region['shape'], x0: number, y0: number, x1: number, y1: number): Region {
  const c = (v: number) => Math.min(1, Math.max(0, v))
  return { shape, x0: Math.min(c(x0), c(x1)), y0: Math.min(c(y0), c(y1)), x1: Math.max(c(x0), c(x1)), y1: Math.max(c(y0), c(y1)) }
}

export const regionBigEnough = (r: Region) => r.x1 - r.x0 > 0.02 && r.y1 - r.y0 > 0.02

export interface ArcFrame {
  cx: number
  cy: number
  radius: number
  /** Ângulo (radianos) do meio do texto. */
  base: number
  /** +1: letras em cima do arco (convexo para cima); -1: embaixo. */
  dir: 1 | -1
}

/** Círculo em que o texto curvo se apoia. "Acima" e "abaixo" acompanham o centro do bastidor; "centro" é um arco suave no ponto do texto. */
export function arcFrame(t: TextItem, w: number, h: number): ArcFrame {
  const radius = Math.min(0.6, Math.max(0.15, t.radius ?? 0.36)) * w
  const rot = t.rotate * DEG
  if (t.place === 'abaixo') return { cx: w / 2, cy: h / 2, radius, base: Math.PI / 2 + rot, dir: -1 }
  if (t.place === 'acima') return { cx: w / 2, cy: h / 2, radius, base: -Math.PI / 2 + rot, dir: 1 }
  return { cx: t.x * w, cy: t.y * h + radius, radius, base: -Math.PI / 2 + rot, dir: 1 }
}

export interface PlacedChar {
  x: number
  y: number
  /** Rotação da letra, em radianos. */
  rot: number
}

/** Posição de cada letra ao longo do arco, dadas as larguras (em pixels) de cada letra. */
export function curvedLayout(t: TextItem, w: number, h: number, widths: number[]): PlacedChar[] {
  const f = arcFrame(t, w, h)
  const total = widths.reduce((a, b) => a + b, 0)
  let cum = 0
  return widths.map((cw) => {
    const s = cum + cw / 2 - total / 2
    cum += cw
    const a = s / f.radius
    const theta = f.dir === 1 ? f.base + a : f.base - a
    return { x: f.cx + f.radius * Math.cos(theta), y: f.cy + f.radius * Math.sin(theta), rot: f.dir === 1 ? theta + Math.PI / 2 : theta - Math.PI / 2 }
  })
}

/** O toque (em fração da área) acerta o texto curvo? `textWidth` é a largura do texto em pixels. */
export function hitCurved(t: TextItem, w: number, h: number, textWidth: number, fx: number, fy: number): boolean {
  const f = arcFrame(t, w, h)
  const px = fx * w - f.cx
  const py = fy * h - f.cy
  const dist = Math.hypot(px, py)
  const band = t.size * w * 0.75 + 6
  if (Math.abs(dist - f.radius) > band) return false
  let diff = Math.atan2(py, px) - f.base
  diff = Math.atan2(Math.sin(diff), Math.cos(diff))
  return Math.abs(diff) <= textWidth / (2 * f.radius) + 0.08
}

/** Arrastar o texto curvo em volta do bastidor: novo valor de `rotate` (graus) para o ponteiro em (fx, fy). */
export function curvedRotateFor(t: TextItem, w: number, h: number, fx: number, fy: number): number {
  const f = arcFrame({ ...t, rotate: 0 }, w, h)
  const ang = Math.atan2(fy * h - f.cy, fx * w - f.cx)
  let diff = ang - f.base
  diff = Math.atan2(Math.sin(diff), Math.cos(diff))
  return Math.round(Math.max(-180, Math.min(180, diff / DEG)))
}

/** O toque (em fração da área) acerta o desenho? (caixa quadrada girada) */
export function hitElement(e: ElementItem, w: number, h: number, fx: number, fy: number): boolean {
  const dx = fx * w - e.x * w
  const dy = fy * h - e.y * h
  const a = -e.rotate * DEG
  const rx = dx * Math.cos(a) - dy * Math.sin(a)
  const ry = dx * Math.sin(a) + dy * Math.cos(a)
  const half = (e.size * w) / 2
  return Math.abs(rx) <= half && Math.abs(ry) <= half
}
