import type { RawImage } from '../engine/types'
import { buildPdfPages, SHEET, sheetGrid } from './pdfPages'
import { FONTS, hoopCm, type EmbProject, type Hoop, type PhotoView, type TextItem } from './project'
import { computeInk } from './engine/client'
import { projectMethod, projectParams } from './project'

/** Funções de desenho (precisam do navegador). O risco é uma camada de linhas; borracha e textos vão por cima. */

const INK = '#2b2b2b'
export const PX_PER_CM_EXPORT = 80 // ~200 dpi

export function canvasSize(hoop: Hoop, longSide: number): { w: number; h: number } {
  const c = hoopCm(hoop)
  const k = longSide / Math.max(c.w, c.h)
  return { w: Math.round(c.w * k), h: Math.round(c.h * k) }
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Desenha a foto na área do bastidor: zoom 1 = a foto cobre a área; x, y deslocam o centro. */
export function drawPhoto(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, w: number, h: number, view: PhotoView) {
  const cover = Math.max(w / img.width, h / img.height) * view.zoom
  const dw = img.width * cover
  const dh = img.height * cover
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, (w - dw) / 2 + view.x * w, (h - dh) / 2 + view.y * h, dw, dh)
}

/** O que está dentro do bastidor, como pixels (usado para o risco e para a paleta). */
export function photoRaw(img: CanvasImageSource & { width: number; height: number }, hoop: Hoop, view: PhotoView, longSide: number): RawImage {
  const { w, h } = canvasSize(hoop, longSide)
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  drawPhoto(ctx, img, w, h, view)
  const d = ctx.getImageData(0, 0, w, h)
  return { data: d.data, width: w, height: h }
}

/** Camada de linhas (fundo transparente) a partir da foto já enquadrada. */
export async function buildLineLayer(raw: RawImage, p: EmbProject, scale?: number, channel: 'preview' | 'export' = 'preview'): Promise<HTMLCanvasElement> {
  const ink = await computeInk(raw, projectMethod(p), projectParams(p), scale ?? Math.max(raw.width, raw.height) / 900, channel)
  const c = makeCanvas(raw.width, raw.height)
  const ctx = c.getContext('2d')!
  const out = ctx.createImageData(raw.width, raw.height)
  for (let i = 0; i < ink.length; i++) {
    out.data[i * 4] = 0x2b
    out.data[i * 4 + 1] = 0x2b
    out.data[i * 4 + 2] = 0x2b
    out.data[i * 4 + 3] = ink[i]
  }
  ctx.putImageData(out, 0, 0)
  return c
}

export const fontCss = (id: TextItem['font']) => FONTS.find((f) => f.id === id)?.css ?? FONTS[0].css

