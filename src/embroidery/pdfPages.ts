/** PDF com várias páginas A4 (retrato), cada uma com uma imagem JPEG cobrindo a folha inteira. */
export interface PdfPage {
  jpeg: Uint8Array
  /** Tamanho da imagem em pixels. */
  width: number
  height: number
}

const MM = 72 / 25.4
export const A4_PT = { w: 210 * MM, h: 297 * MM }
const enc = new TextEncoder()
const num = (n: number) => String(Math.round(n * 100) / 100)

export function buildPdfPages(pages: PdfPage[], title = ''): Uint8Array {
  if (pages.length === 0) throw new Error('PDF sem páginas')
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

  // Objetos: 1 catálogo, 2 páginas, 3 info; depois, para cada página i: página, imagem, conteúdo.
  const pageObj = (i: number) => 4 + i * 3
  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  obj(3, `<< /Title (${safeTitle}) /Producer (Tramado) >>`)
  pages.forEach((p, i) => {
    const n = pageObj(i)
    const content = `q ${num(A4_PT.w)} 0 0 ${num(A4_PT.h)} 0 0 cm /Im0 Do Q`
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(A4_PT.w)} ${num(A4_PT.h)}] /Resources << /XObject << /Im0 ${n + 1} 0 R >> >> /Contents ${n + 2} 0 R >>`)
    obj(
      n + 1,
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>`,
      p.jpeg,
    )
    obj(n + 2, `<< /Length ${content.length} >>`, enc.encode(content))
  })

  const total = 3 + pages.length * 3
  const xref = size
  push(`xref\n0 ${total + 1}\n0000000000 65535 f \n`)
  for (let i = 1; i <= total; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(size)
  let pos = 0
  for (const p of parts) {
    out.set(p, pos)
    pos += p.length
  }
  return out
}

/** Miolo útil de cada folha A4 (mm) e sobreposição entre folhas vizinhas. */
export const SHEET = { w: 200, h: 287, overlap: 10, margin: 5 }

/** Quantas folhas A4 (colunas × linhas) para imprimir uma área em tamanho real. */
export function sheetGrid(widthCm: number, heightCm: number): { cols: number; rows: number } {
  const cover = (mm: number, sheet: number) => (mm <= sheet ? 1 : 1 + Math.ceil((mm - sheet) / (sheet - SHEET.overlap)))
  return { cols: cover(widthCm * 10, SHEET.w), rows: cover(heightCm * 10, SHEET.h) }
}
