import { describe, expect, it } from 'vitest'
import { buildPdf, fitImage } from './pdf'

const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b)

describe('pdf', () => {
  it('escolhe paisagem para imagem larga e retrato para alta', () => {
    const wide = fitImage(2000, 1000)
    const tall = fitImage(1000, 2000)
    expect(wide.page.w).toBeGreaterThan(wide.page.h)
    expect(tall.page.h).toBeGreaterThan(tall.page.w)
  })

  it('mantém a proporção e cabe dentro da página', () => {
    const f = fitImage(3000, 1500)
    expect(f.w / f.h).toBeCloseTo(2, 5)
    expect(f.x).toBeGreaterThan(0)
    expect(f.x + f.w).toBeLessThan(f.page.w)
    expect(f.y + f.h).toBeLessThan(f.page.h)
  })

  it('gera um PDF válido, com o JPEG embutido e xref correto', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    const pdf = buildPdf({ jpeg, width: 10, height: 20 }, 'Meu gráfico (teste)')
    const s = text(pdf)
    expect(s.startsWith('%PDF-1.4')).toBe(true)
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(s).toContain('/Filter /DCTDecode /Length 4')
    const start = Number(/startxref\n(\d+)/.exec(s)![1])
    expect(s.slice(start, start + 4)).toBe('xref')
    // cada entrada do xref aponta para "N 0 obj"
    const entries = [...s.slice(start).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]))
    expect(entries).toHaveLength(6)
    entries.forEach((off, i) => expect(s.slice(off, off + 7)).toBe(`${i + 1} 0 obj`))
  })
})
