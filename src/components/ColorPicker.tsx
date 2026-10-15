import { useEffect, useRef, useState } from 'react'
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from '../engine/color'

interface EyeDropperApi {
  open(): Promise<{ sRGBHex: string }>
}
const eyeDropper = (): EyeDropperApi | null => {
  const C = (window as unknown as { EyeDropper?: new () => EyeDropperApi }).EyeDropper
  return C ? new C() : null
}

/** Seletor de cor: quadrado de tom, faixa de matiz, conta-gotas (onde o navegador tem) e campos R, G, B e hex. */
export function ColorPicker({ hex, onChange, onClose }: { hex: string; onChange: (hex: string) => void; onClose: () => void }) {
  const [hsv, setHsv] = useState(() => rgbToHsv(...hexToRgb(hex)))
  const [hexText, setHexText] = useState(hex)
  const area = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v)
  const current = rgbToHex(...rgb)

  useEffect(() => setHexText(current), [current])

  const apply = (next: { h: number; s: number; v: number }) => {
    setHsv(next)
    onChange(rgbToHex(...hsvToRgb(next.h, next.s, next.v)))
  }
  const setRgb = (i: 0 | 1 | 2, value: number) => {
    const c = [...rgb] as [number, number, number]
    c[i] = Math.min(255, Math.max(0, Math.round(value) || 0))
    apply(rgbToHsv(c[0], c[1], c[2], hsv.h))
  }
  const fromPointer = (e: React.PointerEvent) => {
    const r = area.current!.getBoundingClientRect()
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    apply({ h: hsv.h, s, v })
  }
  const commitHex = () => {
    const t = hexText.trim().startsWith('#') ? hexText.trim() : `#${hexText.trim()}`
    if (/^#[0-9a-fA-F]{6}$/.test(t)) {
      const [r, g, b] = hexToRgb(t)
      apply(rgbToHsv(r, g, b, hsv.h))
    } else setHexText(current)
  }
  const pick = async () => {
    try {
      const r = await eyeDropper()!.open()
      const [R, G, B] = hexToRgb(r.sRGBHex)
      apply(rgbToHsv(R, G, B, hsv.h))
    } catch { /* cancelou */ }
  }

  return (
    <div className="cpicker" role="dialog" aria-label="Ajustar a cor" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
      <div
        ref={area}
        className="cpicker__area"
        style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e) }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => { dragging.current = false }}
        onPointerCancel={() => { dragging.current = false }}
      >
        <span className="cpicker__dot" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>

      <div className="cpicker__row">
        {eyeDropper() && <button type="button" className="cpicker__eye" onClick={pick} aria-label="Pegar cor da tela" title="Pegar cor da tela">💧</button>}
        <span className="cpicker__preview" style={{ background: current }} aria-hidden />
        <input
          className="cpicker__hue"
          type="range"
          min={0}
          max={360}
          value={Math.round(hsv.h)}
          aria-label="Tonalidade"
          onChange={(e) => apply({ ...hsv, h: Number(e.target.value) })}
        />
      </div>

      <div className="cpicker__rgb">
        {(['R', 'G', 'B'] as const).map((l, i) => (
          <label key={l}>
            <input type="number" min={0} max={255} value={rgb[i]} onChange={(e) => setRgb(i as 0 | 1 | 2, Number(e.target.value))} aria-label={l} />
            <span>{l}</span>
          </label>
        ))}
        <label className="cpicker__hex">
          <input value={hexText} onChange={(e) => setHexText(e.target.value)} onBlur={commitHex} onKeyDown={(e) => { if (e.key === 'Enter') commitHex() }} aria-label="Código da cor" />
          <span>Hex</span>
        </label>
      </div>

      <button type="button" className="btn btn--sm" onClick={onClose}>Concluir</button>
    </div>
  )
}
