import { useState } from 'react'
import type { ChartResult } from '../engine/types'
import { ColorPicker } from './ColorPicker'
import type { ColorMatch, YarnColor, YarnPalette } from '../yarn/yarn'

const label = (y: YarnColor) => `${y.code} ${y.name}`.trim()

export function YarnLegend({
  chart,
  yarn,
  matches,
  onChoose,
  onColorChange,
}: {
  chart: ChartResult
  yarn: YarnPalette
  matches: ColorMatch[]
  onChoose: (letter: string, code: string) => void
  /** Ajuste manual da cor (toque na amostra). O fio sugerido acompanha a nova cor. */
  onColorChange?: (letter: string, hex: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const listId = `yarn-list-${yarn.id}`
  return (
    <>
    {/* Uma única lista de sugestões para todas as cores (488 opções não precisam se repetir em cada linha). */}
    <datalist id={listId}>
      {yarn.colors.map((c) => (
        <option key={c.code} value={label(c)} />
      ))}
    </datalist>
    <ul className="yarn-legend">
      {matches.map((m) => {
        const entry = chart.palette.find((p) => p.letter === m.letter)!
        return (
          <li key={m.letter}>
            {onColorChange ? (
              <button className="swatch swatch--lg swatch--btn" style={{ background: entry.hex }} title="Ajustar a cor" aria-label={`Ajustar a cor ${m.letter}`} onClick={() => setEditing(editing === m.letter ? null : m.letter)} />
            ) : (
              <span className="swatch swatch--lg" style={{ background: entry.hex }} title="Cor no gráfico" />
            )}
            <div className="yarn-legend__body">
              <div className="yarn-legend__head">
                <b>{m.letter}</b>
                <input
                  className="yarn-input"
                  list={listId}
                  value={label(m.best.yarn)}
                  aria-label={`Fio da cor ${m.letter}`}
                  onChange={(e) => {
                    const hit = yarn.colors.find((c) => label(c) === e.target.value)
                    if (hit) onChoose(m.letter, hit.code)
                  }}
                />
                <span className="yarn-legend__count">{m.count.toLocaleString('pt-BR')}</span>
              </div>
              <div className="chips">
                <span className="chips__label">Parecidas:</span>
                {m.alternatives.map((a) => (
                  <button key={a.yarn.code} className="chip" onClick={() => onChoose(m.letter, a.yarn.code)} title={a.yarn.name}>
                    <span className="chip__dot" style={{ background: a.yarn.hex }} />
                    {a.yarn.code}
                  </button>
                ))}
              </div>
              {editing === m.letter && onColorChange && (
                <ColorPicker hex={entry.hex} onChange={(h) => onColorChange(m.letter, h)} onClose={() => setEditing(null)} />
              )}
            </div>
          </li>
        )
      })}
    </ul>
    </>
  )
}
