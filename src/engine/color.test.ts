import { describe, expect, it } from 'vitest'
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from './color'

describe('conversões de cor do seletor', () => {
  it('RGB → HSV → RGB volta ao mesmo valor em cores variadas', () => {
    const samples: Array<[number, number, number]> = [[228, 212, 193], [255, 0, 0], [0, 128, 255], [12, 12, 12], [250, 250, 255], [124, 118, 190]]
    for (const [r, g, b] of samples) {
      const { h, s, v } = rgbToHsv(r, g, b)
      expect(hsvToRgb(h, s, v)).toEqual([r, g, b])
    }
  })

  it('vermelho, verde e azul puros têm o matiz certo', () => {
    expect(rgbToHsv(255, 0, 0).h).toBe(0)
    expect(rgbToHsv(0, 255, 0).h).toBe(120)
    expect(rgbToHsv(0, 0, 255).h).toBe(240)
  })

  it('em cinza o matiz anterior é mantido (o seletor não "pula" de cor)', () => {
    expect(rgbToHsv(128, 128, 128, 200).h).toBe(200)
    expect(rgbToHsv(0, 0, 0, 40).s).toBe(0)
  })

  it('hex ↔ rgb', () => {
    expect(hexToRgb('#e4d4c1')).toEqual([228, 212, 193])
    expect(rgbToHex(228, 212, 193)).toBe('#e4d4c1')
  })
})
