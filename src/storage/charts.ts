import type { ChartResult, PaletteEntry, StartSide } from '../engine/types'

/** Gráfico salvo em "Meus gráficos". A grade vai em base64 (uma grade 70 × 90 ocupa ~8 KB). */
export interface SavedChart {
  id: string
  name: string
  createdAt: string
  width: number
  height: number
  grid: string
  palette: PaletteEntry[]
  yarnId: string
  /** Fios trocados à mão: letra da cor → código do fio. */
  picked: Record<string, string>
  startSide: StartSide
}

export type SavedChartInput = Omit<SavedChart, 'id' | 'createdAt' | 'grid' | 'width' | 'height' | 'palette'> & {
  id?: string
  chart: ChartResult
}

export function encodeGrid(grid: Uint8Array): string {
  let s = ''
  for (let i = 0; i < grid.length; i += 0x8000) s += String.fromCharCode(...grid.subarray(i, i + 0x8000))
  return btoa(s)
}

export function decodeGrid(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export function toChartResult(saved: SavedChart): ChartResult {
  return { width: saved.width, height: saved.height, grid: decodeGrid(saved.grid), palette: saved.palette }
}

export function toSaved(input: SavedChartInput, existing?: SavedChart): SavedChart {
  return {
    id: input.id ?? existing?.id ?? crypto.randomUUID(),
    name: input.name.trim() || 'Gráfico sem nome',
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    width: input.chart.width,
    height: input.chart.height,
    grid: encodeGrid(input.chart.grid),
    palette: input.chart.palette,
    yarnId: input.yarnId,
    picked: input.picked,
    startSide: input.startSide,
  }
}

/** Contrato de armazenamento. Hoje fica no navegador; depois troca por Supabase sem mudar as telas. */
export interface ChartStore {
  list(userId: string): Promise<SavedChart[]>
  save(userId: string, input: SavedChartInput): Promise<SavedChart>
  remove(userId: string, id: string): Promise<void>
}

const key = (userId: string) => `tramado:charts:${userId}`

function readAll(userId: string): SavedChart[] {
  try {
    const raw = localStorage.getItem(key(userId))
    return raw ? (JSON.parse(raw) as SavedChart[]) : []
  } catch {
    return []
  }
}

function writeAll(userId: string, list: SavedChart[]) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(list))
  } catch {
    throw new Error('Sem espaço para salvar no navegador. Apague algum gráfico antigo e tente de novo.')
  }
}

export const localChartStore: ChartStore = {
  async list(userId) {
    return readAll(userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  async save(userId, input) {
    const all = readAll(userId)
    const existing = input.id ? all.find((c) => c.id === input.id) : undefined
    const saved = toSaved(input, existing)
    writeAll(userId, [saved, ...all.filter((c) => c.id !== saved.id)])
    return saved
  },
  async remove(userId, id) {
    writeAll(userId, readAll(userId).filter((c) => c.id !== id))
  },
}
