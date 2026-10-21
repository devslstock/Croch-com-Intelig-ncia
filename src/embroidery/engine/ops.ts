/**
 * Operações de imagem do motor de risco (TypeScript puro, sem dependências): funcionam no navegador, no Worker e no Node (testes).
 * Imagens em tons de cinza são Float32Array de 0 (preto) a 1 (branco), linha a linha.
 */
import type { RawImage } from '../../engine/types'

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

// ---------------------------------------------------------------- desfoque

function boxesForGauss(sigma: number, n = 3): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1)
  let wl = Math.floor(wIdeal)
  if (wl % 2 === 0) wl--
  const wu = wl + 2
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4))
  return Array.from({ length: n }, (_, i) => (i < m ? wl : wu))
}

function boxH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
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

function boxV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
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

/** Desfoque gaussiano (aproximado por 3 desfoques de caixa: rápido mesmo em imagens grandes). */
export function blur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma < 0.35) return Float32Array.from(src)
  const a = Float32Array.from(src)
  const b = new Float32Array(src.length)
  const maxR = Math.floor((Math.min(w, h) - 1) / 2)
  for (const size of boxesForGauss(sigma)) {
    const r = Math.min(maxR, Math.max(0, (size - 1) / 2))
    boxH(a, b, w, h, r)
    boxV(b, a, w, h, r)
  }
  return a
}

// ---------------------------------------------------------------- tons de cinza e contraste

/** Luminância 0–1 com os tons esticados (ignora 2% dos extremos); transparência conta como branco. */
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
  for (let i = 0; i < n; i++) g[i] = clamp01((g[i] - base) / span)
  return g
}

/** Contraste local: cada região é esticada pelo seu próprio contraste (sombras e roupas escuras ganham contorno). */
export function localContrast(gray: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const mean = blur(gray, w, h, sigma)
  const dev2 = new Float32Array(gray.length)
  for (let i = 0; i < gray.length; i++) dev2[i] = (gray[i] - mean[i]) ** 2
  const dev = blur(dev2, w, h, sigma)
  const out = new Float32Array(gray.length)
  for (let i = 0; i < gray.length; i++) out[i] = clamp01(0.5 + (gray[i] - mean[i]) / (Math.max(Math.sqrt(dev[i]), 0.07) * 4))
  return out
}

/** `amount` 0–100: 0 = tons esticados; 100 = contraste local total. */
export function adjustContrast(gray: Float32Array, w: number, h: number, amount: number, scale: number): Float32Array {
  const t = Math.min(100, Math.max(0, amount)) / 100
  if (t === 0) return gray
  const lc = localContrast(gray, w, h, 28 * scale)
  const out = new Float32Array(gray.length)
  for (let i = 0; i < out.length; i++) out[i] = lerp(gray[i], lc[i], t)
  return out
}

/** Filtro bilateral: suaviza as áreas parecidas sem borrar as bordas (cabelo, tecido e acessórios). */
export function bilateral(gray: Float32Array, w: number, h: number, radius: number, sigmaS: number, sigmaR: number): Float32Array {
  const r = Math.max(1, Math.round(radius))
  const side = 2 * r + 1
  const spatial = new Float32Array(side * side)
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) spatial[(dy + r) * side + dx + r] = Math.exp(-(dx * dx + dy * dy) / (2 * sigmaS * sigmaS))
  const range = new Float32Array(256)
  for (let i = 0; i < 256; i++) range[i] = Math.exp(-((i / 255) ** 2) / (2 * sigmaR * sigmaR))
  const out = new Float32Array(gray.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = gray[y * w + x]
      let sum = 0
      let wsum = 0
      for (let dy = -r; dy <= r; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy))
        for (let dx = -r; dx <= r; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx))
          const v = gray[yy * w + xx]
          const wt = spatial[(dy + r) * side + dx + r] * range[Math.min(255, Math.round(Math.abs(v - c) * 255))]
          sum += wt * v
          wsum += wt
        }
      }
      out[y * w + x] = sum / wsum
    }
  }
  return out
}

// ---------------------------------------------------------------- bordas

/**
 * Canny: gradiente de Sobel, afinamento (só o ponto mais forte de cada borda) e limiar duplo com ligação.
 * `hi` e `lo` estão em unidades de contraste (0–1) e valem em qualquer tamanho de foto.
 */
