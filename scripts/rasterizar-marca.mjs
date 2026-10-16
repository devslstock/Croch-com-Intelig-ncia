// Converte os SVG da marca (public/) em PNG e ICO, usando o Edge ou o Chrome já instalado.
// Uso: npm i --no-save puppeteer-core && node scripts/rasterizar-marca.mjs   (BROWSER=caminho do navegador, se precisar)
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const CANDIDATES = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)
const executablePath = CANDIDATES.find((p) => existsSync(p))
if (!executablePath) throw new Error('Nenhum navegador encontrado: informe o caminho em BROWSER.')

const JOBS = [
  ['public/logo-symbol.svg', 'public/icon-192.png', 192],
  ['public/logo-symbol.svg', 'public/icon-512.png', 512],
  ['public/icon-maskable.svg', 'public/icon-maskable-512.png', 512],
  ['public/icon-maskable.svg', 'public/apple-touch-icon.png', 180],
  ['public/favicon.svg', 'public/favicon-16.png', 16],
  ['public/favicon.svg', 'public/favicon-32.png', 32],
  ['public/favicon.svg', 'public/favicon-48.png', 48],
]

const browser = await puppeteer.launch({ executablePath, headless: 'new' })
const page = await browser.newPage()
for (const [src, dest, size] of JOBS) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 })
  const svg = readFileSync(src, 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `)
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`)
  writeFileSync(dest, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }))
  console.log(dest)
}
await browser.close()

// favicon.ico com 16, 32 e 48 px (cada imagem é um PNG)
const sizes = [16, 32, 48]
const pngs = sizes.map((s) => readFileSync(`public/favicon-${s}.png`))
const head = Buffer.alloc(6 + 16 * sizes.length)
head.writeUInt16LE(1, 2)
head.writeUInt16LE(sizes.length, 4)
let offset = head.length
sizes.forEach((s, i) => {
  const e = 6 + i * 16
  head[e] = s
  head[e + 1] = s
  head.writeUInt16LE(1, e + 4)
  head.writeUInt16LE(32, e + 6)
  head.writeUInt32LE(pngs[i].length, e + 8)
  head.writeUInt32LE(offset, e + 12)
  offset += pngs[i].length
})
writeFileSync('public/favicon.ico', Buffer.concat([head, ...pngs]))
console.log('public/favicon.ico')
