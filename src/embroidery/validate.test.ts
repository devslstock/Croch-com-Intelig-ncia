import { describe, expect, it } from 'vitest'
import { checkDimensions, checkFile, sniffFormat, uploadLimits } from './validate'

const bytes = (...b: number[]) => Uint8Array.from(b)
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10)
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50)
const limits = { maxBytes: 1000, maxPixels: 10_000, minSide: 10 }
const text = (s: string) => new TextEncoder().encode(s)

describe('validação da foto', () => {
  it('reconhece JPEG, PNG e WebP pelos bytes, e recusa o resto', () => {
    expect(sniffFormat(JPEG)).toBe('jpeg')
    expect(sniffFormat(PNG)).toBe('png')
    expect(sniffFormat(WEBP)).toBe('webp')
    expect(sniffFormat(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(sniffFormat(text('GIF89a......'))).toBeNull()
    expect(sniffFormat(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull() // PDF
    expect(sniffFormat(bytes())).toBeNull()
  })

  it('não confia na extensão: texto com nome .jpg é recusado', () => {
    expect(checkFile(50, text('isto nao e uma foto'), limits).ok).toBe(false)
  })

  it('limite de tamanho do arquivo', () => {
    expect(checkFile(1000, JPEG, limits).ok).toBe(true)
    expect(checkFile(1001, JPEG, limits).ok).toBe(false)
    expect(checkFile(0, JPEG, limits).ok).toBe(false)
  })

  it('limites de resolução: muito pequena e muito grande', () => {
    expect(checkDimensions(100, 100, limits).ok).toBe(true)
    expect(checkDimensions(9, 500, limits).ok).toBe(false)
    expect(checkDimensions(101, 100, limits).ok).toBe(false)
    expect(checkDimensions(0, 0, limits).ok).toBe(false)
  })

  it('mensagens não expõem caminhos nem detalhes internos', () => {
    const msgs = [checkFile(2000, JPEG, limits), checkFile(10, bytes(1, 2, 3), limits), checkDimensions(1, 1, limits)]
    for (const m of msgs) if (!m.ok) expect(m.message).not.toMatch(/[\\/]|node_modules|Error|undefined/)
  })

  it('limites vêm das variáveis de ambiente, com padrão seguro', () => {
    expect(uploadLimits({})).toEqual({ maxBytes: 15 * 1024 * 1024, maxPixels: 40_000_000, minSide: 64 })
    expect(uploadLimits({ VITE_EMB_MAX_MB: '5', VITE_EMB_MAX_MEGAPIXELS: '10', VITE_EMB_MIN_SIDE: '100' })).toEqual({ maxBytes: 5 * 1024 * 1024, maxPixels: 10_000_000, minSide: 100 })
    expect(uploadLimits({ VITE_EMB_MAX_MB: 'abc', VITE_EMB_MAX_MEGAPIXELS: '-4' }).maxBytes).toBe(15 * 1024 * 1024)
  })
})
