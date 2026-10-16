// Gera a marca do Tramado (SVG) em public/: símbolo, logo horizontal, favicon e versões para ícone de app.
// Uso: node scripts/gerar-marca.mjs   e depois   node scripts/rasterizar-marca.mjs   (PNG e ICO a partir dos SVG)
// Desenho próprio: um coração em pontos (como num gráfico de crochê) com o fio de lã solto; o nome é escrito em pontos.
import { mkdirSync, writeFileSync } from 'node:fs'

const ACCENT = '#a8426f'
const ROSE = '#e0527f'
const HEART = [
  '.XX...XX.',
  'XXXX.XXXX',
  'XXXXXXXXX',
  'XXXXXXXXX',
  '.XXXXXXX.',
  '..XXXXX..',
  '...XXX...',
  '....X....',
]
const SHINE = new Set(['1,1', '1,2', '2,1']) // pontos de brilho no lado esquerdo
const GLYPHS = {
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
}

const r = (n) => Math.round(n * 100) / 100

function heartCells({ x0, y0, cell, size, rx }) {
  const out = []
  HEART.forEach((row, ri) => {
    ;[...row].forEach((ch, ci) => {
      if (ch !== 'X') return
      const fill = SHINE.has(`${ri},${ci}`) ? '#ffc9dc' : '#ffffff'
      out.push(`<rect x="${r(x0 + ci * cell)}" y="${r(y0 + ri * cell)}" width="${size}" height="${size}" rx="${rx}" fill="${fill}"/>`)
    })
  })
  return out.join('')
}

const defs = (id) =>
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f9b4cd"/><stop offset="1" stop-color="#d4457c"/></linearGradient></defs>`

/** Símbolo completo: quadrado arredondado + coração em pontos + fio de lã. */
function symbol({ id = 'sg', thread = true, round = true, scale = 1, heartCell = 7.2 } = {}) {
  const cell = heartCell
  const size = r(cell - 0.8)
  const w = 9 * cell
  const h = 8 * cell
  const cx = 50
  const cy = thread ? 45.5 : 50
  const x0 = cx - (w * scale) / 2
  const y0 = cy - (h * scale) / 2
  const c = cell * scale
  const bg = `<rect width="100" height="100" rx="${round ? 22 : 0}" fill="url(#${id})"/>`
  const heart = heartCells({ x0, y0, cell: c, size: r(size * scale), rx: r(1.6 * scale) })
  const tipY = y0 + 8 * c
  const tail = thread
    ? `<path d="M50 ${r(tipY - 1)} C 50 ${r(tipY + 11)} 64 ${r(tipY + 15)} 72 ${r(tipY + 9)} C 78 ${r(tipY + 4)} 72 ${r(tipY - 3)} 67 ${r(tipY + 1)}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>`
    : ''
  return { defs: defs(id), body: bg + heart + tail }
}

const svg = (viewBox, inner, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" ${extra}>${inner}</svg>\n`

mkdirSync('public', { recursive: true })

// 1) símbolo (ícone "any" e uso dentro do app)
{
  const s = symbol({ id: 'sym' })
  writeFileSync('public/logo-symbol.svg', svg('0 0 100 100', s.defs + s.body, 'role="img" aria-label="Tramado"'))
}
// 2) favicon: sem o fio, coração maior (legível em 16 px)
{
  const s = symbol({ id: 'fav', thread: false, heartCell: 8.6 })
  writeFileSync('public/favicon.svg', svg('0 0 100 100', s.defs + s.body))
}
// 3) versões de tela cheia (sem cantos arredondados) para ícone "maskable" e iPhone: o desenho cabe na zona segura
{
  const s = symbol({ id: 'mk', thread: false, round: false, scale: 0.82 })
  writeFileSync('public/icon-maskable.svg', svg('0 0 100 100', s.defs + s.body))
}
// 4) logo horizontal: símbolo + "TRAMADO" escrito em pontos
{
  const s = symbol({ id: 'lg' })
  const word = 'TRAMADO'
  const cell = 9
  let x = 126
  const y0 = 18.5
  const cells = []
  ;[...word].forEach((ch, wi) => {
    const g = GLYPHS[ch]
    const color = wi === word.length - 1 ? ROSE : ACCENT
    g.forEach((row, ri) => {
      ;[...row].forEach((c, ci) => {
        if (c === '#') cells.push(`<rect x="${r(x + ci * cell + 0.25)}" y="${r(y0 + ri * cell + 0.25)}" width="8.5" height="8.5" rx="2.2" fill="${color}"/>`)
      })
    })
    x += (g[0].length + 1) * cell
  })
  const width = x - cell
  writeFileSync('public/logo.svg', svg(`0 0 ${width} 100`, s.defs + s.body + cells.join(''), 'role="img" aria-label="Tramado"'))
}
console.log('SVG da marca gerados em public/')
