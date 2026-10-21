import type { RawImage } from '../../engine/types'
import { lineArt } from '../risco'
import {
  adaptiveLines, adjustContrast, bilateral, blur, busyMap, canny, close, clamp01, dropBlobs, dropSmall, finish, lerp, thinMask, toGray, union,
} from './ops'
import { normalizeParams, type EngineParams, type MethodId } from './params'

/**
 * Métodos de conversão foto → risco. Todos devolvem a "tinta" (0 = nada, 255 = linha cheia), pixel a pixel,
 * e são independentes: dá para comparar um a um. `scale` ajusta tudo ao tamanho da imagem (1 = lado maior de ~900 px),
 * para o risco impresso ficar igual ao da tela.
 */

interface Ctx {
  w: number
  h: number
  s: number
  p: EngineParams
  /** Tons de cinza já com o contraste ajustado. */
  g: Float32Array
}

const sigmaFor = (c: Ctx) => (0.9 + 2.0 * (c.p.smoothing / 100)) * (1.5 - c.p.detail / 100) * c.s
const thresholds = (c: Ctx) => {
  const hi = lerp(0.62, 0.12, c.p.strength / 100)
  return { hi, lo: hi * 0.42 }
}
const minSizeFor = (c: Ctx) => (6 + 70 * (c.p.noiseClean / 100)) * (1.6 - 1.2 * (c.p.detail / 100)) * c.s

/** A · Contornos básicos: cinza, suavização, Canny. */
function methodA(c: Ctx): Uint8Array {
  const { hi, lo } = thresholds(c)
  const edges = canny(c.g, c.w, c.h, sigmaFor(c), hi, lo)
  dropSmall(edges, c.w, c.h, minSizeFor(c))
  return finish(edges, c.w, c.h, c.p.lineWidth, c.s)
}

/** Linhas finas por limiarização adaptativa: tira manchas pretas e reduz cada traço a 1 pixel. */
function adaptiveThin(c: Ctx, src: Float32Array): Uint8Array {
  const d = c.p.detail / 100
  const sigmaPre = (0.7 + 1.6 * (c.p.smoothing / 100)) * c.s
  const sigmaWindow = (5 + 16 * (1 - d)) * c.s
  const offset = lerp(0.16, 0.035, c.p.strength / 100)
  const lines = adaptiveLines(src, c.w, c.h, sigmaPre, sigmaWindow, offset)
  dropBlobs(lines, c.w, c.h, Math.round(30 * c.s * c.s), 0.7)
  return thinMask(lines, c.w, c.h)
}

/** B · Limiarização adaptativa. */
function methodB(c: Ctx): Uint8Array {
  const lines = adaptiveThin(c, c.g)
  dropSmall(lines, c.w, c.h, minSizeFor(c))
  return finish(lines, c.w, c.h, c.p.lineWidth, c.s)
}

/** Filtro bilateral com força inversa à "preservação de detalhes". */
function smoothKeepingEdges(c: Ctx): Float32Array {
  const dp = c.p.detailPreserve / 100
  const radius = Math.min(5, Math.max(1, Math.round(3 * c.s)))
  return bilateral(c.g, c.w, c.h, radius, radius * 0.8 + 0.5, lerp(0.3, 0.06, dp))
}

/** C · Preserva detalhes: bilateral + Canny com desfoque menor. */
function methodC(c: Ctx): Uint8Array {
  const gb = smoothKeepingEdges(c)
  const { hi, lo } = thresholds(c)
  const sigma = (0.7 + 1.6 * (c.p.smoothing / 100)) * (1.4 - 0.8 * (c.p.detail / 100)) * c.s
  const edges = canny(gb, c.w, c.h, sigma, hi * 0.9, lo * 0.9)
  dropSmall(edges, c.w, c.h, minSizeFor(c))
  return finish(edges, c.w, c.h, c.p.lineWidth, c.s)
}

/** D · Lápis: cinza invertido e desfocado, "color dodge" (como o pencilSketch do OpenCV), depois limpo em linhas. */
function methodD(c: Ctx): Uint8Array {
  const d = c.p.detail / 100
  const inv = new Float32Array(c.g.length)
  for (let i = 0; i < inv.length; i++) inv[i] = 1 - c.g[i]
  const bl = blur(inv, c.w, c.h, (4 + 10 * (c.p.smoothing / 100)) * (1.3 - 0.6 * d) * c.s)
  const t = lerp(0.35, 0.08, c.p.strength / 100)
  const mask = new Uint8Array(c.g.length)
  for (let i = 0; i < mask.length; i++) {
    const dodge = clamp01(c.g[i] / Math.max(1e-3, 1 - bl[i]))
    mask[i] = 1 - dodge > t ? 1 : 0
  }
  dropBlobs(mask, c.w, c.h, Math.round(30 * c.s * c.s), 0.7)
  const lines = thinMask(mask, c.w, c.h)
  dropSmall(lines, c.w, c.h, minSizeFor(c))
  return finish(lines, c.w, c.h, c.p.lineWidth, c.s)
}

/**
 * E · Combinado: contornos (Canny sobre a imagem com bordas preservadas) + traços finos longos (adaptativa) +
 * limpeza de fundo (textura densa) + fusão de linhas duplicadas (fecha e afina).
 */
function methodE(c: Ctx): Uint8Array {
  const d = c.p.detail / 100
  const gb = smoothKeepingEdges(c)
  const { hi, lo } = thresholds(c)
  const sigma = (0.7 + 1.6 * (c.p.smoothing / 100)) * (1.4 - 0.8 * d) * c.s
  const primary = canny(gb, c.w, c.h, sigma, hi * 0.9, lo * 0.9)

  const fine = adaptiveThin(c, gb)
  dropSmall(fine, c.w, c.h, minSizeFor(c) * (2.5 - 1.5 * d))

  const merged0 = union(primary, fine)
  const busy = c.p.background > 0 ? busyMap(canny(gb, c.w, c.h, 2 * c.s, 0.22, 0.09), c.w, c.h, c.s, c.p.background) : undefined
  dropSmall(merged0, c.w, c.h, minSizeFor(c), busy)

  const merged = thinMask(close(merged0, c.w, c.h, Math.max(1, Math.round(1.5 * c.s))), c.w, c.h)
  dropSmall(merged, c.w, c.h, minSizeFor(c) * 0.5)
  return finish(merged, c.w, c.h, c.p.lineWidth, c.s)
}

/** Roda um método sobre a imagem. Parâmetros fora da faixa são corrigidos; imagens minúsculas devolvem risco vazio. */
export function runMethod(id: MethodId, img: RawImage, params?: Partial<EngineParams>, scale = Math.max(img.width, img.height) / 900): Uint8Array {
  const p = normalizeParams(params)
  const { width: w, height: h } = img
  if (w < 8 || h < 8) return new Uint8Array(w * h)
  if (id === 'classico') return lineArt(img, p.detail, scale)
  const gray = toGray(img)
  const ctx: Ctx = { w, h, s: scale, p, g: adjustContrast(gray, w, h, p.contrast, scale) }
  switch (id) {
    case 'A': return methodA(ctx)
    case 'B': return methodB(ctx)
    case 'C': return methodC(ctx)
    case 'D': return methodD(ctx)
    default: return methodE(ctx)
  }
}
