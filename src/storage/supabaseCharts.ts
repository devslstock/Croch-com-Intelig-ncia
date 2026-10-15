import type { SupabaseClient } from '@supabase/supabase-js'
import type { PaletteEntry, StartSide } from '../engine/types'
import { toSaved, type ChartStore, type SavedChart } from './charts'

/** Linha da tabela public.charts (supabase/migrations). */
export interface ChartRow {
  id: string
  name: string
  width: number
  height: number
  grid: string
  palette: PaletteEntry[]
  yarn_id: string
  picked: Record<string, string>
  start_side: StartSide
  progress: number
  progress_stitch: number
  created_at: string
}

export const CHART_COLUMNS = 'id,name,width,height,grid,palette,yarn_id,picked,start_side,progress,progress_stitch,created_at'

export function rowToSaved(r: ChartRow): SavedChart {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    width: r.width,
    height: r.height,
    grid: r.grid,
    palette: r.palette,
    yarnId: r.yarn_id,
    picked: r.picked,
    startSide: r.start_side,
    progress: r.progress,
    progressStitch: r.progress_stitch,
  }
}

/** Campos graváveis (sem user_id: o banco preenche com auth.uid(); sem created_at: fica o original). */
export function savedToRow(s: SavedChart) {
  return {
    id: s.id,
    name: s.name,
    width: s.width,
    height: s.height,
    grid: s.grid,
    palette: s.palette,
    yarn_id: s.yarnId,
    picked: s.picked,
    start_side: s.startSide,
    progress: s.progress,
    progress_stitch: s.progressStitch,
  }
}

const fail = (msg: string): never => {
  throw new Error(msg)
}

/** "Meus gráficos" na nuvem. A segurança vem do RLS: o app só enxerga as linhas da usuária logada. */
export function supabaseChartStore(client: SupabaseClient): ChartStore {
  return {
    async list() {
      const { data, error } = await client.from('charts').select(CHART_COLUMNS).order('created_at', { ascending: false })
      if (error) fail('Não consegui carregar seus gráficos.')
      return ((data ?? []) as ChartRow[]).map(rowToSaved)
    },
    async save(_userId, input) {
      let existing: SavedChart | undefined
      if (input.id) {
        const { data } = await client.from('charts').select(CHART_COLUMNS).eq('id', input.id).maybeSingle()
        if (data) existing = rowToSaved(data as ChartRow)
      }
      const saved = toSaved(input, existing)
      const { data, error } = await client.from('charts').upsert(savedToRow(saved)).select(CHART_COLUMNS).single()
      if (error) fail('Não foi possível salvar o gráfico. Tente de novo.')
      return rowToSaved(data as ChartRow)
    },
    async remove(_userId, id) {
      const { error } = await client.from('charts').delete().eq('id', id)
      if (error) fail('Não foi possível apagar o gráfico.')
    },
  }
}
