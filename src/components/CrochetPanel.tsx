import { useState } from 'react'
import { rowGuide } from '../editor/crochetRows'
import type { ChartResult, StartSide } from '../engine/types'
import type { ColorMatch } from '../yarn/yarn'

const SIDE: Record<StartSide, string> = { right: 'direita', left: 'esquerda' }

export interface CrochetState {
  /** Carreiras já feitas. */
  progress: number
  /** Pontos já feitos na carreira atual. */
  stitch: number
}

/** Modo Crochetar: a carreira atual, o contador de pontos e os pontos seguidos por cor. */
export function CrochetPanel({ chart, matches, startSide, alternate, state, onChange, onAlternate, onExit, zoom, onZoom }: {
  chart: ChartResult
  matches: ColorMatch[]
  startSide: StartSide
  alternate: boolean
  state: CrochetState
  onChange: (s: CrochetState) => void
  onAlternate: (v: boolean) => void
  onExit: () => void
  zoom: number
  onZoom: (z: number) => void
}) {
  const { width, height, grid, palette } = chart
  const { progress, stitch } = state
  const [jump, setJump] = useState(false)
  const [jumpTo, setJumpTo] = useState('')
  const finished = progress >= height
  const row = Math.min(height, progress + 1)
  const guide = rowGuide(grid, width, height, row, startSide, alternate)
  const to: StartSide = guide.from === 'right' ? 'left' : 'right'
  const yarnOf = (letter: string) => matches.find((m) => m.letter === letter)?.best.yarn
  const percent = Math.round((progress / height) * 100)

  const setStitch = (n: number) => onChange({ progress, stitch: Math.max(0, Math.min(width, n)) })
  const setRows = (n: number) => onChange({ progress: Math.max(0, Math.min(height, n)), stitch: 0 })

  let acc = 0
  const ends = guide.runs.map((r) => (acc += r.count))
  const current = ends.findIndex((e) => stitch < e)

  const toggleRun = (i: number) => {
    const end = ends[i]
    const start = end - guide.runs[i].count
    setStitch(stitch >= end ? start : end)
  }

  const submitJump = () => {
    const n = Number(jumpTo)
    if (Number.isFinite(n) && n >= 1 && n <= height) {
      setRows(n - 1)
      setJump(false)
      setJumpTo('')
    }
  }

  return (
    <section className="crochetar" aria-label="Modo Crochetar">
      <div className="progressbar" role="progressbar" aria-valuemin={0} aria-valuemax={height} aria-valuenow={progress}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="hint">{percent}% da peça</p>

      {finished ? (
        <p className="crochetar__done">Peça terminada! 🎉 Todas as {height} carreiras foram feitas.</p>
      ) : (
        <>
          <p className="crochetar__big">
            <span>Carreira</span> <b>{row}</b> <span>de {height}</span>
          </p>
          <p className="crochetar__dir">{guide.from === 'right' ? '← da direita para a esquerda' : 'da esquerda para a direita →'}</p>
          <span className="sr-only">Começa pela {SIDE[guide.from]} e vai para a {SIDE[to]}</span>
        </>
      )}

      <div className="crochetar__nav">
        <button className="btn" onClick={() => setRows(progress - 1)} disabled={progress <= 0}>← Carreira anterior</button>
        <button className="btn btn--primary" onClick={() => setRows(progress + 1)} disabled={finished}>Carreira feita ✓</button>
      </div>

      {!finished && (
        <>
          <div className="crochetar__count">
            <button className="btn btn--sm" onClick={() => setStitch(stitch - 1)} disabled={stitch <= 0} aria-label="Desfazer um ponto">−1</button>
            <span>{stitch} de {width} pontos</span>
            <button className="btn btn--sm btn--strong" onClick={() => setStitch(stitch + 1)} disabled={stitch >= width} aria-label="Marcar um ponto feito">+1</button>
          </div>

          <ol className="runs">
            {guide.runs.map((r, i) => {
              const p = palette[r.color]
              const y = yarnOf(p.letter)
              const done = stitch >= ends[i]
              return (
                <li key={i} className={done ? 'run run--done' : i === current ? 'run run--now' : 'run'}>
                  <span className="run__letter" style={{ background: p.hex }}>{p.letter}</span>
                  <span className="run__what"><b>{r.count}</b> pontos {y ? `${y.code} ${y.name}` : ''}</span>
                  <button className="run__check" role="checkbox" aria-checked={done} aria-label={`Marcar ${r.count} pontos ${p.letter}`} onClick={() => toggleRun(i)}>{done ? '✓' : ''}</button>
                </li>
              )
            })}
          </ol>
        </>
      )}

      {jump ? (
        <div className="crochetar__jump">
          <input className="input" inputMode="numeric" placeholder={`1 a ${height}`} value={jumpTo} onChange={(e) => setJumpTo(e.target.value.replace(/[^\d]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') submitJump() }} aria-label="Ir para a carreira" autoFocus />
          <button className="btn btn--sm btn--primary" onClick={submitJump}>Ir</button>
          <button className="btn btn--sm" onClick={() => setJump(false)}>Cancelar</button>
        </div>
      ) : (
        <button className="linkbtn" onClick={() => setJump(true)}>Pular para uma carreira</button>
      )}

      <div className="crochetar__zoom">
        <button className="btn btn--sm" onClick={() => onZoom(Math.max(4, zoom - 2))} aria-label="Diminuir o zoom">− zoom</button>
        <button className="btn btn--sm" onClick={() => onZoom(Math.min(28, zoom + 2))} aria-label="Aumentar o zoom">+ zoom</button>
      </div>

      <label className="check">
        <input type="checkbox" checked={alternate} onChange={(e) => onAlternate(e.target.checked)} />
        Trocar de lado a cada carreira (idas e vindas)
      </label>
      <div className="row">
        <button className="btn btn--sm" onClick={onExit}>Sair do modo Crochetar</button>
        <button className="btn btn--sm btn--ghost" onClick={() => setRows(0)} disabled={progress === 0 && stitch === 0}>Recomeçar do zero</button>
      </div>
    </section>
  )
}