export function canny(gray: Float32Array, w: number, h: number, sigma: number, hi: number, lo: number): Uint8Array {
  const g = blur(gray, w, h, sigma)
  const mag = new Float32Array(w * h)
  const dir = new Uint8Array(w * h) // 0: horizontal, 1: diagonal /, 2: vertical, 3: diagonal \
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const gx = (g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1]) / 8
      const gy = (g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1]) / 8
      mag[i] = Math.hypot(gx, gy) * Math.max(sigma, 0.8) * 2.5
      const a = ((((Math.atan2(gy, gx) * 180) / Math.PI) % 180) + 180) % 180
      dir[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 3 : a < 112.5 ? 2 : 1
    }
  }
  const thin = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const m = mag[i]
      if (m < lo) continue
      let n1: number
      let n2: number
      switch (dir[i]) {
        case 0: n1 = mag[i - 1]; n2 = mag[i + 1]; break
        case 2: n1 = mag[i - w]; n2 = mag[i + w]; break
        case 1: n1 = mag[i - w + 1]; n2 = mag[i + w - 1]; break
        default: n1 = mag[i - w - 1]; n2 = mag[i + w + 1]
      }
      if (m >= n1 && m >= n2) thin[i] = 1
    }
  }
  const out = new Uint8Array(w * h)
  const stack: number[] = []
  for (let i = 0; i < thin.length; i++) {
    if (thin[i] && mag[i] >= hi) {
      out[i] = 1
      stack.push(i)
    }
  }
  while (stack.length) {
    const i = stack.pop()!
    const x = i % w
    const y = (i - x) / w
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (thin[j] && !out[j] && mag[j] >= lo) {
          out[j] = 1
          stack.push(j)
        }
      }
    }
  }
  return out
}

/** Linhas escuras em relação à média local (limiarização adaptativa): 1 onde o pixel é mais escuro que a vizinhança por mais de `offset`. */
export function adaptiveLines(gray: Float32Array, w: number, h: number, sigmaPre: number, sigmaWindow: number, offset: number): Uint8Array {
  const g = blur(gray, w, h, sigmaPre)
  const mean = blur(g, w, h, sigmaWindow)
  const out = new Uint8Array(w * h)
  for (let i = 0; i < out.length; i++) out[i] = mean[i] - g[i] > offset ? 1 : 0
  return out
}

// ---------------------------------------------------------------- máscaras binárias

/** Máximo numa janela de raio `r` (engrossa). */
export function dilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r < 1) return src
  const tmp = new Uint8Array(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && !m; k++) m = src[y * w + k]
      tmp[y * w + x] = m
    }
  }
  const out = new Uint8Array(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && !m; k++) m = tmp[k * w + x]
      out[y * w + x] = m
    }
  }
  return out
}

/** Mínimo numa janela de raio `r` (afina). */
export function erode(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r < 1) return src
  const inv = new Uint8Array(src.length)
  for (let i = 0; i < src.length; i++) inv[i] = src[i] ? 0 : 1
  const d = dilate(inv, w, h, r)
  const out = new Uint8Array(src.length)
  for (let i = 0; i < out.length; i++) out[i] = d[i] ? 0 : 1
  return out
}

/** Fecha pequenos vãos e funde linhas paralelas coladas (dilata e depois afina). */
export function close(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return erode(dilate(src, w, h, r), w, h, r)
}

export function union(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length)
  for (let i = 0; i < out.length; i++) out[i] = a[i] | b[i]
  return out
}

/** Afinamento de Zhang–Suen: reduz qualquer traço a uma linha de 1 pixel. */
export function thinMask(src: Uint8Array, w: number, h: number, maxIter = 40): Uint8Array {
  const m = Uint8Array.from(src)
  for (let x = 0; x < w; x++) { m[x] = 0; m[(h - 1) * w + x] = 0 }
  for (let y = 0; y < h; y++) { m[y * w] = 0; m[y * w + w - 1] = 0 }
  const del: number[] = []
  for (let it = 0; it < maxIter; it++) {
    let changed = false
    for (let step = 0; step < 2; step++) {
      del.length = 0
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x
          if (!m[i]) continue
          const p2 = m[i - w], p3 = m[i - w + 1], p4 = m[i + 1], p5 = m[i + w + 1]
          const p6 = m[i + w], p7 = m[i + w - 1], p8 = m[i - 1], p9 = m[i - w - 1]
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
          if (b < 2 || b > 6) continue
          const a = (!p2 && p3 ? 1 : 0) + (!p3 && p4 ? 1 : 0) + (!p4 && p5 ? 1 : 0) + (!p5 && p6 ? 1 : 0) + (!p6 && p7 ? 1 : 0) + (!p7 && p8 ? 1 : 0) + (!p8 && p9 ? 1 : 0) + (!p9 && p2 ? 1 : 0)
          if (a !== 1) continue
          if (step === 0 ? p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0 : p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0) del.push(i)
        }
      }
      if (del.length) changed = true
      for (const i of del) m[i] = 0
    }
    if (!changed) break
  }
  return m
}

