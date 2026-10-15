/**
 * Alfabeto de pontos: 7 carreiras de altura, 1 ponto entre as letras.
 * Acentos (´ ` ^ ~) ocupam 2 carreiras acima; o cedilha, 1 abaixo. "<3" vira coração.
 */
export type LetterStyle = 'fina' | 'grossa' | 'grande'
export type LetterChoice = 'auto' | LetterStyle
export type Placement = 'topo' | 'meio' | 'base'

export interface Mask {
  w: number
  h: number
  /** 1 = ponto da letra. Linha a linha, de cima para baixo. */
  bits: Uint8Array
}

const g = (...rows: string[]) => rows
const BLANK = g('...', '...', '...', '...', '...', '...', '...')

const GLYPHS: Record<string, string[]> = {
  A: g('.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'),
  B: g('####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'),
  C: g('.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'),
  D: g('####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'),
  E: g('#####', '#....', '#....', '####.', '#....', '#....', '#####'),
  F: g('#####', '#....', '#....', '####.', '#....', '#....', '#....'),
  G: g('.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'),
  H: g('#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'),
  I: g('###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'),
  J: g('..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'),
  K: g('#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'),
  L: g('#....', '#....', '#....', '#....', '#....', '#....', '#####'),
  M: g('#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'),
  N: g('#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'),
  O: g('.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'),
  P: g('####.', '#...#', '#...#', '####.', '#....', '#....', '#....'),
  Q: g('.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'),
  R: g('####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'),
  S: g('.####', '#....', '#....', '.###.', '....#', '....#', '####.'),
  T: g('#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'),
  U: g('#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'),
  V: g('#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'),
  W: g('#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'),
  X: g('#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'),
  Y: g('#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'),
  Z: g('#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'),
  '0': g('.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'),
  '1': g('..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'),
  '2': g('.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'),
  '3': g('.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'),
  '4': g('...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'),
  '5': g('#####', '#....', '####.', '....#', '....#', '#...#', '.###.'),
  '6': g('..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'),
  '7': g('#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'),
  '8': g('.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'),
  '9': g('.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'),
  '.': g('.', '.', '.', '.', '.', '.', '#'),
  ',': g('..', '..', '..', '..', '..', '.#', '#.'),
  '-': g('...', '...', '...', '###', '...', '...', '...'),
  '+': g('.....', '.....', '..#..', '#####', '..#..', '.....', '.....'),
  '/': g('....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'),
  ':': g('.', '.', '#', '.', '.', '#', '.'),
  '!': g('#', '#', '#', '#', '#', '.', '#'),
  '&': g('.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'),
  '♥': g('.......', '.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'),
  ' ': BLANK,
}

/** Marcas sobre a letra (2 carreiras) e cedilha (1 carreira abaixo). */
const ACCENTS: Record<string, string[]> = {
  '́': g('..#', '.#.'), // ´
  '̀': g('#..', '.#.'), // `
  '̂': g('.#.', '#.#'), // ^
  '̃': g('.#.#', '#.#.'), // ~
}
const CEDILLA = '.#.'

export interface Cell {
  ch: string
  accent?: string
  cedilla?: boolean
}

/** Texto → linhas de células (letra + marcas). Caracteres que o alfabeto não tem são ignorados. */
export function parseText(text: string): Cell[][] {
  const up = text.replace(/<3/g, '♥').toLocaleUpperCase('pt-BR')
  return up.split('\n').map((line) => {
    const cells: Cell[] = []
    for (const ch of line.normalize('NFD')) {
      if (ch === '̧') {
        if (cells.length) cells[cells.length - 1].cedilla = true
      } else if (ACCENTS[ch]) {
        if (cells.length) cells[cells.length - 1].accent = ch
      } else if (GLYPHS[ch]) {
        cells.push({ ch })
      }
    }
    return cells
  })
}

type Bitmap = boolean[][]

