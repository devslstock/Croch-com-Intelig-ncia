// Gera os ícones do app (PNG) em public/. Uso: node scripts/gerar-icones.mjs
// Desenho próprio: fundo rosa com uma grade de pontos de crochê. Sem dependências.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const BG = [0xf7, 0xbf, 0xd2] // --brand
const DOT = [0xa8, 0x42, 0x6f] // --accent
const SOFT = [0xff, 0xf7, 0xf2] // --bg

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}

/** `safe` = fração da borda reservada (ícone "maskable" precisa de margem). */
function icon(size, { maskable }) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  const grid = 5
  const area = maskable ? 0.56 : 0.72 // parte do ícone ocupada pela grade
  const origin = (1 - area) / 2
  const cell = (area * size) / grid
  const radius = size * 0.22
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      let [r, g, b] = BG
      let a = 255
      if (!maskable) {
        // cantos arredondados
        const dx = Math.max(radius - x, x - (size - 1 - radius), 0)
        const dy = Math.max(radius - y, y - (size - 1 - radius), 0)
        const d = Math.hypot(dx, dy)
        if (d > radius) a = 0
        else if (d > radius - 1) a = Math.round(255 * (radius - d))
      }
      const gx = (x - origin * size) / cell
      const gy = (y - origin * size) / cell
      if (gx >= 0 && gy >= 0 && gx < grid && gy < grid) {
        const cx = (gx % 1) - 0.5
        const cy = (gy % 1) - 0.5
        const inside = Math.hypot(cx, cy) < 0.36
        // "T" formado por pontos escuros sobre pontos claros
        const col = Math.floor(gx)
        const row = Math.floor(gy)
        const dark = row === 0 || col === 2
        if (inside) [r, g, b] = dark ? DOT : SOFT
      }
      const i = y * (size * 4 + 1) + 1 + x * 4
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
      raw[i + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public', { recursive: true })
writeFileSync('public/icon-192.png', icon(192, { maskable: false }))
writeFileSync('public/icon-512.png', icon(512, { maskable: false }))
writeFileSync('public/icon-maskable-512.png', icon(512, { maskable: true }))
writeFileSync('public/apple-touch-icon.png', icon(180, { maskable: true }))
console.log('Ícones gerados em public/')
