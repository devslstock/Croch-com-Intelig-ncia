export type StartSide = 'right' | 'left'
export type Style = 'realista' | 'pb'

export interface EngineParams {
  /** Largura do gráfico em pontos (20–150). */
  width: number
  /** Quantidade de cores livres (2–24). Cores de destaque podem somar até +2. */
  colors: number
  style: Style
  /** Remove pontos isolados e manchas minúsculas. */
  cleanSpeckles: boolean
}

export const DEFAULT_PARAMS: EngineParams = {
  width: 70,
  colors: 10,
  style: 'realista',
  cleanSpeckles: true,
}

export interface RawImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface PaletteEntry {
  letter: string
  symbol: string
  hex: string
  count: number
}

export interface ChartResult {
  width: number
  height: number
  /** Índices na paleta, linha a linha, de cima para baixo, como a foto aparece. */
  grid: Uint8Array
  /** Ordenada da cor mais clara para a mais escura. */
  palette: PaletteEntry[]
}
