export type Lab = [number, number, number]

const toLinear = (c: number) => {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

const fromLinear = (v: number) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(c * 255)))
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  const R = toLinear(r)
  const G = toLinear(g)
  const B = toLinear(b)
  const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047
  const y = R * 0.2126729 + G * 0.7151522 + B * 0.072175
  const z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export function labToRgb(l: number, a: number, b: number): [number, number, number] {
  const fy = (l + 16) / 116
  const fx = a / 500 + fy
  const fz = fy - b / 200
  const inv = (t: number) => (t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787)
  const x = inv(fx) * 0.95047
  const y = inv(fy)
  const z = inv(fz) * 1.08883
  return [
    fromLinear(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    fromLinear(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    fromLinear(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
  ]
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

export function labToHex(l: number, a: number, b: number): string {
  const [r, g, bl] = labToRgb(l, a, b)
  return rgbToHex(r, g, bl)
}

/** ΔE76: distância euclidiana no espaço Lab. */
export function deltaE(a: Lab, b: Lab): number {
  const dl = a[0] - b[0]
  const da = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dl * dl + da * da + db * db)
}

/** CIEDE2000: diferença de cor mais próxima do que o olho enxerga (melhor que ΔE76 em azuis, roxos e tons escuros). */
export function deltaE2000(c1: Lab, c2: Lab): number {
  const [L1, a1, b1] = c1
  const [L2, a2, b2] = c2
  const rad = Math.PI / 180
  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cbar = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)
  const hue = (b: number, a: number) => {
    if (b === 0 && a === 0) return 0
    const h = Math.atan2(b, a) / rad
    return h >= 0 ? h : h + 360
  }
  const h1p = hue(b1, a1p)
  const h2p = hue(b2, a2p)
  const dLp = L2 - L1
  const dCp = C2p - C1p
  let dhp = 0
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2)
  const Lbarp = (L1 + L2) / 2
  const Cbarp = (C1p + C2p) / 2
  let hbarp = h1p + h2p
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbarp += h1p + h2p < 360 ? 360 : -360
    hbarp /= 2
  }
  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * rad) +
    0.24 * Math.cos(2 * hbarp * rad) +
    0.32 * Math.cos((3 * hbarp + 6) * rad) -
    0.2 * Math.cos((4 * hbarp - 63) * rad)
  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7))
  const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2)
  const Sc = 1 + 0.045 * Cbarp
  const Sh = 1 + 0.015 * Cbarp * T
  const Rt = -Math.sin(2 * dTheta * rad) * Rc
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))
}

export function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

/** RGB (0–255) → HSV (h 0–360, s e v 0–1). Em tons de cinza o matiz não existe: mantém `prevH`. */
export function rgbToHsv(r: number, g: number, b: number, prevH = 0): { h: number; s: number; v: number } {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const d = max - Math.min(R, G, B)
  let h = prevH
  if (d > 0) {
    if (max === R) h = ((G - B) / d) % 6
    else if (max === G) h = (B - R) / d + 2
    else h = (R - G) / d + 4
    h = (h * 60 + 360) % 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return [f(5), f(3), f(1)].map((x) => Math.round(x * 255)) as [number, number, number]
}