interface Component {
  px: number[]
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function components(mask: Uint8Array, w: number, h: number, visit: (c: Component) => void) {
  const seen = new Uint8Array(mask.length)
  const stack: number[] = []
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue
    const c: Component = { px: [], minX: w, maxX: 0, minY: h, maxY: 0 }
    seen[s] = 1
    stack.push(s)
    while (stack.length) {
      const i = stack.pop()!
      c.px.push(i)
      const x = i % w
      const y = (i - x) / w
      if (x < c.minX) c.minX = x
      if (x > c.maxX) c.maxX = x
      if (y < c.minY) c.minY = y
      if (y > c.maxY) c.maxY = y
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const j = ny * w + nx
          if (mask[j] && !seen[j]) {
            seen[j] = 1
            stack.push(j)
          }
        }
      }
    }
    visit(c)
  }
}

/**
 * Apaga pedaços de linha com menos de `minSize` pixels (pontinhos, ruído).
 * Com `busy` (0 = região calma), o mínimo cresce onde há muita linha junta: só os traços longos sobrevivem na textura.
 */
export function dropSmall(mask: Uint8Array, w: number, h: number, minSize: number, busy?: Float32Array) {
  components(mask, w, h, (c) => {
    let local = 0
    if (busy) {
      for (const i of c.px) local += busy[i]
      local /= c.px.length
    }
    if (c.px.length < minSize * (1 + local)) for (const i of c.px) mask[i] = 0
  })
}

/** Apaga manchas cheias (grandes áreas pretas): pedaços grandes que preenchem boa parte da sua caixa. */
export function dropBlobs(mask: Uint8Array, w: number, h: number, minArea: number, maxFill: number) {
  components(mask, w, h, (c) => {
    const box = (c.maxX - c.minX + 1) * (c.maxY - c.minY + 1)
    if (c.px.length >= minArea && c.px.length / box > maxFill) for (const i of c.px) mask[i] = 0
  })
}

/** Mapa de "muita linha junta" (0 = calmo): a folhagem fica bem acima do contorno de uma pessoa. */
export function busyMap(edges: Uint8Array, w: number, h: number, scale: number, amount: number): Float32Array {
  const f = new Float32Array(w * h)
  for (let i = 0; i < f.length; i++) f[i] = edges[i]
  const dens = blur(f, w, h, 14 * scale)
  const k = Math.min(100, Math.max(0, amount)) / 50
  for (let i = 0; i < f.length; i++) f[i] = Math.max(0, dens[i] / 0.045 - 1) * 2.5 * k
  return f
}

// ---------------------------------------------------------------- saída

/** Espessura uniforme e bordas suaves: engrossa a linha de 1 pixel e alisa. Devolve tinta de 0 a 255. */
export function finish(mask: Uint8Array, w: number, h: number, lineWidth: number, scale: number): Uint8Array {
  const k = Math.min(100, Math.max(0, lineWidth)) / 100
  const thick = dilate(mask, w, h, Math.round(k * 2 * scale))
  const f = new Float32Array(w * h)
  for (let i = 0; i < f.length; i++) f[i] = thick[i]
  const soft = blur(f, w, h, (0.55 + 0.35 * k) * scale)
  const out = new Uint8Array(w * h)
  for (let i = 0; i < out.length; i++) {
    const v = (soft[i] - 0.22) / 0.3
    out[i] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255)
  }
  return out
}

/** Quanto do risco é tinta (0–1). */
export function inkShare(ink: Uint8Array): number {
  let s = 0
  for (let i = 0; i < ink.length; i++) s += ink[i]
  return s / (ink.length * 255)
}

/** Risco pronto para imagem: fundo branco opaco e linhas escuras (cinza-chumbo). */
export function inkToRgba(ink: Uint8Array, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < ink.length; i++) {
    const v = Math.round(255 - (ink[i] / 255) * (255 - 0x2b))
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v
    out[i * 4 + 3] = 255
  }
  return out
}