export function setTextFont(ctx: CanvasRenderingContext2D, t: TextItem, w: number) {
  ctx.font = `${Math.max(6, t.size * w)}px ${fontCss(t.font)}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
}

/** Caixa do texto (em fração da largura da área), sem a rotação: serve para tocar e escolher. */
export function textBox(ctx: CanvasRenderingContext2D, t: TextItem, w: number): { w: number; h: number } {
  ctx.save()
  setTextFont(ctx, t, w)
  const m = ctx.measureText(t.text || ' ')
  ctx.restore()
  return { w: m.width / w, h: (t.size * 1.25) }
}

/**
 * Risco final: fundo branco, linhas, partes apagadas (borracha) e textos.
 * `guides` desenha o contorno do bastidor e o centro (só na impressão, para posicionar).
 */
export function composeRisco(lines: HTMLCanvasElement, p: EmbProject, w: number, h: number, opts: { guides?: boolean; mirror?: boolean } = {}): HTMLCanvasElement {
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(lines, 0, 0, w, h)

  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of p.strokes) {
    ctx.lineWidth = Math.max(2, s.r * w * 2)
    ctx.beginPath()
    s.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * w, y * h) : ctx.lineTo(x * w, y * h)))
    if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] * w + 0.01, s.pts[0][1] * h)
    ctx.stroke()
  }

  ctx.fillStyle = INK
  for (const t of p.texts) {
    if (!t.text.trim()) continue
    ctx.save()
    ctx.translate(t.x * w, t.y * h)
    ctx.rotate((t.rotate * Math.PI) / 180)
    setTextFont(ctx, t, w)
    ctx.fillText(t.text, 0, 0)
    ctx.restore()
  }

  if (p.hoop.shape === 'redondo') {
    // Tudo que cair fora do círculo é cortado.
    const out = makeCanvas(w, h)
    const o = out.getContext('2d')!
    o.fillStyle = '#fff'
    o.fillRect(0, 0, w, h)
    o.save()
    o.beginPath()
    o.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2)
    o.clip()
    o.drawImage(c, 0, 0)
    o.restore()
    if (opts.guides) drawGuides(o, p.hoop, w, h)
    return opts.mirror ? mirrored(out) : out
  }
  if (opts.guides) drawGuides(ctx, p.hoop, w, h)
  return opts.mirror ? mirrored(c) : c
}

function mirrored(c: HTMLCanvasElement): HTMLCanvasElement {
  const m = makeCanvas(c.width, c.height)
  const ctx = m.getContext('2d')!
  ctx.translate(c.width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(c, 0, 0)
  return m
}

function drawGuides(ctx: CanvasRenderingContext2D, hoop: Hoop, w: number, h: number) {
  const px = Math.max(1, w / (hoopCm(hoop).w * 40)) // linha de ~0,25 mm
  ctx.save()
  ctx.strokeStyle = '#9a9a9a'
  ctx.lineWidth = px
  ctx.setLineDash([px * 6, px * 4])
  ctx.beginPath()
  if (hoop.shape === 'redondo') ctx.arc(w / 2, h / 2, Math.min(w, h) / 2 - px, 0, Math.PI * 2)
  else ctx.rect(px, px, w - 2 * px, h - 2 * px)
  ctx.stroke()
  ctx.setLineDash([])
  const m = Math.min(w, h) * 0.02
  ctx.beginPath()
  ctx.moveTo(w / 2 - m, h / 2)
  ctx.lineTo(w / 2 + m, h / 2)
  ctx.moveTo(w / 2, h / 2 - m)
  ctx.lineTo(w / 2, h / 2 + m)
  ctx.stroke()
  ctx.restore()
}

/** Tamanho em pixels do risco impresso em tamanho real. */
export function exportSize(hoop: Hoop): { w: number; h: number } {
  const c = hoopCm(hoop)
  return { w: Math.round(c.w * PX_PER_CM_EXPORT), h: Math.round(c.h * PX_PER_CM_EXPORT) }
}

const toJpeg = (c: HTMLCanvasElement) =>
  new Promise<Uint8Array>((resolve, reject) =>
    c.toBlob((b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a)), reject) : reject(new Error('Não foi possível gerar o PDF.'))), 'image/jpeg', 0.92),
  )

/** O risco em tamanho real, já com as guias; `mirror` espelha para transferir pelo verso. */
export async function renderFull(img: CanvasImageSource & { width: number; height: number }, p: EmbProject, mirror: boolean): Promise<HTMLCanvasElement> {
  const { w, h } = exportSize(p.hoop)
  const raw = photoRaw(img, p.hoop, p.view, Math.max(w, h))
  const lines = await buildLineLayer(raw, p, Math.max(w, h) / 900, 'export')
  return composeRisco(lines, p, w, h, { guides: true, mirror })
}

export function canvasToPng(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível gerar a imagem.'))), 'image/png'))
}

/** PDF em tamanho real: uma folha A4 se couber; senão várias, com marcas de encaixe e sobreposição de 1 cm. */
export async function buildRiscoPdf(full: HTMLCanvasElement, p: EmbProject): Promise<Blob> {
  const cm = hoopCm(p.hoop)
  const { cols, rows } = sheetGrid(cm.w, cm.h)
  const mm = PX_PER_CM_EXPORT / 10
  const A4 = { w: Math.round(210 * mm), h: Math.round(297 * mm) }
  const margin = SHEET.margin * mm
  const sheetW = SHEET.w * mm
  const sheetH = SHEET.h * mm
  const stepX = (SHEET.w - SHEET.overlap) * mm
  const stepY = (SHEET.h - SHEET.overlap) * mm
  const pages = []
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const page = makeCanvas(A4.w, A4.h)
      const ctx = page.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, A4.w, A4.h)
      const single = cols === 1 && rows === 1
      // Uma folha só: centraliza. Várias: cada folha recorta o seu pedaço.
      const sx = single ? 0 : col * stepX
      const sy = single ? 0 : r * stepY
      const cw = single ? full.width : Math.min(sheetW, full.width - sx)
      const ch = single ? full.height : Math.min(sheetH, full.height - sy)
      const dx = single ? (A4.w - full.width) / 2 : margin
      const dy = single ? (A4.h - full.height) / 2 : margin
      ctx.drawImage(full, sx, sy, cw, ch, dx, dy, cw, ch)
      // Marcas de encaixe nos cantos do miolo e nome da folha.
      ctx.strokeStyle = '#888'
      ctx.lineWidth = 2
      const m = 3 * mm
      for (const [cx, cy] of [[margin, margin], [margin + sheetW, margin], [margin, margin + sheetH], [margin + sheetW, margin + sheetH]]) {
        ctx.beginPath()
        ctx.moveTo(cx - m, cy)
        ctx.lineTo(cx + m, cy)
        ctx.moveTo(cx, cy - m)
        ctx.lineTo(cx, cy + m)
        ctx.stroke()
      }
      ctx.fillStyle = '#666'
      ctx.font = `${2.6 * mm}px Arial, sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      const label = single ? `${p.name} · ${cm.w} × ${cm.h} cm · tamanho real (imprimir a 100%, sem ajustar)` : `${p.name} · folha ${r * cols + col + 1} de ${rows * cols} (coluna ${col + 1}, linha ${r + 1}) · imprimir a 100%`
      ctx.fillText(label, margin, A4.h - 1.6 * mm)
      pages.push({ jpeg: await toJpeg(page), width: A4.w, height: A4.h })
    }
  }
  return new Blob([buildPdfPages(pages, p.name) as BlobPart], { type: 'application/pdf' })
}
