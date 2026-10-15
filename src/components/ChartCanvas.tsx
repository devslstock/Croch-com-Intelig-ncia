import { useEffect, useRef } from 'react'
import { crochetSize, drawCrochet } from '../chart/crochet'
import { canvasSize, drawChart, type RenderOptions } from '../chart/render'
import type { ChartResult } from '../engine/types'

export type ViewMode = 'grafico' | 'croche'

export function ChartCanvas({ chart, options, mode = 'grafico' }: { chart: ChartResult; options: RenderOptions; mode?: ViewMode }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    if (mode === 'croche') {
      const cell = Math.max(8, options.cell)
      const size = crochetSize(chart, cell)
      canvas.width = size.width
      canvas.height = size.height
      drawCrochet(ctx, chart, cell)
      return
    }
    const size = canvasSize(chart, options)
    canvas.width = size.width
    canvas.height = size.height
    drawChart(ctx, chart, options)
  }, [chart, options, mode])

  return <canvas ref={ref} className="chart-canvas" aria-label={mode === 'croche' ? 'Prévia em crochê' : 'Gráfico de crochê'} />
}
