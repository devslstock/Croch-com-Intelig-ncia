/**
 * Biblioteca de elementos: desenhos em linha, criados para o Tramado (formas geométricas simples geradas por código).
 * Cada desenho cabe numa caixa de 100 × 100 e é só traço (sem preenchimento).
 */

export type ElementCategory = 'Flores' | 'Folhas' | 'Formas' | 'Natal' | 'Molduras' | 'Outros'

export const ELEMENT_CATEGORIES: ElementCategory[] = ['Flores', 'Folhas', 'Formas', 'Natal', 'Molduras', 'Outros']

export interface ElementDef {
  id: string
  label: string
  category: ElementCategory
  /** Caminho SVG (100 × 100). */
  d: string
}

const r2 = (n: number) => String(Math.round(n * 100) / 100)

type Pt = [number, number]

/** Transformação local: gira por `ang` (radianos) e move para (cx, cy). */
const at = (cx: number, cy: number, ang: number) => {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  return (x: number, y: number): Pt => [cx + x * c - y * s, cy + x * s + y * c]
}

const M = (p: Pt) => `M${r2(p[0])} ${r2(p[1])}`
const L = (p: Pt) => `L${r2(p[0])} ${r2(p[1])}`
const Q = (c: Pt, p: Pt) => `Q${r2(c[0])} ${r2(c[1])} ${r2(p[0])} ${r2(p[1])}`
const C = (c1: Pt, c2: Pt, p: Pt) => `C${r2(c1[0])} ${r2(c1[1])} ${r2(c2[0])} ${r2(c2[1])} ${r2(p[0])} ${r2(p[1])}`

const circle = (cx: number, cy: number, r: number) => `M${r2(cx - r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 0 ${r2(cx + r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 0 ${r2(cx - r)} ${r2(cy)}Z`

/** Folha: a base em (cx, cy), a ponta a `len` de distância na direção `ang`; com nervura central. */
function leaf(cx: number, cy: number, len: number, wid: number, ang: number, vein = true): string {
  const t = at(cx, cy, ang)
  let d = M(t(0, 0)) + Q(t(len * 0.5, -wid), t(len, 0)) + Q(t(len * 0.5, wid), t(0, 0)) + 'Z'
  if (vein) d += M(t(0, 0)) + L(t(len * 0.85, 0))
  return d
}

/** Pétalas em volta de um miolo. */
function flower(cx: number, cy: number, R: number, petals: number, wid: number, center: number, pointed = false): string {
  let d = ''
  for (let i = 0; i < petals; i++) {
    const t = at(cx, cy, (Math.PI * 2 * i) / petals)
    const r0 = R * 0.22
    d += pointed ? M(t(r0, 0)) + L(t(R * 0.75, -wid * 0.6)) + L(t(R, 0)) + L(t(R * 0.75, wid * 0.6)) + 'Z' : M(t(r0, 0)) + Q(t(R * 0.7, -wid), t(R, 0)) + Q(t(R * 0.7, wid), t(r0, 0)) + 'Z'
  }
  return d + circle(cx, cy, center)
}

function polygon(pts: Pt[]): string {
  return pts.map((p, i) => (i === 0 ? M(p) : L(p))).join('') + 'Z'
}

function star(cx: number, cy: number, R: number, r: number, n = 5): string {
  const pts: Pt[] = []
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n
    const rad = i % 2 === 0 ? R : r
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)])
  }
  return polygon(pts)
}

