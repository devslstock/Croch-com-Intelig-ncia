import type { ShoppingItem } from '../yarn/yarn'

export interface ShoppingSheet {
  title: string
  yarnName: string
  width: number
  height: number
  items: ShoppingItem[]
}

const W = 760
const PAD = 24
const ROW = 40
const SCALE = 2 // nítido em tela de celular; a imagem final continua pequena

const isDark = (hex: string) =>
  0.299 * parseInt(hex.slice(1, 3), 16) + 0.587 * parseInt(hex.slice(3, 5), 16) + 0.114 * parseInt(hex.slice(5, 7), 16) < 140

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function chip(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): number {
  ctx.font = '12px sans-serif'
  const w = ctx.measureText(text).width + 20
  roundRect(ctx, x, y, w, 26, 13)
  ctx.fillStyle = '#f7efe6'
  ctx.fill()
  ctx.strokeStyle = '#e3d3c0'
  ctx.stroke()
  ctx.fillStyle = '#4a3b2f'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + 10, y + 14)
  return w + 8
}

/** Lista de compras como uma única imagem PNG, desenhada direto em canvas (sem biblioteca de PDF). */
export function shoppingSheetToPng(sheet: ShoppingSheet): Promise<Blob> {
  const total = sheet.items.reduce((s, i) => s + i.stitches, 0)
  const headTop = PAD + 80
  const height = headTop + 30 + sheet.items.length * ROW + 70

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = height * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, height)
  ctx.fillStyle = '#f7bfd2'
  ctx.fillRect(0, 0, W, 5)

  ctx.fillStyle = '#2a2230'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = 'bold 22px sans-serif'
  ctx.fillText(sheet.title, PAD, PAD + 18)

  let cx = PAD
  const cy = PAD + 34
  cx += chip(ctx, sheet.yarnName, cx, cy)
  cx += chip(ctx, `${sheet.items.length} fios`, cx, cy)
  chip(ctx, `${sheet.width} × ${sheet.height} pontos`, cx, cy)

  const cols = { cor: PAD, code: PAD + 56, name: PAD + 130, pts: PAD + 300, alt: PAD + 410 }
  ctx.font = 'bold 11px sans-serif'
  ctx.fillStyle = '#7b6f82'
  ctx.textBaseline = 'middle'
  const hy = headTop + 8
  ctx.fillText('COR', cols.cor, hy)
  ctx.fillText('CÓDIGO', cols.code, hy)
  ctx.fillText('NOME', cols.name, hy)
  ctx.fillText('PONTOS', cols.pts, hy)
  ctx.fillText('SE NÃO ACHAR, LEVE', cols.alt, hy)

  sheet.items.forEach((item, i) => {
    const y = headTop + 24 + i * ROW
    const mid = y + ROW / 2
    ctx.strokeStyle = '#eee5ea'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD, y + ROW)
    ctx.lineTo(W - PAD, y + ROW)
    ctx.stroke()

    // Cor: quadradinho com a letra do gráfico (A, B, C…), como na legenda.
    roundRect(ctx, cols.cor, mid - 12, 24, 24, 5)
    ctx.fillStyle = item.yarn.hex
    ctx.fill()
    ctx.fillStyle = isDark(item.yarn.hex) ? '#ffffff' : '#000000'
    ctx.font = 'bold 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(item.letters[0], cols.cor + 12, mid + 1)

    ctx.textAlign = 'left'
    ctx.fillStyle = '#2a2230'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText(item.yarn.code, cols.code, mid)
    ctx.font = '14px sans-serif'
    ctx.fillText(item.yarn.name, cols.name, mid, 160)
    const pct = total ? Math.round((item.stitches / total) * 100) : 0
    ctx.fillText(`${item.stitches.toLocaleString('pt-BR')} (${pct}%)`, cols.pts, mid)

    let ax = cols.alt
    ctx.font = '12px sans-serif'
    for (const s of item.substitutes) {
      ctx.fillStyle = s.yarn.hex
      roundRect(ctx, ax, mid - 6, 12, 12, 2)
      ctx.fill()
      ctx.fillStyle = '#2a2230'
      const label = `${s.yarn.code} ${s.yarn.name}`
      ctx.fillText(label, ax + 17, mid, 110)
      ax += 17 + Math.min(110, ctx.measureText(label).width) + 12
    }
  })

  ctx.fillStyle = '#7b6f82'
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Cores aproximadas. Leve o gráfico impresso e compare com o novelo na loja.', W / 2, height - 36)
  ctx.fillText('Os fios sugeridos como substitutos não repetem nenhum fio que já está no gráfico.', W / 2, height - 20)

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem'))), 'image/png'),
  )
}
