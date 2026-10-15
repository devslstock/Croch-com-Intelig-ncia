import { useEffect, useRef } from 'react'
import { canvasSize, drawChart, type RenderOptions } from '../chart/render'
import type { ChartResult } from '../engine/types'

export function ChartCanvas({ chart, options }: { chart: ChartResult; options: RenderOptions }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const size = canvasSize(chart, options)
    canvas.width = size.width
    canvas.height = size.height
    drawChart(canvas.getContext('2d')!, chart, options)
  }, [chart, options])

  return <canvas ref={ref} className="chart-canvas" aria-label="Gráfico de crochê" />
}
