import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../engine/kmeans'
import type { RawImage } from '../../engine/types'
import { lineArt } from '../risco'
import { inkShare, inkToRgba } from './ops'
import { runMethod } from './methods'
import { METHODS, PARAM_KEYS, PARAM_SPECS, defaultParams, normalizeParams, type MethodId } from './params'

/** Cena de teste: disco escuro, quadrado fraco, diagonais, trecho texturizado (folhagem), degradê e ruído leve. */
function scene(size = 180, noise = 8): RawImage {
  const rng = mulberry32(42)
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 215 + (x / size) * 20
      if ((x - 55) ** 2 + (y - 60) ** 2 < 32 * 32) v = 35
      else if (x > 110 && x < 165 && y > 30 && y < 85) v = 175
      else if (Math.abs(x - y - 20) < 2 && y > 100) v = 70
      else if (x > 20 && x < 90 && y > 110 && y < 170) v = 130 + 90 * (rng() > 0.5 ? 1 : -1) * (rng() > 0.6 ? 1 : 0.2)
      v += (rng() - 0.5) * (x > 100 && y > 100 ? 40 : noise)
      const i = (y * size + x) * 4
      data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, v))
      data[i + 3] = 255
    }
  }
  return { data, width: size, height: size }
}

const flat = (size = 120): RawImage => ({ data: new Uint8ClampedArray(size * size * 4).fill(200), width: size, height: size })
const hash = (a: Uint8Array) => {
  let h = 2166136261
  for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 16777619)
  return h >>> 0
}

const IDS = METHODS.map((m) => m.id)

describe('motor de risco: parâmetros', () => {
  it('cada parâmetro tem faixa 0–100 e padrão dentro dela', () => {
    for (const k of PARAM_KEYS) {
      const s = PARAM_SPECS[k]
      expect(s.min).toBe(0)
      expect(s.max).toBe(100)
      expect(s.def).toBeGreaterThanOrEqual(s.min)
      expect(s.def).toBeLessThanOrEqual(s.max)
    }
  })

  it('corrige valores fora da faixa e completa o que falta', () => {
    const p = normalizeParams({ strength: 500, lineWidth: -3, detail: Number.NaN })
    expect(p.strength).toBe(100)
    expect(p.lineWidth).toBe(0)
    expect(p.detail).toBe(PARAM_SPECS.detail.def)
    expect(p.smoothing).toBe(PARAM_SPECS.smoothing.def)
  })
})

describe('motor de risco: métodos', () => {
  const img = scene()

  for (const id of IDS) {
    it(`${id}: fundo branco, contorno do disco, sem mancha preta e sem encher a página`, () => {
      const ink = runMethod(id as MethodId, img, defaultParams(), 1)
      expect(ink.length).toBe(img.width * img.height)
      const share = inkShare(ink)
      expect(share).toBeGreaterThan(0.002)
      expect(share).toBeLessThan(0.25)
      expect(ink[5 * img.width + 5]).toBe(0) // canto: fundo
      expect(ink[60 * img.width + 55]).toBe(0) // dentro do disco escuro: nada preenchido
      // contorno do disco (raio 32 em torno de x=55,y=60) aparece em algum ponto da linha horizontal
      let edge = 0
      for (let x = 55 + 18; x <= 55 + 38; x++) edge = Math.max(edge, ink[60 * img.width + x])
      expect(edge).toBeGreaterThan(120)
    })
  }

  it('imagem lisa não gera linhas', () => {
    for (const id of IDS) expect(inkShare(runMethod(id as MethodId, flat(), defaultParams(), 1))).toBe(0)
  })

  it('imagem minúscula devolve risco vazio, sem erro', () => {
    const tiny: RawImage = { data: new Uint8ClampedArray(4 * 4 * 4).fill(10), width: 4, height: 4 }
    for (const id of IDS) expect(Array.from(runMethod(id as MethodId, tiny)).every((v) => v === 0)).toBe(true)
  })

  it('o método clássico é a versão anterior (idêntica)', () => {
    const a = runMethod('classico', img, { detail: 70 }, 1)
    const b = lineArt(img, 70, 1)
    expect(hash(a)).toBe(hash(b))
  })

  for (const m of METHODS) {
    for (const key of m.uses) {
      it(`${m.id}: o parâmetro "${key}" muda o resultado de verdade`, () => {
        if (key === 'background') return // testado à parte, com folhagem
        const noisy = key === 'noiseClean' // só aparece em foto com ruído
        const src = noisy ? scene(180, 46) : img
        const base = noisy ? { ...defaultParams(), smoothing: 0, strength: 85 } : defaultParams()
        const lo = runMethod(m.id, src, { ...base, [key]: 0 }, 1)
        const hi = runMethod(m.id, src, { ...base, [key]: 100 }, 1)
        expect(hash(lo)).not.toBe(hash(hi))
      })
    }
  }

  it('simplificação do fundo apaga linhas curtas na folhagem e mantém o contorno longo', () => {
    const size = 200
    const rng = mulberry32(7)
    const cells = Array.from({ length: 34 * 34 }, () => rng() > 0.5)
    const data = new Uint8ClampedArray(size * size * 4)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let v = cells[Math.floor(y / 6) * 34 + Math.floor(x / 6)] ? 70 : 200 // folhagem: blocos escuros e claros
        if (x > 95 && x < 135 && y > 20 && y < 180) v = 20 // um traço bem escuro e longo
        const i = (y * size + x) * 4
        data[i] = data[i + 1] = data[i + 2] = v
        data[i + 3] = 255
      }
    }
    const leafy: RawImage = { data, width: size, height: size }
    const off = runMethod('E', leafy, { ...defaultParams(), background: 0 }, 1)
    const on = runMethod('E', leafy, { ...defaultParams(), background: 100 }, 1)
    expect(hash(off)).not.toBe(hash(on))
    expect(inkShare(on)).toBeLessThan(inkShare(off))
  })

  it('mais intensidade e mais detalhes dão mais linhas (método combinado)', () => {
    const base = defaultParams()
    expect(inkShare(runMethod('E', img, { ...base, strength: 90 }, 1))).toBeGreaterThan(inkShare(runMethod('E', img, { ...base, strength: 10 }, 1)))
    expect(inkShare(runMethod('E', img, { ...base, lineWidth: 90 }, 1))).toBeGreaterThan(inkShare(runMethod('E', img, { ...base, lineWidth: 5 }, 1)))
  })

  it('o mesmo parâmetro dá sempre o mesmo risco (determinístico)', () => {
    expect(hash(runMethod('E', img, defaultParams(), 1))).toBe(hash(runMethod('E', img, defaultParams(), 1)))
  })
})

describe('saída', () => {
  it('imagem final tem fundo branco opaco e linhas escuras', () => {
    const ink = runMethod('E', scene(), defaultParams(), 1)
    const rgba = inkToRgba(ink, 180, 180)
    expect(rgba[0]).toBe(255)
    expect(rgba[3]).toBe(255)
    let darkest = 255
    for (let i = 0; i < ink.length; i++) darkest = Math.min(darkest, rgba[i * 4])
    expect(darkest).toBeLessThan(80)
    for (let i = 0; i < ink.length; i++) expect(rgba[i * 4 + 3]).toBe(255)
  })
})