/** Grinalda: arco de caule com folhas dos dois lados, de `a0` a `a1` (graus; 0 = direita, 90 = embaixo). */
function wreath(a0: number, a1: number, n: number, leafLen: number, withBerries = false): string {
  const R = 36
  const toRad = Math.PI / 180
  let d = ''
  const steps = 48
  for (let i = 0; i <= steps; i++) {
    const a = (a0 + ((a1 - a0) * i) / steps) * toRad
    const p: Pt = [50 + R * Math.cos(a), 50 + R * Math.sin(a)]
    d += i === 0 ? M(p) : L(p)
  }
  for (let i = 0; i < n; i++) {
    const a = (a0 + ((a1 - a0) * (i + 0.5)) / n) * toRad
    const p: Pt = [50 + R * Math.cos(a), 50 + R * Math.sin(a)]
    const dirTan = a + (a1 >= a0 ? Math.PI / 2 : -Math.PI / 2)
    d += leaf(p[0], p[1], leafLen, leafLen * 0.28, dirTan - 0.7, false)
    d += leaf(p[0], p[1], leafLen, leafLen * 0.28, dirTan + 0.7 + Math.PI, false)
    if (withBerries && i % 3 === 1) d += circle(p[0] + 6 * Math.cos(a), p[1] + 6 * Math.sin(a), 2.4)
  }
  return d
}

/** Ramo reto com pares de folhas. */
function branch(): string {
  let d = M([50, 95]) + C([48, 70], [52, 40], [50, 8])
  const ys = [82, 66, 50, 34, 20]
  ys.forEach((y, i) => {
    const len = 26 - i * 3
    d += leaf(50, y, len, 6.5, -Math.PI + 0.55, true)
    d += leaf(50, y - 6, len, 6.5, -0.55, true)
  })
  d += leaf(50, 10, 12, 4, -Math.PI / 2, false)
  return d
}

/** Samambaia: haste com folíolos curtos. */
function fern(): string {
  let d = M([50, 95]) + L([50, 6])
  for (let i = 0; i < 12; i++) {
    const y = 88 - i * 7
    const len = 22 - i * 1.4
    d += M([50, y]) + L([50 - len, y - 8]) + M([50, y]) + L([50 + len, y - 8])
  }
  return d
}

function snowflake(): string {
  let d = ''
  for (let i = 0; i < 6; i++) {
    const t = at(50, 50, (Math.PI * i) / 3)
    d += M(t(0, 0)) + L(t(42, 0))
    for (const k of [18, 30]) d += M(t(k, 0)) + L(t(k + 8, -8)) + M(t(k, 0)) + L(t(k + 8, 8))
  }
  return d + circle(50, 50, 4)
}

function butterfly(): string {
  const wing = (sx: number) => {
    const X = (x: number) => (sx > 0 ? x : 100 - x)
    const P = (x: number, y: number): Pt => [X(x), y]
    return M(P(50, 50)) + C(P(36, 10), P(6, 12), P(12, 40)) + C(P(14, 54), P(36, 56), P(50, 50)) + 'Z' + M(P(50, 54)) + C(P(36, 58), P(18, 70), P(28, 84)) + C(P(40, 94), P(50, 72), P(50, 54)) + 'Z' + circle(X(26), 34, 5)
  }
  return wing(1) + wing(-1) + M([50, 34]) + L([50, 78]) + M([50, 34]) + Q([44, 20], [38, 14]) + M([50, 34]) + Q([56, 20], [62, 14])
}

const E = (id: string, label: string, category: ElementCategory, d: string): ElementDef => ({ id, label, category, d })

const HEART = 'M50 86C20 62 8 44 8 28C8 14 20 8 30 8C40 8 47 14 50 22C53 14 60 8 70 8C80 8 92 14 92 28C92 44 80 62 50 86Z'

