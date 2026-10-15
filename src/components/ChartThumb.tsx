import { useEffect, useRef } from 'react'
import type { ChartResult } from '../engine/types'

/** Miniatura: 1 pixel por ponto, ampliada com CSS (sem suavizar). */
export function ChartThumb({ chart }: { chart: ChartResult }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    canvas.width = chart.width
    canvas.height = chart.height
    const ctx = canvas.getContext('2d')!
    const img = ctx.createImageData(chart.width, chart.height)
    const rgb = chart.palette.map((p) => [1, 3, 5].map((i) => parseInt(p.hex.slice(i, i + 2), 16)))
    for (let i = 0; i < chart.grid.length; i++) {
      const c = rgb[chart.grid[i]] ?? [255, 255, 255]
      img.data[i * 4] = c[0]
      img.data[i * 4 + 1] = c[1]
      img.data[i * 4 + 2] = c[2]
      img.data[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }, [chart])
  return <canvas ref={ref} className="thumb" style={{ aspectRatio: `${chart.width} / ${chart.height}` }} aria-hidden />
}
