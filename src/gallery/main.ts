import type { RawImage } from '../engine/types'
import { runMethod } from '../embroidery/engine/methods'
import { inkShare, inkToRgba } from '../embroidery/engine/ops'
import { METHODS, defaultParams } from '../embroidery/engine/params'

const photos = import.meta.glob('../../test-photos/*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const LONG_SIDE = 700
const out = document.getElementById('out')!
const timings: Array<{ photo: string; method: string; ms: number; ink: number }> = []
;(window as unknown as { __timings: typeof timings; __done: boolean }).__timings = timings

const tick = () => new Promise((r) => setTimeout(r, 0))

async function load(url: string): Promise<{ raw: RawImage; el: HTMLCanvasElement }> {
  const img = new Image()
  img.src = url
  await img.decode()
  const k = Math.min(1, LONG_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.round(img.naturalWidth * k)
  const h = Math.round(img.naturalHeight * k)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  const d = ctx.getImageData(0, 0, w, h)
  return { raw: { data: d.data, width: w, height: h }, el: c }
}

async function main() {
  const entries = Object.entries(photos).sort(([a], [b]) => a.localeCompare(b))
  if (entries.length === 0) out.textContent = 'Coloque fotos autorizadas em test-photos/ (jpg, png ou webp).'
  for (const [path, url] of entries) {
    const name = path.split('/').pop()!
    const title = document.createElement('div')
    title.className = 'name'
    title.textContent = name
    out.appendChild(title)
    const row = document.createElement('div')
    row.className = 'row'
    out.appendChild(row)
    const { raw, el } = await load(url)
    const fig0 = document.createElement('figure')
    fig0.appendChild(el)
    fig0.insertAdjacentHTML('beforeend', `<figcaption>Original (${raw.width}×${raw.height})</figcaption>`)
    row.appendChild(fig0)
    for (const m of METHODS) {
      await tick()
      const t0 = performance.now()
      const ink = runMethod(m.id, raw, defaultParams())
      const ms = Math.round(performance.now() - t0)
      const c = document.createElement('canvas')
      c.width = raw.width
      c.height = raw.height
      c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(inkToRgba(ink, raw.width, raw.height)), raw.width, raw.height), 0, 0)
      const fig = document.createElement('figure')
      fig.appendChild(c)
      const share = inkShare(ink)
      fig.insertAdjacentHTML('beforeend', `<figcaption><b>${m.label}</b><br>${ms} ms · tinta ${(share * 100).toFixed(1)}%</figcaption>`)
      row.appendChild(fig)
      timings.push({ photo: name, method: m.id, ms, ink: share })
    }
  }
  ;(window as unknown as { __done: boolean }).__done = true
}

void main()
