import type { ChartResult, StartSide } from '../engine/types'

export interface RenderOptions {
  cell: number
  symbols: boolean
  startSide: StartSide
  /** Desenha a legenda (letra, cor e quantidade de pontos) abaixo do gráfico. */
  legend: boolean
  /** Fio escolhido por letra ("8176 Off-White"), mostrado na legenda. */
  legendLabels?: Record<string, string>
  /** Modo Crochetar: carreiras já feitas (de baixo para cima). As feitas ficam esmaecidas e a próxima, em destaque. */
  progress?: number
  /** Modo Crochetar: pontos já feitos na carreira atual, contados a partir do lado em que ela começa. */
  rowDone?: { from: StartSide; count: number }
}

export const MARGIN = 30
const LEGEND_ROW = 26

function isDark(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b < 140
}

/** Número da coluna: a carreira 1 começa pelo lado escolhido. */
export const colNumber = (x: number, w: number, side: StartSide) => (side === 'right' ? w - x : x + 1)
/** Carreiras numeradas de baixo para cima. */
export const rowNumber = (y: number, h: number) => h - y

export function canvasSize(chart: ChartResult, o: RenderOptions) {
  const legendRows = o.legend ? Math.ceil(chart.palette.length / 2) : 0
  return {
    width: chart.width * o.cell + MARGIN * 2,
    height: chart.height * o.cell + MARGIN * 2 + (o.legend ? 16 + legendRows * LEGEND_ROW : 0),
  }
}

export function drawChart(ctx: CanvasRenderingContext2D, chart: ChartResult, o: RenderOptions) {
  const { width: w, height: h, grid, palette } = chart
  const { cell, startSide } = o
  const size = canvasSize(chart, o)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size.width, size.height)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const symbolFont = `${Math.max(8, Math.floor(cell * 0.7))}px sans-serif`

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = palette[grid[y * w + x]]
      const px = MARGIN + x * cell
      const py = MARGIN + y * cell
      ctx.fillStyle = p.hex
      ctx.fillRect(px, py, cell, cell)
      if (o.symbols && cell >= 10) {
        ctx.fillStyle = isDark(p.hex) ? '#ffffff' : '#000000'
        ctx.font = symbolFont
        ctx.fillText(p.letter, px + cell / 2, py + cell / 2 + 1)
      }
    }
  }

  // Linhas finas em todos os pontos, grossas a cada 10 pontos / 10 carreiras.
  const gridLeft = MARGIN
  const gridTop = MARGIN
  const gridW = w * cell
  const gridH = h * cell
  if (cell >= 6) {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x <= w; x++) {
      ctx.moveTo(gridLeft + x * cell + 0.5, gridTop)
      ctx.lineTo(gridLeft + x * cell + 0.5, gridTop + gridH)
    }
    for (let y = 0; y <= h; y++) {
      ctx.moveTo(gridLeft, gridTop + y * cell + 0.5)
      ctx.lineTo(gridLeft + gridW, gridTop + y * cell + 0.5)
    }
    ctx.stroke()
  }
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let x = 0; x <= w; x++) {
    const dist = startSide === 'right' ? w - x : x
    if (dist % 10 === 0) {
      ctx.moveTo(gridLeft + x * cell, gridTop)
      ctx.lineTo(gridLeft + x * cell, gridTop + gridH)
    }
  }
  for (let y = 0; y <= h; y++) {
    if ((h - y) % 10 === 0) {
      ctx.moveTo(gridLeft, gridTop + y * cell)
      ctx.lineTo(gridLeft + gridW, gridTop + y * cell)
    }
  }
  ctx.stroke()
  ctx.strokeRect(gridLeft, gridTop, gridW, gridH)

  // Modo Crochetar: esmaece as carreiras feitas e contorna a próxima.
  if (o.progress !== undefined) {
    const done = Math.max(0, Math.min(h, o.progress))
    if (done > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fillRect(gridLeft, gridTop + (h - done) * cell, gridW, done * cell)
    }
    if (done < h && o.rowDone && o.rowDone.count > 0) {
      const n = Math.min(w, o.rowDone.count)
      const x0 = o.rowDone.from === 'right' ? w - n : 0
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fillRect(gridLeft + x0 * cell, gridTop + (h - done - 1) * cell, n * cell, cell)
    }
    if (done < h) {
      ctx.strokeStyle = '#7a3b5e'
      ctx.lineWidth = 3
      ctx.strokeRect(gridLeft + 1.5, gridTop + (h - done - 1) * cell + 1.5, gridW - 3, cell - 3)
    }
  }

  // Números nos quatro lados.
  ctx.fillStyle = '#222222'
  ctx.font = '11px sans-serif'
  const every = cell >= 12 ? 5 : 10
  for (let x = 0; x < w; x++) {
    const n = colNumber(x, w, startSide)
    if (n === 1 || n % every === 0) {
      const cx = gridLeft + x * cell + cell / 2
      ctx.fillText(String(n), cx, MARGIN / 2)
      ctx.fillText(String(n), cx, gridTop + gridH + MARGIN / 2)
    }
  }
  for (let y = 0; y < h; y++) {
    const n = rowNumber(y, h)
    if (n === 1 || n % every === 0) {
      const cy = gridTop + y * cell + cell / 2
      ctx.fillText(String(n), MARGIN / 2, cy)
      ctx.fillText(String(n), gridLeft + gridW + MARGIN / 2, cy)
    }
  }

  if (o.legend) {
    const top = gridTop + gridH + MARGIN + 16
    const colW = size.width / 2
    ctx.textAlign = 'left'
    ctx.font = '13px sans-serif'
    palette.forEach((p, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const lx = 12 + col * colW
      const ly = top + row * LEGEND_ROW
      ctx.fillStyle = p.hex
      ctx.fillRect(lx, ly - 9, 20, 18)
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 1
      ctx.strokeRect(lx + 0.5, ly - 8.5, 20, 18)
      ctx.fillStyle = '#222222'
      ctx.fillText(`${p.letter}  ${o.legendLabels?.[p.letter] ? o.legendLabels[p.letter] + ' · ' : ''}${p.count} pontos`, lx + 28, ly)
    })
  }
}

export function chartToPngBlob(chart: ChartResult, o: Omit<RenderOptions, 'legend'>): Promise<Blob> {
  const opts: RenderOptions = { ...o, legend: true }
  const size = canvasSize(chart, opts)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  drawChart(canvas.getContext('2d')!, chart, opts)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem'))), 'image/png'))
}
