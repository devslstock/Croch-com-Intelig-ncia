import type { ChartResult } from '../engine/types'

/** Ponto baixo é um pouco mais baixo do que largo. */
const ASPECT = 0.85

const parse = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const mix = (hex: string, to: number, t: number) => {
  const [r, g, b] = parse(hex).map((v) => Math.round(v + (to - v) * t))
  return `rgb(${r},${g},${b})`
}

export function crochetSize(chart: ChartResult, cell: number) {
  const ch = Math.max(6, Math.round(cell * ASPECT))
  return { width: chart.width * cell, height: chart.height * ch, cellH: ch }
}

/** Prévia "Em crochê": cada ponto vira um V com sombra, para dar ideia da textura da peça pronta. */
export function drawCrochet(ctx: CanvasRenderingContext2D, chart: ChartResult, cell: number) {
  const { width, height, cellH } = crochetSize(chart, cell)
  const tones = chart.palette.map((p) => ({ base: p.hex, dark: mix(p.hex, 0, 0.45), light: mix(p.hex, 255, 0.3) }))

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (let y = 0; y < chart.height; y++) {
    for (let x = 0; x < chart.width; x++) {
      const t = tones[chart.grid[y * chart.width + x]]
      const px = x * cell
      const py = y * cellH
      ctx.fillStyle = t.dark
      ctx.fillRect(px, py, cell, cellH)

      const left = px + cell * 0.2
      const right = px + cell * 0.8
      const mid = px + cell * 0.5
      const top = py + cellH * 0.12
      const bottom = py + cellH * 0.92
      ctx.lineWidth = Math.max(2, cell * 0.3)
      ctx.strokeStyle = t.base
      ctx.beginPath()
      ctx.moveTo(left, top)
      ctx.lineTo(mid, bottom)
      ctx.lineTo(right, top)
      ctx.stroke()

      ctx.lineWidth = Math.max(1, cell * 0.09)
      ctx.strokeStyle = t.light
      ctx.beginPath()
      ctx.moveTo(left - cell * 0.03, top + cellH * 0.04)
      ctx.lineTo(mid - cell * 0.03, bottom - cellH * 0.1)
      ctx.stroke()
    }
  }
}
