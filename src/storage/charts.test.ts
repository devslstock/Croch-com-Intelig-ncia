import { describe, expect, it } from 'vitest'
import type { ChartResult } from '../engine/types'
import { decodeGrid, encodeGrid, toChartResult, toSaved } from './charts'

const chart: ChartResult = {
  width: 3,
  height: 2,
  grid: new Uint8Array([0, 1, 2, 2, 1, 0]),
  palette: [
    { letter: 'A', symbol: '●', hex: '#ffffff', count: 2 },
    { letter: 'B', symbol: '■', hex: '#ff0000', count: 2 },
    { letter: 'C', symbol: '▲', hex: '#000000', count: 2 },
  ],
}

describe('gráficos salvos', () => {
  it('codifica e decodifica a grade sem perder nada, inclusive grades grandes', () => {
    const big = new Uint8Array(150 * 150).map((_, i) => i % 26)
    expect(Array.from(decodeGrid(encodeGrid(big)))).toEqual(Array.from(big))
  })

  it('guarda e recupera o gráfico com fio e trocas manuais', () => {
    const saved = toSaved({ name: '  Retrato · 15/10 ', chart, yarnId: 'DMC__Mouline', picked: { A: '310' }, startSide: 'left' })
    expect(saved.name).toBe('Retrato · 15/10')
    expect(saved.id).toBeTruthy()
    const back = toChartResult(saved)
    expect(Array.from(back.grid)).toEqual(Array.from(chart.grid))
    expect(back.palette).toEqual(chart.palette)
    expect(saved.picked).toEqual({ A: '310' })
    expect(saved.startSide).toBe('left')
  })

  it('atualizar mantém id e data de criação', () => {
    const first = toSaved({ name: 'A', chart, yarnId: '', picked: {}, startSide: 'right' })
    const second = toSaved({ id: first.id, name: 'B', chart, yarnId: '', picked: {}, startSide: 'right' }, first)
    expect(second.id).toBe(first.id)
    expect(second.createdAt).toBe(first.createdAt)
    expect(second.name).toBe('B')
  })
})
