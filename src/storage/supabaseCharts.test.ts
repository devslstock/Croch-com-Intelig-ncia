import { describe, expect, it } from 'vitest'
import { rowToSaved, savedToRow, type ChartRow } from './supabaseCharts'

const row: ChartRow = {
  id: '3f6c1c8e-0000-4000-8000-000000000001',
  name: 'Retrato · 15/10',
  width: 3,
  height: 2,
  grid: 'AAECAgEA',
  palette: [{ letter: 'A', symbol: '●', hex: '#ffffff', count: 6 }],
  yarn_id: 'DMC__Mouline',
  picked: { A: '310' },
  start_side: 'left',
  created_at: '2026-10-15T12:00:00Z',
}

describe('gráficos no Supabase', () => {
  it('converte linha do banco em gráfico salvo e volta, sem perder campos', () => {
    const saved = rowToSaved(row)
    expect(saved.yarnId).toBe('DMC__Mouline')
    expect(saved.startSide).toBe('left')
    expect(saved.createdAt).toBe(row.created_at)
    const back = savedToRow(saved)
    const { created_at: _omit, ...writable } = row
    expect(back).toEqual(writable)
  })

  it('não envia user_id nem created_at (o banco decide)', () => {
    const back = savedToRow(rowToSaved(row)) as Record<string, unknown>
    expect('user_id' in back).toBe(false)
    expect('created_at' in back).toBe(false)
  })
})
