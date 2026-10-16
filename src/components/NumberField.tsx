import { useEffect, useState } from 'react'
import { parseDecimal } from '../tools/pricing'

/** Campo de número que aceita vírgula (12,50). Só atualiza o valor quando o texto é válido. */
export function NumberField({ label, value, onChange, suffix, prefix, hint, max = 1_000_000 }: {
  label: string
  value: number
  onChange: (v: number) => void
  suffix?: string
  prefix?: string
  hint?: string
  max?: number
}) {
  const fmt = (v: number) => (v === 0 ? '' : String(Math.round(v * 100) / 100).replace('.', ','))
  const [text, setText] = useState(fmt(value))
  useEffect(() => {
    // só reescreve o texto quando o valor mudou por fora (ex.: importar de um gráfico)
    setText((t) => (parseDecimal(t) === value ? t : fmt(value)))
  }, [value])

  return (
    <label className="field numfield">
      <span>{label}</span>
      <span className="numfield__box">
        {prefix && <i>{prefix}</i>}
        <input
          inputMode="decimal"
          value={text}
          placeholder="0"
          onChange={(e) => {
            const t = e.target.value.replace(/[^\d.,]/g, '')
            setText(t)
            onChange(Math.min(max, parseDecimal(t)))
          }}
          onBlur={() => setText(fmt(value))}
        />
        {suffix && <i>{suffix}</i>}
      </span>
      {hint && <small className="hint">{hint}</small>}
    </label>
  )
}
