import type { RawImage } from '../engine/types'

/**
 * Risco de bordado: transforma uma foto em linhas finas (contornos) para transferir ao tecido.
 * Usa diferença de gaussianas (DoG): onde um pixel é mais escuro que a vizinhança, vira linha.
 * Tudo roda no aparelho, sem internet.
 */

/** Desfoque gaussiano aproximado por 3 desfoques de caixa: rápido mesmo em imagens grandes. */
function boxesForGauss(sigma: number, n = 3): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1)
  let wl = Math.floor(wIdeal)
  if (wl % 2 === 0) wl--
  const wu = wl + 2
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4)
  const m = Math.round(mIdeal)
  return Array.from({ length: n }, (_, i) => (i < m ? wl : wu))
}

function boxBlurH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const iarr = 1 / (r + r + 1)
  for (let y = 0; y < h; y++) {
    const row = y * w
    let ti = row
    let li = row
    let ri = row + r
    const fv = src[row]
    const lv = src[row + w - 1]
    let val = (r + 1) * fv
    for (let j = 0; j < r; j++) val += src[row + Math.min(j, w - 1)]
    for (let j = 0; j <= r; j++) {
      val += (ri < row + w ? src[ri] : lv) - fv
      ri++
      dst[ti++] = val * iarr
    }
    for (let j = r + 1; j < w - r; j++) {
      val += src[ri++] - src[li++]
      dst[ti++] = val * iarr
    }
    for (let j = w - r; j < w; j++) {
      val += lv - src[li++]
      dst[ti++] = val * iarr
    }
  }
}

function boxBlurV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const iarr = 1 / (r + r + 1)
  for (let x = 0; x < w; x++) {
    let ti = x
    let li = x
    let ri = x + r * w
    const fv = src[x]
    const lv = src[x + w * (h - 1)]
    let val = (r + 1) * fv
    for (let j = 0; j < r; j++) val += src[x + Math.min(j, h - 1) * w]
    for (let j = 0; j <= r; j++) {
      val += (ri < w * h ? src[ri] : lv) - fv
      ri += w
      dst[ti] = val * iarr
      ti += w
    }
    for (let j = r + 1; j < h - r; j++) {
      val += src[ri] - src[li]
      ri += w
      li += w
      dst[ti] = val * iarr
      ti += w
    }
    for (let j = h - r; j < h; j++) {
      val += lv - src[li]
      li += w
      dst[ti] = val * iarr
      ti += w
    }
  }
}

export function gaussBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const a = Float32Array.from(src)
  const b = new Float32Array(src.length)
  for (const size of boxesForGauss(Math.max(0.5, sigma))) {
    const r = Math.max(1, (size - 1) / 2)
    const rr = Math.min(r, Math.floor((Math.min(w, h) - 1) / 2))
    boxBlurH(a, b, w, h, rr)
    boxBlurV(b, a, w, h, rr)
  }
  return a
}

export const MIN_DETAIL = 0
export const MAX_DETAIL = 100
export const DEFAULT_DETAIL = 55

/** Luminância 0–1 com contraste esticado (ignora 2% dos extremos) e transparência tratada como branco. */
export function toGray(img: RawImage): Float32Array {
  const n = img.width * img.height
  const g = new Float32Array(n)
  const hist = new Uint32Array(256)
  for (let i = 0; i < n; i++) {
    const a = img.data[i * 4 + 3] / 255
    const y = 0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2]
    const v = y * a + 255 * (1 - a)
    g[i] = v / 255
    hist[Math.min(255, Math.round(v))]++
  }
  let lo = 0
  let hi = 255
  let acc = 0
  for (let v = 0; v < 256; v++) {
    acc += hist[v]
    if (acc >= n * 0.02) { lo = v; break }
  }
  acc = 0
  for (let v = 255; v >= 0; v--) {
    acc += hist[v]
    if (acc >= n * 0.02) { hi = v; break }
  }
  const span = Math.max(40, hi - lo) / 255
  const base = lo / 255
  for (let i = 0; i < n; i++) g[i] = Math.min(1, Math.max(0, (g[i] - base) / span))
  return g
}

/**
 * Tinta (0 = nada, 255 = linha cheia) para cada pixel.
 * `detail` de 0 (só o essencial) a 100 (muitos detalhes). `scale` ajusta a espessura ao tamanho da imagem
 * (1 = lado maior de ~900 px), para o risco impresso ficar igual ao da tela.
 */
export function lineArt(img: RawImage, detail: number, scale = Math.max(img.width, img.height) / 900): Uint8Array {
  const { width: w, height: h } = img
  const d = Math.min(MAX_DETAIL, Math.max(MIN_DETAIL, detail)) / 100
  const gray = toGray(img)
  const s1 = (2.4 - 1.2 * d) * scale
  const fine = gaussBlur(gray, w, h, s1)
  const coarse = gaussBlur(gray, w, h, s1 * 1.7)
  const t = 0.05 - 0.04 * d // quanto mais detalhe, mais fraca a borda que ainda vira linha
  const ramp = t * 0.9 + 0.004
  const out = new Uint8Array(w * h)
  for (let i = 0; i < out.length; i++) {
    const edge = coarse[i] - fine[i] // positivo: pixel mais escuro que a vizinhança
    const v = (edge - t) / ramp
    out[i] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255)
  }
  return out
}

/** Quanto do risco é tinta (0–1): ajuda a testar e a avisar quando a foto virou só ruído ou ficou vazia. */
export function inkShare(ink: Uint8Array): number {
  let s = 0
  for (let i = 0; i < ink.length; i++) s += ink[i]
  return s / (ink.length * 255)
}