const toBitmap = (rows: string[]): Bitmap => rows.map((r) => [...r].map((c) => c === '#'))

function applyStyle(bm: Bitmap, style: LetterStyle): Bitmap {
  if (style === 'fina') return bm
  if (style === 'grossa') return bm.map((row) => row.map((_, x) => row[x] || row[x - 1] || false).concat([row[row.length - 1] ?? false]))
  return bm.flatMap((row) => {
    const wide = row.flatMap((v) => [v, v])
    return [wide, wide]
  })
}

const SCALE: Record<LetterStyle, number> = { fina: 1, grossa: 1, grande: 2 }

function lineMask(cells: Cell[], style: LetterStyle): Mask {
  const k = SCALE[style]
  const gap = k // "1 ponto entre letras" (2 na letra grande, que tem o dobro do tamanho)
  const above = cells.some((c) => c.accent) ? 2 * k : 0
  const below = cells.some((c) => c.cedilla) ? 1 * k : 0
  const glyphs = cells.map((c) => applyStyle(toBitmap(GLYPHS[c.ch]), style))
  const width = glyphs.reduce((s, b) => s + (b[0]?.length ?? 0), 0) + gap * Math.max(0, cells.length - 1)
  const height = above + 7 * k + below
  const bits = new Uint8Array(Math.max(1, width) * height)
  const put = (bm: Bitmap, x0: number, y0: number) => {
    bm.forEach((row, dy) => row.forEach((on, dx) => { if (on) bits[(y0 + dy) * width + x0 + dx] = 1 }))
  }
  let x = 0
  cells.forEach((c, i) => {
    const bm = glyphs[i]
    const gw = bm[0].length
    put(bm, x, above)
    if (c.accent) {
      const acc = applyStyle(toBitmap(ACCENTS[c.accent]), style)
      put(acc, x + Math.floor((gw - acc[0].length) / 2), 0)
    }
    if (c.cedilla) {
      const ced = applyStyle(toBitmap([CEDILLA]), style)
      put(ced, x + Math.floor((gw - ced[0].length) / 2), above + 7 * k)
    }
    x += gw + gap
  })
  return { w: Math.max(1, width), h: height, bits }
}

export interface TextResult {
  mask: Mask
  style: LetterStyle
  /** O texto é mais largo do que o gráfico: o excesso fica de fora. */
  overflow: boolean
}

/** Monta o texto como máscara de pontos. Com 'auto', usa a maior letra que cabe no gráfico. */
export function renderText(text: string, choice: LetterChoice, chartWidth: number): TextResult | null {
  // Linhas só com espaços não geram nada (evita escrever uma faixa em branco no gráfico).
  const lines = parseText(text).filter((l) => l.some((c) => c.ch !== ' '))
  if (lines.length === 0) return null

  const build = (style: LetterStyle): Mask => {
    const k = SCALE[style]
    const masks = lines.map((l) => lineMask(l, style))
    const w = Math.max(...masks.map((m) => m.w))
    const lineGap = 2 * k
    const h = masks.reduce((s, m) => s + m.h, 0) + lineGap * (masks.length - 1)
    const bits = new Uint8Array(w * h)
    let y = 0
    for (const m of masks) {
      const x0 = Math.floor((w - m.w) / 2)
      for (let yy = 0; yy < m.h; yy++) for (let xx = 0; xx < m.w; xx++) if (m.bits[yy * m.w + xx]) bits[(y + yy) * w + x0 + xx] = 1
      y += m.h + lineGap
    }
    return { w, h, bits }
  }

  if (choice !== 'auto') {
    const mask = build(choice)
    return { mask, style: choice, overflow: mask.w > chartWidth }
  }
  for (const style of ['grande', 'grossa', 'fina'] as const) {
    const mask = build(style)
    if (mask.w <= chartWidth - 2) return { mask, style, overflow: false }
  }
  const mask = build('fina')
  return { mask, style: 'fina', overflow: mask.w > chartWidth }
}
