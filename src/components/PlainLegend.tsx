import { useState } from 'react'
import type { ChartResult } from '../engine/types'
import { ColorPicker } from './ColorPicker'

/** Legenda sem fio (cores livres): letra, cor e quantidade de pontos. Tocar na cor abre o ajuste manual. */
export function PlainLegend({ chart, onColorChange }: { chart: ChartResult; onColorChange?: (letter: string, hex: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <ul className="legend">
      {chart.palette.map((p) => (
        <li key={p.letter} className={editing === p.letter ? 'legend__item legend__item--open' : 'legend__item'}>
          {onColorChange ? (
            <button className="swatch swatch--btn" style={{ background: p.hex }} onClick={() => setEditing(editing === p.letter ? null : p.letter)} aria-label={`Ajustar a cor ${p.letter}`} />
          ) : (
            <span className="swatch" style={{ background: p.hex }} />
          )}
          <b>{p.letter}</b> <span>{p.count.toLocaleString('pt-BR')} pontos</span>
          {editing === p.letter && onColorChange && (
            <div className="legend__picker"><ColorPicker hex={p.hex} onChange={(h) => onColorChange(p.letter, h)} onClose={() => setEditing(null)} /></div>
          )}
        </li>
      ))}
    </ul>
  )
}