export const ELEMENTS: ElementDef[] = [
  // Flores
  E('margarida', 'Margarida', 'Flores', flower(50, 50, 44, 12, 7, 9)),
  E('flor-5', 'Flor de cinco pétalas', 'Flores', flower(50, 50, 42, 5, 17, 8)),
  E('girassol', 'Girassol', 'Flores', flower(50, 50, 44, 14, 8, 17, true) + circle(50, 50, 10)),
  E('tulipa', 'Tulipa', 'Flores', 'M32 38L38 12L50 30L62 12L68 38C68 56 58 64 50 64C42 64 32 56 32 38Z' + M([50, 64]) + L([50, 94]) + leaf(50, 88, 26, 6, -Math.PI + 0.7) + leaf(50, 82, 26, 6, -0.7)),
  E('ramo-flores', 'Ramo de flores', 'Flores', M([46, 96]) + C([42, 70], [58, 50], [52, 22]) + flower(52, 16, 12, 5, 5, 3) + flower(32, 38, 10, 5, 4.5, 2.5) + flower(70, 44, 10, 5, 4.5, 2.5) + leaf(48, 76, 20, 5, -Math.PI + 0.6) + leaf(50, 66, 18, 5, -0.6)),
  E('botao-de-rosa', 'Botão de rosa', 'Flores', M([30, 46]) + C([30, 26], [70, 26], [70, 46]) + C([70, 66], [30, 66], [30, 46]) + 'Z' + 'M42 40C42 34 58 34 58 42C58 50 44 50 44 44' + M([50, 62]) + L([50, 94]) + leaf(50, 86, 22, 5.5, -Math.PI + 0.6) + leaf(50, 78, 22, 5.5, -0.6)),
  // Folhas
  E('folha', 'Folha', 'Folhas', leaf(50, 94, 86, 26, -Math.PI / 2, true) + M([50, 70]) + L([36, 56]) + M([50, 70]) + L([64, 56]) + M([50, 50]) + L([38, 38]) + M([50, 50]) + L([62, 38])),
  E('ramo', 'Ramo com folhas', 'Folhas', branch()),
  E('samambaia', 'Samambaia', 'Folhas', fern()),
  E('louro-esquerdo', 'Louro (esquerda)', 'Folhas', wreath(100, 250, 9, 15)),
  E('louro-direito', 'Louro (direita)', 'Folhas', wreath(80, -70, 9, 15)),
  E('galho-curvo', 'Galho curvo', 'Folhas', M([12, 86]) + C([30, 40], [60, 80], [90, 16]) + leaf(26, 62, 18, 5, -1.5, false) + leaf(40, 66, 18, 5, 0.4, false) + leaf(52, 62, 18, 5, -1.6, false) + leaf(64, 48, 18, 5, 0.1, false) + leaf(78, 34, 16, 5, -1.7, false)),
  // Formas
  E('coracao', 'Coração', 'Formas', HEART),
  E('estrela', 'Estrela', 'Formas', star(50, 52, 44, 19)),
  E('lua', 'Lua', 'Formas', 'M62 10A40 40 0 1 0 62 90A31 31 0 1 1 62 10Z'),
  E('sol', 'Sol', 'Formas', circle(50, 50, 18) + Array.from({ length: 12 }, (_, i) => { const t = at(50, 50, (Math.PI * 2 * i) / 12); return M(t(26, 0)) + L(t(i % 2 ? 36 : 44, 0)) }).join('')),
  E('nuvem', 'Nuvem', 'Formas', 'M24 74A16 16 0 0 1 28 42A22 22 0 0 1 68 36A18 18 0 0 1 80 74Z'),
  E('gota', 'Gota', 'Formas', 'M50 8C50 8 20 44 20 62A30 30 0 0 0 80 62C80 44 50 8 50 8Z'),
  E('laco', 'Laço', 'Formas', 'M50 50C30 24 8 28 10 50C8 72 30 76 50 50C70 24 92 28 90 50C92 72 70 76 50 50Z' + M([50, 50]) + L([38, 90]) + M([50, 50]) + L([62, 90])),
  // Natal
  E('arvore', 'Árvore de Natal', 'Natal', 'M50 14L70 40L58 40L78 64L64 64L86 86L14 86L36 64L22 64L42 40L30 40Z' + M([44, 86]) + L([44, 95]) + L([56, 95]) + L([56, 86]) + star(50, 8, 6, 2.6)),
  E('bola', 'Bola de Natal', 'Natal', circle(50, 62, 28) + 'M43 34L57 34L57 27L43 27Z' + M([50, 27]) + C([50, 14], [60, 14], [60, 6]) + M([24, 56]) + Q([50, 72], [76, 56]) + M([24, 70]) + Q([50, 86], [76, 70])),
  E('floco', 'Floco de neve', 'Natal', snowflake()),
  E('bengala', 'Bengala doce', 'Natal', 'M56 94L56 32A12 12 0 0 0 32 32L32 44' + M([68, 94]) + L([68, 32]) + C([68, 6], [20, 6], [20, 32]) + L([20, 44]) + M([56, 94]) + L([68, 94]) + M([32, 44]) + L([20, 44]) + M([56, 80]) + L([68, 74]) + M([56, 64]) + L([68, 58]) + M([56, 48]) + L([68, 42])),
  E('presente', 'Presente', 'Natal', 'M18 42H82V90H18Z' + 'M12 28H88V42H12Z' + M([50, 28]) + L([50, 90]) + 'M50 28C32 6 18 18 40 28M50 28C68 6 82 18 60 28'),
  E('meia', 'Meia de Natal', 'Natal', 'M34 12H62V50C62 62 80 68 80 82C80 92 60 94 50 84C38 72 34 62 34 50Z' + M([34, 26]) + L([62, 26])),
  E('sino', 'Sino', 'Natal', 'M50 14C30 14 28 40 24 60L18 72H82L76 60C72 40 70 14 50 14Z' + circle(50, 80, 7) + circle(50, 9, 4)),
  E('azevinho', 'Azevinho', 'Natal', leaf(50, 60, 38, 12, -Math.PI + 0.5) + leaf(50, 60, 38, 12, -0.5) + circle(46, 66, 5) + circle(56, 68, 5) + circle(51, 76, 5)),
  // Molduras
  E('guirlanda', 'Guirlanda', 'Molduras', wreath(-90, 270, 14, 13, true)),
  E('aro-duplo', 'Aro duplo', 'Molduras', circle(50, 50, 46) + circle(50, 50, 41)),
  E('losango', 'Losango', 'Molduras', polygon([[50, 6], [94, 50], [50, 94], [6, 50]]) + polygon([[50, 14], [86, 50], [50, 86], [14, 50]])),
  E('faixa', 'Faixa para texto', 'Molduras', 'M20 34H80V66H20Z' + 'M20 40L6 40L14 50L6 60L20 60M80 40L94 40L86 50L94 60L80 60'),
  E('divisor', 'Divisor com flor', 'Molduras', M([4, 50]) + L([36, 50]) + M([64, 50]) + L([96, 50]) + flower(50, 50, 14, 6, 5, 3)),
  E('moldura', 'Moldura simples', 'Molduras', 'M16 6H84Q94 6 94 16V84Q94 94 84 94H16Q6 94 6 84V16Q6 6 16 6Z' + 'M20 12H80Q88 12 88 20V80Q88 88 80 88H20Q12 88 12 80V20Q12 12 20 12Z'),
  // Outros
  E('borboleta', 'Borboleta', 'Outros', butterfly()),
  E('passaro', 'Pássaro', 'Outros', 'M16 58C24 42 44 34 56 40C62 28 76 28 82 36L94 38L82 46C80 62 66 80 44 80C28 80 18 70 16 58Z' + circle(70, 38, 2) + 'M38 58C50 52 60 56 64 66'),
  E('casinha', 'Casinha', 'Outros', 'M14 50L50 18L86 50H78V86H22V50Z' + 'M42 86V62H58V86' + 'M62 56H72V66H62Z'),
  E('ancora', 'Âncora', 'Outros', circle(50, 14, 7) + M([50, 21]) + L([50, 90]) + M([36, 34]) + L([64, 34]) + M([16, 60]) + C([16, 82], [34, 92], [50, 90]) + C([66, 92], [84, 82], [84, 60]) + M([16, 60]) + L([8, 70]) + M([84, 60]) + L([92, 70])),
  E('livro', 'Livro aberto', 'Outros', 'M50 24C36 14 20 14 8 20V80C20 74 36 74 50 84C64 74 80 74 92 80V20C80 14 64 14 50 24Z' + M([50, 24]) + L([50, 84])),
]

export const ELEMENT_BY_ID = new Map(ELEMENTS.map((e) => [e.id, e]))
