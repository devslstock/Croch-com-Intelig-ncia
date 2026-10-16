/**
 * PDF mínimo, sem dependências: uma página A4 com uma imagem JPEG centralizada.
 * A orientação (retrato/paisagem) é escolhida pela proporção da imagem.
 */

const MM = 72 / 25.4 // pontos por milímetro
const A4 = { w: 210 * MM, h: 297 * MM }
const MARGIN = 10 * MM

export interface PdfImage {
  /** Bytes de um arquivo JPEG. */
  jpeg: Uint8Array
  width: number
  height: number
}

const enc = new TextEncoder()
const num = (n: number) => String(Math.round(n * 100) / 100)

/** Escolhe a orientação e o tamanho da imagem na página, mantendo a proporção. */
export function fitImage(imgW: number, imgH: number) {
  const landscape = imgW > imgH
  const page = landscape ? { w: A4.h, h: A4.w } : A4
  const maxW = page.w - 2 * MARGIN
  const maxH = page.h - 2 * MARGIN
  const scale = Math.min(maxW / imgW, maxH / imgH)
  const w = imgW * scale
  const h = imgH * scale
  return { page, x: (page.w - w) / 2, y: (page.h - h) / 2, w, h }
}

export function buildPdf(image: PdfImage, title = ''): Uint8Array {
  const { page, x, y, w, h } = fitImage(image.width, image.height)
  const content = `q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(y)} cm /Im0 Do Q`
  const safeTitle = title.replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, '')

  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let size = 0
  const push = (p: Uint8Array | string) => {
    const b = typeof p === 'string' ? enc.encode(p) : p
    parts.push(b)
    size += b.length
  }
  const obj = (n: number, body: string, stream?: Uint8Array) => {
    offsets[n] = size
    push(`${n} 0 obj\n${body}\n`)
    if (stream) {
      push('stream\n')
      push(stream)
      push('\nendstream\n')
    }
    push('endobj\n')
  }

  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  obj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.w)} ${num(page.h)}] ` +
      '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>',
  )
  obj(
    4,
    `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.jpeg.length} >>`,
    image.jpeg,
  )
  obj(5, `<< /Length ${content.length} >>`, enc.encode(content))
  obj(6, `<< /Title (${safeTitle}) /Producer (Tramado) >>`)

  const xref = size
  push(`xref\n0 7\n0000000000 65535 f \n`)
  for (let i = 1; i <= 6; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(size)
  let pos = 0
  for (const p of parts) {
    out.set(p, pos)
    pos += p.length
  }
  return out
}

/** Converte uma imagem (PNG etc.) em PDF, com fundo branco. Só roda no navegador. */
export async function imageBlobToPdf(blob: Blob, title = ''): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0)
  const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92))
  if (!jpeg) throw new Error('Não foi possível gerar o PDF.')
  const bytes = new Uint8Array(await jpeg.arrayBuffer())
  return new Blob([buildPdf({ jpeg: bytes, width: canvas.width, height: canvas.height }, title) as BlobPart], {
    type: 'application/pdf',
  })
}
