import { useEffect, useRef } from 'react'
import { crochetSize, drawCrochet } from '../chart/crochet'
import { MARGIN, canvasSize, drawChart, type RenderOptions } from '../chart/render'
import type { ChartResult } from '../engine/types'

export type ViewMode = 'grafico' | 'croche'

/**
 * Evento de toque/clique em um ponto do gráfico.
 * Mouse e caneta: down → move… → up (dá para arrastar pintando).
 * Dedo: só 'tap' (toque curto), para a página continuar rolando normalmente.
 */
export interface CellEvent {
  x: number
  y: number
  phase: 'down' | 'move' | 'up' | 'tap'
}

export function ChartCanvas({ chart, options, mode = 'grafico', onCell }: {
  chart: ChartResult
  options: RenderOptions
  mode?: ViewMode
  onCell?: (e: CellEvent) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const down = useRef<{ id: number; type: string; sx: number; sy: number; moved: boolean; x: number; y: number } | null>(null)

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

  const cellAt = (e: React.PointerEvent): { x: number; y: number } | null => {
    const c = ref.current!
    const r = c.getBoundingClientRect()
    const px = ((e.clientX - r.left) * c.width) / r.width
    const py = ((e.clientY - r.top) * c.height) / r.height
    const x = Math.floor((px - MARGIN) / options.cell)
    const y = Math.floor((py - MARGIN) / options.cell)
    return x >= 0 && y >= 0 && x < chart.width && y < chart.height ? { x, y } : null
  }

  const interactive = Boolean(onCell) && mode === 'grafico'

  return (
    <canvas
      ref={ref}
      className={interactive ? 'chart-canvas chart-canvas--edit' : 'chart-canvas'}
      aria-label={mode === 'croche' ? 'Prévia em crochê' : 'Gráfico de crochê'}
      onPointerDown={(e) => {
        if (!interactive) return
        const cell = cellAt(e)
        down.current = { id: e.pointerId, type: e.pointerType, sx: e.clientX, sy: e.clientY, moved: false, x: cell?.x ?? -1, y: cell?.y ?? -1 }
        if (e.pointerType !== 'touch') {
          e.currentTarget.setPointerCapture(e.pointerId)
          if (cell) onCell!({ ...cell, phase: 'down' })
        }
      }}
      onPointerMove={(e) => {
        const d = down.current
        if (!interactive || !d || d.id !== e.pointerId) return
        if (d.type === 'touch') {
          if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 8) d.moved = true
          return
        }
        const cell = cellAt(e)
        if (cell && (cell.x !== d.x || cell.y !== d.y)) {
          d.x = cell.x
          d.y = cell.y
          onCell!({ ...cell, phase: 'move' })
        }
      }}
      onPointerUp={(e) => {
        const d = down.current
        if (!interactive || !d || d.id !== e.pointerId) return
        down.current = null
        if (d.type === 'touch') {
          const cell = cellAt(e)
          if (!d.moved && cell) onCell!({ ...cell, phase: 'tap' })
          return
        }
        const cell = cellAt(e)
        onCell!({ x: cell?.x ?? d.x, y: cell?.y ?? d.y, phase: 'up' })
      }}
      onPointerCancel={() => { down.current = null }}
    />
  )
}
