// Gera src/yarn/data/ponto-cruz/Anchor__Mouline.csv a partir da tabela de equivalência Anchor ↔ DMC.
// Uso: node scripts/gerar-anchor.mjs
// Cada número Anchor pode ter vários equivalentes DMC. A cor (hex) usada é a da PRIMEIRA linha do número;
// o nome lista todos os equivalentes. Números com equivalentes de cor muito diferente são avisados no console.
import { readFileSync, writeFileSync } from 'node:fs'

const SRC = new URL('../src/yarn/fontes/Anchor-DMC-equivalencia.tsv', import.meta.url)
const OUT = new URL('../src/yarn/data/ponto-cruz/Anchor__Mouline.csv', import.meta.url)

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
function lab(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16)))
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}
const de = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

const groups = new Map()
for (const line of readFileSync(SRC, 'utf8').split(/\r?\n/).slice(1)) {
  const m = line.trim().match(/^(\S+)\s+(\S+)\s+(#[0-9a-fA-F]{6})\s*(.*)$/)
  if (!m) { if (line.trim()) console.warn('linha ignorada:', line); continue }
  const [, anchor, dmc, hex, name] = m
  const g = groups.get(anchor) ?? []
  g.push({ dmc, hex: hex.toLowerCase(), name: name.trim() })
  groups.set(anchor, g)
}

const rows = ['codigo,nome,hex']
const wide = []
for (const [anchor, g] of groups) {
  const dmcs = [...new Set(g.map((x) => x.dmc))]
  const spread = Math.max(...g.map((x) => de(lab(g[0].hex), lab(x.hex))))
  if (spread > 20) wide.push(`${anchor} (${dmcs.join('/')}) ΔE≈${spread.toFixed(0)}`)
  const nome = `${g[0].name} · ≈ DMC ${dmcs.join(', ')}`.replace(/"/g, '""')
  rows.push(`${anchor},"${nome}",${g[0].hex}`)
}
writeFileSync(OUT, rows.join('\n') + '\n')
console.log(`${groups.size} números Anchor gerados.`)
console.log(`Equivalentes de cor muito diferente (conferir): ${wide.length}`)
for (const w of wide) console.log('  ' + w)
