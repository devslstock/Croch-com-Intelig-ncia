import { useRef, useState } from 'react'

export interface Crop {
  x: number
  y: number
  w: number
  h: number
}

export const FULL_CROP: Crop = { x: 0, y: 0, w: 1, h: 1 }

/** Recorte manual: arraste sobre a foto para escolher a área. Valores em fração (0–1). */
export function CropPicker({ src, aspect, crop, onChange }: { src: string; aspect: number; crop: Crop; onChange: (c: Crop) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const point = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }

  const onDown = (e: React.PointerEvent) => {
    box.current!.setPointerCapture(e.pointerId)
    start.current = point(e)
    setDragging(true)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return
    const p = point(e)
    const x0 = Math.min(start.current.x, p.x)
    const y0 = Math.min(start.current.y, p.y)
    const w = Math.abs(p.x - start.current.x)
    const h = Math.abs(p.y - start.current.y)
    if (w > 0.02 && h > 0.02) onChange({ x: x0, y: y0, w, h })
  }
  const onUp = () => {
    start.current = null
    setDragging(false)
  }

  return (
    <div
      ref={box}
      className={`crop ${dragging ? 'crop--drag' : ''}`}
      style={{ aspectRatio: String(aspect) }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <img src={src} alt="Foto escolhida" draggable={false} />
      <div className="crop__shade" style={{ clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 0,${crop.x * 100}% ${crop.y * 100}%,${crop.x * 100}% ${(crop.y + crop.h) * 100}%,${(crop.x + crop.w) * 100}% ${(crop.y + crop.h) * 100}%,${(crop.x + crop.w) * 100}% ${crop.y * 100}%,${crop.x * 100}% ${crop.y * 100}%)` }} />
      <div className="crop__rect" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }} />
    </div>
  )
}
