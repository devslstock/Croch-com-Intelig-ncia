import { deltaE2000, rgbToLab, type Lab } from '../engine/color'
import { kmeans } from '../engine/kmeans'
import type { RawImage } from '../engine/types'
import type { YarnColor, YarnPalette } from '../yarn/yarn'

export type StitchKind = 'atras' | 'cheio' | 'haste' | 'no-frances'

export const STITCH_LABEL: Record<StitchKind, string> = {
  atras: 'Ponto atrás',
  cheio: 'Ponto cheio',
  haste: 'Ponto haste',
  'no-frances': 'Nó francês',
}

export const STITCH_HINT: Record<StitchKind, string> = {
  atras: 'contornos e linhas finas',
  cheio: 'áreas grandes',
  haste: 'linhas curvas e talos',
  'no-frances': 'olhos, miolos e detalhes',
}

export interface PaletteItem {
  yarn: YarnColor
  /** Parte da foto nessa cor (0–1). */
  share: number
  stitch: StitchKind
  /** Distância entre a cor da foto e o fio (CIEDE2000). */
  deltaE: number
}

/**
 * Sugestão de ponto: só um ponto de partida. Muito usada → ponto cheio; escura e pouco usada → ponto atrás;
 * pouca e viva → nó francês; o resto → haste.
 */
export function suggestStitch(lab: Lab, share: number): StitchKind {
  if (share >= 0.18) return 'cheio'
  const chroma = Math.hypot(lab[1], lab[2])
  if (lab[0] < 35) return share < 0.08 ? 'atras' : 'haste'
  if (chroma > 35 && share < 0.06) return 'no-frances'
  return share >= 0.1 ? 'cheio' : 'haste'
}

/**
 * Cores da foto (agrupadas) no fio escolhido, sem repetir o mesmo número.
 * Pixels transparentes e quase brancos (fundo) não contam.
 */
export function photoPalette(img: RawImage, yarn: YarnPalette, count: number): PaletteItem[] {
  if (yarn.colors.length === 0) return []
  const step = Math.max(1, Math.floor((img.width * img.height) / 6000))
  const pts: number[] = []
  const white = rgbToLab(255, 255, 255)
  for (let i = 0; i < img.width * img.height; i += step) {
    if (img.data[i * 4 + 3] < 128) continue
    const lab = rgbToLab(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2])
    if (deltaE2000(lab, white) < 4) continue
    pts.push(lab[0], lab[1], lab[2])
  }
  const n = pts.length / 3
  if (n === 0) return []
  const { centers, assign } = kmeans(Float32Array.from(pts), Math.max(1, Math.min(count, n)), 7)
  const sizes = new Array<number>(centers.length).fill(0)
  for (const a of assign) sizes[a]++

  const byCode = new Map<string, PaletteItem>()
  centers.forEach((c, i) => {
    if (sizes[i] === 0) return
    let best: YarnColor = yarn.colors[0]
    let bd = Infinity
    for (const y of yarn.colors) {
      const d = deltaE2000(c, y.lab)
      if (d < bd) {
        bd = d
        best = y
      }
    }
    const share = sizes[i] / n
    const cur = byCode.get(best.code)
    if (cur) cur.share += share
    else byCode.set(best.code, { yarn: best, share, stitch: 'cheio', deltaE: bd })
  })
  const items = [...byCode.values()].sort((a, b) => b.share - a.share)
  for (const it of items) it.stitch = suggestStitch(it.yarn.lab, it.share)
  return items
}
