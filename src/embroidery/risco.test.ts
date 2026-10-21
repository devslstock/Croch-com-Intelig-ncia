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

  it('mais detalhe = mais linhas (o contorno fraco só aparece com detalhe alto)', () => {
    // disco bem escuro (contorno forte) e quadrado só um pouco mais escuro que o fundo (contorno fraco)
    const w = 240
    const img = image(w, w, (x, y) => {
      if ((x - 60) ** 2 + (y - 120) ** 2 < 40 * 40) return 20
      if (x > 140 && x < 220 && y > 80 && y < 160) return 188
      return 230
    })
    const low = lineArt(img, 5, 1)
    const high = lineArt(img, 95, 1)
    const edgeAt = (ink: Uint8Array, x0: number) => Math.max(...Array.from({ length: 12 }, (_, k) => ink[120 * w + x0 + k]))
    expect(edgeAt(low, 14)).toBeGreaterThan(150) // contorno do disco: aparece sempre
    expect(edgeAt(high, 14)).toBeGreaterThan(150)
    expect(inkShare(high)).toBeGreaterThanOrEqual(inkShare(low))
  })

  it('mais espessura = mais tinta', () => {
    const disc = image(160, 160, (x, y) => ((x - 80) ** 2 + (y - 80) ** 2 < 40 * 40 ? 30 : 230))
    expect(inkShare(lineArt(disc, 55, 1, 90))).toBeGreaterThan(inkShare(lineArt(disc, 55, 1, 10)) * 1.5)
  })
})
