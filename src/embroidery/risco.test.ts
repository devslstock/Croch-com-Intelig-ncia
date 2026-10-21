import { describe, expect, it } from 'vitest'
import type { RawImage } from '../engine/types'
import { gaussBlur, inkShare, lineArt } from './risco'

function image(w: number, h: number, f: (x: number, y: number) => number): RawImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = f(x, y)
      const i = (y * w + x) * 4
      data[i] = data[i + 1] = data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return { data, width: w, height: h }
}

describe('risco', () => {
  it('desfoque mantém imagem lisa e a média', () => {
    const src = new Float32Array(40 * 30).fill(0.5)
    const out = gaussBlur(src, 40, 30, 3)
    for (const v of out) expect(v).toBeCloseTo(0.5, 4)
  })

  it('foto lisa não gera linhas', () => {
    const ink = lineArt(image(120, 120, () => 200), 55, 1)
    expect(inkShare(ink)).toBe(0)
  })

  it('um disco escuro sobre fundo claro gera um contorno, e não um disco cheio', () => {
    const w = 160
    const ink = lineArt(image(w, w, (x, y) => ((x - 80) ** 2 + (y - 80) ** 2 < 40 * 40 ? 30 : 230)), 55, 1)
    const share = inkShare(ink)
    expect(share).toBeGreaterThan(0.01)
    expect(share).toBeLessThan(0.15) // disco cheio seria ~0,2
    // centro do disco: vazio. Perto da borda (dentro do disco): tinta.
    expect(ink[80 * w + 80]).toBe(0)
    const edge = Math.max(...Array.from({ length: 12 }, (_, k) => ink[80 * w + 80 + 28 + k]))
    expect(edge).toBeGreaterThan(200)
  })

  it('mais detalhe = mais linhas', () => {
    const noisy = image(200, 200, (x, y) => 128 + 60 * Math.sin(x / 5) * Math.cos(y / 7) + (x > 100 ? 40 : 0))
    expect(inkShare(lineArt(noisy, 90, 1))).toBeGreaterThan(inkShare(lineArt(noisy, 10, 1)))
  })
})
