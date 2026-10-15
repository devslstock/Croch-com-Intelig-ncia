import { describe, expect, it } from 'vitest'
import { buildChart } from './pipeline'
import { DEFAULT_PARAMS, type RawImage } from './types'

/** Imagem sintética: fundo azul, círculo vermelho, um pontinho branco (destaque). */
function synthetic(w = 200, h = 260): RawImage {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const inCircle = (x - w / 2) ** 2 + (y - h / 2) ** 2 < 60 ** 2
      const spark = Math.abs(x - w / 2) < 5 && Math.abs(y - h / 2) < 5
      const [r, g, b] = spark ? [255, 255, 255] : inCircle ? [200, 30, 40] : [30, 60, 170]
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { data, width: w, height: h }
}

describe('buildChart', () => {
  it('mantém a proporção da foto e respeita a largura pedida', () => {
    const r = buildChart(synthetic(), { ...DEFAULT_PARAMS, width: 70 })
    expect(r.width).toBe(70)
    expect(r.height).toBe(91) // 260 * 70 / 200
    expect(r.grid.length).toBe(r.width * r.height)
  })

  it('é determinístico: mesma foto e parâmetros geram o mesmo gráfico', () => {
    const a = buildChart(synthetic(), DEFAULT_PARAMS)
    const b = buildChart(synthetic(), DEFAULT_PARAMS)
    expect(Array.from(a.grid)).toEqual(Array.from(b.grid))
    expect(a.palette).toEqual(b.palette)
  })

  it('ordena a paleta da cor mais clara para a mais escura, com letras A, B, C…', () => {
    const r = buildChart(synthetic(), { ...DEFAULT_PARAMS, colors: 3 })
    expect(r.palette.map((p) => p.letter).slice(0, 3)).toEqual(['A', 'B', 'C'])
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16)
    expect(lum(r.palette[0].hex)).toBeGreaterThanOrEqual(lum(r.palette[r.palette.length - 1].hex))
  })

  it('soma das contagens da paleta é igual ao total de pontos', () => {
    const r = buildChart(synthetic(), DEFAULT_PARAMS)
    expect(r.palette.reduce((s, p) => s + p.count, 0)).toBe(r.width * r.height)
  })

  it('aceita o limite de cores e o limite de largura', () => {
    const r = buildChart(synthetic(), { ...DEFAULT_PARAMS, width: 500, colors: 99 })
    expect(r.width).toBe(150)
    expect(r.palette.length).toBeLessThanOrEqual(26)
  })

  it('preto e branco só gera tons de cinza', () => {
    const r = buildChart(synthetic(), { ...DEFAULT_PARAMS, style: 'pb', colors: 4 })
    for (const p of r.palette) {
      const [rr, gg, bb] = [1, 3, 5].map((s) => parseInt(p.hex.slice(s, s + 2), 16))
      expect(Math.abs(rr - gg)).toBeLessThanOrEqual(2)
      expect(Math.abs(gg - bb)).toBeLessThanOrEqual(2)
    }
  })

  it('limpar pontos soltos remove pontos sem vizinho da mesma cor', () => {
    const r = buildChart(synthetic(), { ...DEFAULT_PARAMS, cleanSpeckles: true })
    const { width: w, height: h, grid } = r
    let isolated = 0
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const me = grid[y * w + x]
        let same = 0
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && grid[(y + dy) * w + x + dx] === me) same++
        if (same === 0) isolated++
      }
    }
    expect(isolated).toBe(0)
  })

  it('demora menos de 3 s para 70 × 90 pontos', () => {
    const t = performance.now()
    buildChart(synthetic(1200, 1600), { ...DEFAULT_PARAMS, width: 70 })
    expect(performance.now() - t).toBeLessThan(3000)
  })
})
