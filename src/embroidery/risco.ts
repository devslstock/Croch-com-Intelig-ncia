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
    const r = Math.max(0, (size - 1) / 2)
    const rr = Math.min(r, Math.floor((Math.min(w, h) - 1) / 2))
    boxBlurH(a, b, w, h, rr)
    boxBlurV(b, a, w, h, rr)
  }
  return a
}

export const MIN_DETAIL = 0
export const MAX_DETAIL = 100
export const DEFAULT_DETAIL = 55
export const DEFAULT_WEIGHT = 35

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

/** Engrossa as linhas: máximo numa janela de raio `r` (horizontal e depois vertical). */
function dilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r < 1) return src
  const tmp = new Uint8Array(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.max(m, src[y * w + k])
      tmp[y * w + x] = m
    }
  }
  const out = new Uint8Array(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.max(m, tmp[k * w + x])
      out[y * w + x] = m
    }
  }
  return out
}

/**
 * Bordas finas e contínuas (como um traço de caneta): gradiente de Sobel, afinamento (só o ponto mais forte
 * de cada borda) e limiar duplo: a borda forte puxa as fracas que encostam nela.
 */
function thinEdges(gray: Float32Array, w: number, h: number, sigma: number, hi: number, lo: number): Uint8Array {
  const g = gaussBlur(gray, w, h, sigma)
  const mag = new Float32Array(w * h)
  const dir = new Uint8Array(w * h) // 0: horizontal, 1: diagonal /, 2: vertical, 3: diagonal \
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const gx = (g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1]) / 8
      const gy = (g[i + w - 1] + 2 * g[i + w] + g[i + w + 1] - g[i - w - 1] - 2 * g[i - w] - g[i - w + 1]) / 8
      // Normaliza pelo desfoque: o mesmo contraste dá a mesma força em qualquer tamanho de foto.
      mag[i] = Math.hypot(gx, gy) * sigma * 2.5
      const ang = (Math.atan2(gy, gx) * 180) / Math.PI
      const a = ((ang % 180) + 180) % 180
      dir[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 3 : a < 112.5 ? 2 : 1
    }
  }
  // Afinamento: mantém o pixel só se for o maior ao longo da direção do gradiente.
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
  // Limiar duplo com ligação: parte dos pontos fortes e segue pelos fracos vizinhos.
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

/** Apaga pedaços de linha menores que `minSize` pixels (ruído, textura, pontinhos). */
function dropSmall(mask: Uint8Array, w: number, h: number, minSize: number, busy?: Float32Array) {
  const seen = new Uint8Array(mask.length)
  const stack: number[] = []
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue
    const comp: number[] = []
    seen[s] = 1
    stack.push(s)
    while (stack.length) {
      const i = stack.pop()!
      comp.push(i)
      const x = i % w
      const y = (i - x) / w
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
    // Onde há muita linha junta (folhagem, textura) só ficam os traços longos: pedaços curtos viram ruído.
    let local = 0
    if (busy) {
      for (const i of comp) local += busy[i]
      local /= comp.length
    }
    if (comp.length < minSize * (1 + local)) for (const i of comp) mask[i] = 0
  }
}

/** Realça o contraste local: regiões de baixo contraste (sombras, roupas escuras) também ganham contorno. */
function localContrast(gray: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const mean = gaussBlur(gray, w, h, sigma)
  const dev2 = new Float32Array(gray.length)
  for (let i = 0; i < gray.length; i++) dev2[i] = (gray[i] - mean[i]) ** 2
  const dev = gaussBlur(dev2, w, h, sigma)
  const out = new Float32Array(gray.length)
  for (let i = 0; i < gray.length; i++) {
    const v = 0.5 + (gray[i] - mean[i]) / (Math.max(Math.sqrt(dev[i]), 0.07) * 4)
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v
  }
  return out
}

/**
 * Risco: linhas contínuas, de espessura uniforme, só nos contornos que importam.
 * Retorna a tinta (0 = nada, 255 = linha cheia) para cada pixel.
 * `detail` de 0 (só o essencial) a 100 (muitos detalhes). `weight` de 0 (linha fina) a 100 (linha grossa e marcada).
 * `scale` ajusta tudo ao tamanho da imagem (1 = lado maior de ~900 px), para o risco impresso ficar igual ao da tela.
 */
export function lineArt(img: RawImage, detail: number, scale = Math.max(img.width, img.height) / 900, weight = DEFAULT_WEIGHT): Uint8Array {
  const { width: w, height: h } = img
  const d = Math.min(MAX_DETAIL, Math.max(MIN_DETAIL, detail)) / 100
  const k = Math.min(100, Math.max(0, weight)) / 100
  const gray = localContrast(toGray(img), w, h, 28 * scale)
  const sigma = (2.2 - 0.7 * d) * scale
  const hi = 0.34 - 0.22 * d // contraste mínimo para começar uma linha
  const lo = hi * 0.42 // contraste mínimo para a linha continuar
  const edges = thinEdges(gray, w, h, sigma, hi, lo)
  // Densidade de linhas em volta (0 = vazio; 1 = só linha): a folhagem fica bem acima do contorno de uma pessoa.
  const ef = new Float32Array(w * h)
  // Medida fixa (não depende do "detalhe"), senão pedir mais detalhe faria o filtro apagar mais.
  const ref = thinEdges(gray, w, h, 2 * scale, 0.22, 0.09)
  for (let i = 0; i < ef.length; i++) ef[i] = ref[i]
  const dens = gaussBlur(ef, w, h, 14 * scale)
  const busy = new Float32Array(w * h)
  for (let i = 0; i < busy.length; i++) busy[i] = Math.max(0, dens[i] / 0.03 - 0.8) * 5
  dropSmall(edges, w, h, Math.round((60 - 30 * d) * scale), busy)

  // Espessura uniforme e bordas suaves: engrossa e alisa.
  const thick = dilate(edges, w, h, Math.round(k * 2 * scale))
  const f = new Float32Array(w * h)
  for (let i = 0; i < f.length; i++) f[i] = thick[i]
  const soft = gaussBlur(f, w, h, (0.55 + 0.35 * k) * scale)
  const out = new Uint8Array(w * h)
  for (let i = 0; i < out.length; i++) {
    const v = (soft[i] - 0.22) / 0.3
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
