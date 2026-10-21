/**
 * Parâmetros do motor de risco. Todos vão de 0 a 100 (inteiros). Cada método usa só alguns deles (campo `uses`);
 * os outros não têm efeito naquele método e a tela os esconde.
 */
export type MethodId = 'classico' | 'A' | 'B' | 'C' | 'D' | 'E'

export interface EngineParams {
  /** Intensidade dos contornos: mais alto aceita bordas mais fracas, então aparecem mais linhas. */
  strength: number
  /** Espessura visual das linhas. */
  lineWidth: number
  /** Quantidade de detalhes: mais alto mantém traços menores e mais finos. */
  detail: number
  /** Suavização da foto antes de achar as bordas: mais alto = linhas mais lisas e menos ruído. */
  smoothing: number
  /** Contraste: 0 = só estica os tons; 100 = realça também o contraste local (sombras e roupas escuras). */
  contrast: number
  /** Limpeza de ruído: mais alto descarta mais pontinhos e pedaços curtos. */
  noiseClean: number
  /** Simplificação do fundo: mais alto apaga mais linhas curtas onde há muita textura (folhagem, água). 0 = não mexe. */
  background: number
  /** Preservação de detalhes: mais alto suaviza menos as áreas com detalhe (cabelo, tecido, acessórios). */
  detailPreserve: number
}

export interface ParamSpec {
  label: string
  hint: string
  min: number
  max: number
  def: number
}

export const PARAM_SPECS: Record<keyof EngineParams, ParamSpec> = {
  strength: { label: 'Intensidade dos contornos', hint: 'Mais alto = aparecem bordas mais fracas.', min: 0, max: 100, def: 50 },
  lineWidth: { label: 'Espessura das linhas', hint: 'Mais alto = linhas mais grossas.', min: 0, max: 100, def: 35 },
  detail: { label: 'Quantidade de detalhes', hint: 'Mais alto = traços menores e mais finos.', min: 0, max: 100, def: 55 },
  smoothing: { label: 'Suavização', hint: 'Mais alto = linhas mais lisas, menos ruído.', min: 0, max: 100, def: 40 },
  contrast: { label: 'Contraste', hint: 'Mais alto = realça sombras e roupas escuras.', min: 0, max: 100, def: 50 },
  noiseClean: { label: 'Limpeza de ruídos', hint: 'Mais alto = tira mais pontinhos e pedaços curtos.', min: 0, max: 100, def: 50 },
  background: { label: 'Simplificação do fundo', hint: 'Mais alto = apaga linhas curtas onde há muita textura.', min: 0, max: 100, def: 30 },
  detailPreserve: { label: 'Preservação de detalhes', hint: 'Mais alto = cabelo, tecido e acessórios ficam mais completos.', min: 0, max: 100, def: 50 },
}

export const PARAM_KEYS = Object.keys(PARAM_SPECS) as Array<keyof EngineParams>

export interface MethodInfo {
  id: MethodId
  label: string
  description: string
  uses: Array<keyof EngineParams>
}

export const METHODS: MethodInfo[] = [
  {
    id: 'E',
    label: 'Combinado (recomendado)',
    description: 'Contornos com preservação de detalhes, mais traços finos longos, limpeza de fundo e fusão de linhas duplicadas.',
    uses: ['strength', 'lineWidth', 'detail', 'smoothing', 'contrast', 'noiseClean', 'background', 'detailPreserve'],
  },
  {
    id: 'A',
    label: 'A · Contornos básicos',
    description: 'Cinza, suavização e detecção de bordas (Canny).',
    uses: ['strength', 'lineWidth', 'detail', 'smoothing', 'contrast', 'noiseClean'],
  },
  {
    id: 'B',
    label: 'B · Limiarização adaptativa',
    description: 'Escurece o que está abaixo da média local; afina as linhas e descarta manchas pretas.',
    uses: ['strength', 'lineWidth', 'detail', 'smoothing', 'contrast', 'noiseClean'],
  },
  {
    id: 'C',
    label: 'C · Preserva detalhes',
    description: 'Filtro que suaviza sem borrar bordas (bilateral) e depois detecção de bordas.',
    uses: ['strength', 'lineWidth', 'detail', 'smoothing', 'contrast', 'noiseClean', 'detailPreserve'],
  },
  {
    id: 'D',
    label: 'D · Lápis',
    description: 'Esboço de lápis (cinza invertido e desfocado, "color dodge") convertido em linhas limpas.',
    uses: ['strength', 'lineWidth', 'detail', 'smoothing', 'contrast', 'noiseClean'],
  },
  {
    id: 'classico',
    label: 'Clássico (versão anterior)',
    description: 'Diferença de gaussianas: a versão que já estava no app. Usa só "Detalhes".',
    uses: ['detail'],
  },
]

export const DEFAULT_METHOD: MethodId = 'E'

export function defaultParams(): EngineParams {
  const p = {} as EngineParams
  for (const k of PARAM_KEYS) p[k] = PARAM_SPECS[k].def
  return p
}

/** Completa o que faltar com o padrão e força cada valor para dentro de [min, max]. */
export function normalizeParams(p?: Partial<EngineParams>): EngineParams {
  const out = defaultParams()
  if (!p) return out
  for (const k of PARAM_KEYS) {
    const v = p[k]
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.min(PARAM_SPECS[k].max, Math.max(PARAM_SPECS[k].min, Math.round(v)))
  }
  return out
}
