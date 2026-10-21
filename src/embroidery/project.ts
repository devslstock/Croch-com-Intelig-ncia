import { DEFAULT_METHOD, normalizeParams, type EngineParams, type MethodId } from './engine/params'
import { DEFAULT_DETAIL } from './risco'

export type HoopShape = 'redondo' | 'quadrado' | 'retangular' | 'foto'

export interface Hoop {
  shape: HoopShape
  /** Diâmetro (redondo), lado (quadrado), largura (retangular) ou lado maior (foto inteira), em cm. */
  cm: number
  /** Só na foto inteira: largura ÷ altura da foto. */
  aspect?: number
}

export const HOOP_SIZES: Record<HoopShape, number[]> = {
  redondo: [10, 13, 15, 18, 20, 25, 30],
  quadrado: [10, 15, 20, 25],
  retangular: [15, 20, 25, 30],
  foto: [15, 20, 25, 30],
}
export const HOOP_LABEL: Record<HoopShape, string> = { redondo: 'Redondo', quadrado: 'Quadrado', retangular: 'Retangular', foto: 'Foto inteira' }

/** Largura e altura da área de bordado, em cm. O retangular é 4:3 deitado. */
export function hoopCm(h: Hoop): { w: number; h: number } {
  if (h.shape === 'retangular') return { w: h.cm, h: Math.round(((h.cm * 3) / 4) * 10) / 10 }
  if (h.shape === 'foto') {
    // Mantém a proporção da foto: o lado maior mede `cm`.
    const a = h.aspect && h.aspect > 0 ? h.aspect : 1
    const r = (v: number) => Math.round(v * 10) / 10
    return a >= 1 ? { w: h.cm, h: r(h.cm / a) } : { w: r(h.cm * a), h: h.cm }
  }
  return { w: h.cm, h: h.cm }
}

export const FONTS = [
  { id: 'cursiva', label: 'Cursiva', css: '"Segoe Script","Brush Script MT","Lucida Handwriting","Apple Chancery",cursive' },
  { id: 'imprensa', label: 'Imprensa', css: '"Arial Black","Helvetica Neue",Arial,sans-serif' },
  { id: 'serifada', label: 'Serifada', css: 'Georgia,"Times New Roman",serif' },
  { id: 'maquina', label: 'Máquina', css: '"Courier New",Courier,monospace' },
] as const
export type FontId = (typeof FONTS)[number]['id']

export interface TextItem {
  id: string
  text: string
  /** Centro do texto, em fração da área (0–1). */
  x: number
  y: number
  /** Altura da letra, em fração da largura da área. */
  size: number
  /** Graus, de -90 a 90. */
  rotate: number
  font: FontId
}

/** Um traço da borracha: pontos em fração da área e raio em fração da largura. */
export interface Stroke {
  r: number
  pts: Array<[number, number]>
}

/** Como a foto aparece dentro do bastidor: zoom (1 = foto cobre a área) e deslocamento do centro, em fração da área. */
export interface PhotoView {
  zoom: number
  x: number
  y: number
}

export interface EmbProject {
  id: string
  name: string
  hoop: Hoop
  view: PhotoView
  detail: number
  /** Método de conversão (ausente em bordados antigos: usa o clássico, como eram feitos). */
  method?: MethodId
  /** Parâmetros do motor (faltando algum, vale o padrão). */
  params?: Partial<EngineParams>
  strokes: Stroke[]
  texts: TextItem[]
  yarnId: string
  /** Foto reduzida (data URL JPEG). */
  photo: string
  updatedAt: string
}

export const DEFAULT_VIEW: PhotoView = { zoom: 1, x: 0, y: 0 }

export function newProject(photo: string, name: string, yarnId: string): EmbProject {
  return {
    id: crypto.randomUUID(),
    name,
    hoop: { shape: 'redondo', cm: 20 },
    view: { ...DEFAULT_VIEW },
    detail: DEFAULT_DETAIL,
    method: DEFAULT_METHOD,
    params: normalizeParams(),
    strokes: [],
    texts: [],
    yarnId,
    photo,
    updatedAt: new Date().toISOString(),
  }
}

/** Método de um bordado: os antigos (sem método) continuam no clássico, com o "detalhe" que tinham. */
export function projectMethod(p: EmbProject): MethodId {
  return p.method ?? 'classico'
}

export function projectParams(p: EmbProject): EngineParams {
  return normalizeParams({ ...p.params, detail: p.params?.detail ?? p.detail })
}

export function newText(text: string, x = 0.5, y = 0.5): TextItem {
  return { id: crypto.randomUUID(), text, x, y, size: 0.12, rotate: 0, font: 'cursiva' }
}

interface StorageLike {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}

const MAX_PROJECTS = 12
const key = (userId: string) => `tramado:embroidery:${userId}`

export class StorageFullError extends Error {
  constructor() {
    super('Sem espaço no aparelho para guardar mais bordados. Apague algum antigo e tente de novo.')
  }
}

/** Bordados ficam neste aparelho (a foto e o risco não vão para a nuvem). */
export function embroideryStore(userId: string, storage: StorageLike) {
  const read = (): EmbProject[] => {
    try {
      const v = JSON.parse(storage.getItem(key(userId)) ?? '[]') as unknown
      return Array.isArray(v) ? (v as EmbProject[]).filter((p) => p && typeof p.id === 'string' && typeof p.photo === 'string') : []
    } catch {
      return []
    }
  }
  const write = (list: EmbProject[]) => {
    try {
      storage.setItem(key(userId), JSON.stringify(list))
    } catch {
      throw new StorageFullError()
    }
  }
  return {
    list: () => read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    save(p: EmbProject): EmbProject {
      const saved = { ...p, updatedAt: new Date().toISOString() }
      const rest = read().filter((x) => x.id !== p.id)
      write([saved, ...rest].slice(0, MAX_PROJECTS))
      return saved
    },
    remove: (id: string) => write(read().filter((p) => p.id !== id)),
  }
}
