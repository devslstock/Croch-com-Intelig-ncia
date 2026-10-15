import { useEffect, useState } from 'react'

/** Contador com − e +, e campo para digitar. O valor sempre fica entre min e max. */
export function Stepper({ label, unit, value, min, max, step = 1, onChange }: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])

  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)))
  const commit = () => {
    const n = Number(text)
    if (Number.isFinite(n) && text.trim() !== '') onChange(clamp(n))
    else setText(String(value))
  }

  return (
    <div className="stepper">
      <span className="side-label">{label}</span>
      <div className="stepper__row">
        <button type="button" className="stepper__btn" onClick={() => onChange(clamp(value - step))} disabled={value <= min} aria-label={`Diminuir ${label.toLowerCase()}`}>−</button>
        <input
          className="stepper__input"
          inputMode="numeric"
          value={text}
          aria-label={`${label} em ${unit}`}
          onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        />
        <span className="stepper__unit">{unit}</span>
        <button type="button" className="stepper__btn" onClick={() => onChange(clamp(value + step))} disabled={value >= max} aria-label={`Aumentar ${label.toLowerCase()}`}>+</button>
      </div>
    </div>
  )
}
