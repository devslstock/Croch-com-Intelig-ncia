// Gera a ilustração de fundo da tela de planos: public/fundo-planos.svg
// Uso: node scripts/gerar-fundo.mjs   (desenho próprio: gráfico de crochê em pixels + novelos)
import { mkdirSync, writeFileSync } from 'node:fs'

const W = 900
const H = 1500
const out = []
const add = (s) => out.push(s)

// ---- gráfico em pixels (coração) ---------------------------------------------------------------
const HEART = [
  '..XX...XX..',
  '.XXXX.XXXX.',
  'XXXXXXXXXXX',
  'XXXXXXXXXXX',
  'XXXXXXXXXXX',
  '.XXXXXXXXX.',
  '..XXXXXXX..',
  '...XXXXX...',
  '....XXX....',
  '.....X.....',
]
const HIGHLIGHT = new Set(['1,2', '2,1', '2,2', '1,7', '2,6'])

function chart({ x, y, cell, rot, rows, color }) {
  add(`<g transform="translate(${x} ${y}) rotate(${rot})">`)
  const w = rows[0].length * cell
  const h = rows.length * cell
  add(`<rect x="-14" y="-14" width="${w + 28}" height="${h + 28}" rx="18" fill="#fff" opacity=".55"/>`)
  rows.forEach((row, r) => {
    ;[...row].forEach((ch, c) => {
      const fill = ch === 'X' ? (HIGHLIGHT.has(`${r},${c}`) ? '#f7a8c4' : color) : '#fff'
      const op = ch === 'X' ? 1 : 0.7
      add(`<rect x="${c * cell + 1.5}" y="${r * cell + 1.5}" width="${cell - 3}" height="${cell - 3}" rx="5" fill="${fill}" opacity="${op}"/>`)
    })
  })
  add('</g>')
}

// ---- losango "granny" ----------------------------------------------------------------------------
function granny({ x, y, cell, rot, n }) {
  const colors = ['#e0527f', '#ffd98a', '#ffffff', '#a9e3c6', '#c9b6f2', '#9cc9f2']
  add(`<g transform="translate(${x} ${y}) rotate(${rot})">`)
  const mid = (n - 1) / 2
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const d = Math.abs(r - mid) + Math.abs(c - mid)
      if (d > mid) continue
      add(`<rect x="${c * cell + 1.5}" y="${r * cell + 1.5}" width="${cell - 3}" height="${cell - 3}" rx="5" fill="${colors[d % colors.length]}" opacity=".95"/>`)
    }
  }
  add('</g>')
}

// ---- novelo ----------------------------------------------------------------------------------------
let ballId = 0
function ball({ x, y, r, c1, c2, rot, tail }) {
  const id = `b${ballId++}`
  add(`<defs><radialGradient id="${id}g" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient><clipPath id="${id}c"><circle cx="0" cy="0" r="${r}"/></clipPath></defs>`)
  add(`<g transform="translate(${x} ${y}) rotate(${rot})">`)
  if (tail) add(`<path d="${tail}" fill="none" stroke="${c2}" stroke-width="7" stroke-linecap="round"/>`)
  add(`<circle r="${r}" fill="url(#${id}g)"/>`)
  add(`<g clip-path="url(#${id}c)" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="4" stroke-linecap="round">`)
  for (let i = -3; i <= 3; i++) {
    const o = i * (r / 3.2)
    add(`<path d="M ${-r} ${o - r * 0.35} Q 0 ${o + r * 0.55} ${r} ${o - r * 0.35}"/>`)
  }
  for (let i = -2; i <= 2; i++) {
    const o = i * (r / 2.6)
    add(`<path d="M ${o - r * 0.3} ${-r} Q ${o + r * 0.5} 0 ${o - r * 0.3} ${r}" stroke-opacity=".28"/>`)
  }
  add('</g>')
  add(`<circle r="${r}" fill="none" stroke="#000" stroke-opacity=".06" stroke-width="2"/>`)
  add('</g>')
}

add(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMin slice">`)
add(
  `<defs><linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#ffd3e2"/><stop offset=".45" stop-color="#fff0e6"/><stop offset="1" stop-color="#e6dcfa"/></linearGradient></defs>`,
)
add(`<rect width="${W}" height="${H}" fill="url(#bg)"/>`)
// manchas suaves
add(`<circle cx="130" cy="260" r="260" fill="#fff" opacity=".35"/>`)
add(`<circle cx="820" cy="760" r="300" fill="#ffc6da" opacity=".35"/>`)
add(`<circle cx="160" cy="1240" r="280" fill="#cdbdf5" opacity=".35"/>`)

chart({ x: 560, y: 70, cell: 26, rot: 6, rows: HEART, color: '#e0527f' })
granny({ x: -40, y: 880, cell: 30, rot: -8, n: 9 })
granny({ x: 640, y: 1150, cell: 22, rot: 10, n: 7 })

ball({ x: 90, y: 150, r: 62, c1: '#ffb3cc', c2: '#e0527f', rot: -20, tail: 'M 40 20 C 110 70 160 -10 230 50 S 330 130 400 70' })
ball({ x: 800, y: 620, r: 78, c1: '#d9c8ff', c2: '#8a6fd6', rot: 15, tail: 'M -70 20 C -150 80 -120 170 -210 190' })
ball({ x: 250, y: 1330, r: 70, c1: '#bff0d8', c2: '#4fb88a', rot: 30, tail: 'M 55 -10 C 130 -60 190 40 270 -10' })
ball({ x: 770, y: 1400, r: 50, c1: '#ffe7a8', c2: '#f0b53f', rot: -10 })

// pontinhos (cruzes de ponto alto)
const marks = [[120, 520], [700, 470], [430, 640], [820, 980], [90, 1090], [520, 1440], [330, 60], [860, 330]]
for (const [x, y] of marks) {
  add(`<g transform="translate(${x} ${y})" stroke="#e0527f" stroke-opacity=".35" stroke-width="5" stroke-linecap="round"><path d="M -9 -9 L 9 9 M 9 -9 L -9 9"/></g>`)
}

add('</svg>')

mkdirSync('public', { recursive: true })
writeFileSync('public/fundo-planos.svg', out.join('\n'))
console.log('public/fundo-planos.svg gerado')
