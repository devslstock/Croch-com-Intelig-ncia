import { describe, expect, it } from 'vitest'
import type { ChartResult } from '../engine/types'
import { matchPalette, parseYarnCsv, shoppingList } from './yarn'

const csv = `codigo,nome,hex
# comentário
T-1,vermelho,#cc2030
T-2,vermelho escuro,#901020
T-3,azul,#2040c0
T-4,branco,#ffffff
linha inválida,,zzz`

const yarn = parseYarnCsv('t', 'Teste', 'Linha', csv)

const chart: ChartResult = {
  width: 2,
  height: 2,
  grid: new Uint8Array([0, 1, 2, 2]),
  palette: [
    { letter: 'A', symbol: '●', hex: '#ffffff', count: 1 },
    { letter: 'B', symbol: '■', hex: '#c82030', count: 1 },
    { letter: 'C', symbol: '▲', hex: '#cd2231', count: 2 },
  ],
}

describe('fios', () => {
  it('lê o CSV e ignora linhas inválidas e comentários', () => {
    expect(yarn.colors.map((c) => c.code)).toEqual(['T-1', 'T-2', 'T-3', 'T-4'])
  })

  it('escolhe o fio mais parecido e traz 3 alternativas', () => {
    const m = matchPalette(chart, yarn)
    expect(m[0].best.yarn.code).toBe('T-4')
    expect(m[1].best.yarn.code).toBe('T-1')
    expect(m[1].alternatives).toHaveLength(3)
    expect(m[1].alternatives[0].deltaE).toBeGreaterThanOrEqual(m[1].best.deltaE)
  })

  it('lista de compras junta cores que caíram no mesmo fio', () => {
    const list = shoppingList(matchPalette(chart, yarn))
    const red = list.find((i) => i.yarn.code === 'T-1')!
    expect(red.letters).toEqual(['B', 'C'])
    expect(red.stitches).toBe(3)
    expect(list).toHaveLength(2)
  })

  it('substitutos não repetem fios que já estão na lista', () => {
    const list = shoppingList(matchPalette(chart, yarn))
    const used = new Set(list.map((i) => i.yarn.code))
    for (const item of list) {
      expect(item.substitutes.length).toBeGreaterThan(0)
      for (const s of item.substitutes) expect(used.has(s.yarn.code)).toBe(false)
    }
  })

  it('aceita planilha de terceiros com colunas extras e nomes entre aspas', () => {
    const ext = 'Number,Name,HEX,RGB,CMYK\nB5200,"Snow White, bright",#fafaff,"250,250,255","2,2,0,0"\n01,White Tin,#c5c5c5,"197,197,197","0,0,0,23"'
    const p = parseYarnCsv('x', 'X', 'Y', ext)
    expect(p.colors.map((c) => [c.code, c.name, c.hex])).toEqual([
      ['B5200', 'Snow White, bright', '#fafaff'],
      ['01', 'White Tin', '#c5c5c5'],
    ])
  })
})
