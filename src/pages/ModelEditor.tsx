import { useMemo, useState } from 'react'
import { AppBar } from '../components/AppBar'
import { ChartCanvas, type ViewMode } from '../components/ChartCanvas'
import { ColorPicker } from '../components/ColorPicker'
import { Stepper } from '../components/Stepper'
import { composeModel, MODEL_MAX_WIDTH, MODEL_MIN_WIDTH } from '../models/compose'
import { nameLabel, type Model } from '../models/library'
import type { StartSide } from '../engine/types'
import type { SavedChart, SavedChartInput } from '../storage/charts'
import { defaultYarnId } from '../yarn/library'

const LETTER_COLORS = ['#8a4b1f', '#222222', '#ffffff', '#c4573a', '#7b2a33', '#2f5f8f', '#3a7a3a', '#d98aa0']

export function ModelEditor({ model, onBack, onSave, onSaved }: {
  model: Model
  onBack: () => void
  onSave: (input: SavedChartInput) => Promise<SavedChart>
  onSaved: (saved: SavedChart) => void
}) {
  const [name, setName] = useState(model.sample)
  const [date, setDate] = useState('')
  const [textColor, setTextColor] = useState(model.sampleColor)
  const [custom, setCustom] = useState<string[]>([])
  const [picking, setPicking] = useState(false)
  const [width, setWidth] = useState(70)
  const [withBg, setWithBg] = useState(true)
  const [tab, setTab] = useState<ViewMode>('grafico')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chart = useMemo(() => composeModel(model, { name, date, textColor, width, withBg }), [model, name, date, textColor, width, withBg])
  const cell = Math.max(4, Math.min(14, Math.floor(640 / chart.height)))
  const options = useMemo(() => ({ cell, symbols: false, startSide: 'right' as StartSide, legend: false }), [cell])
  const swatches = [...new Set([model.sampleColor, ...LETTER_COLORS, ...custom])]
  const showText = !model.plain || Boolean(model.recipe)

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      let startSide: StartSide = 'right'
      try { if (localStorage.getItem('tramado:side') === 'left') startSide = 'left' } catch { /* sem armazenamento */ }
      const title = !model.plain && name.trim() ? `${model.title} · ${name.trim()}` : model.title
      const saved = await onSave({ name: title, chart, yarnId: defaultYarnId(), picked: {}, startSide })
      onSaved(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar o gráfico.')
      setBusy(false)
    }
  }

  return (
    <div className="studio-page">
      <AppBar title={model.title} onBack={onBack} />
      <div className="studio">
        <aside className="studio__side" aria-label="Personalizar o modelo">
          <button className="linkbtn linkbtn--left" onClick={onBack}>← Ver todos os modelos</button>

          {!model.plain && (
            <>
              <label className="field">
                <span className="side-label">{nameLabel(model)}</span>
                <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="field">
                <span className="side-label">Data (opcional)</span>
                <input className="input" value={date} maxLength={20} placeholder="deixe em branco se não quiser" onChange={(e) => setDate(e.target.value)} />
              </label>
              <p className="hint">Letras sem acento ficam mais fáceis de crochetar, mas acento e Ç também funcionam. Para um coração, escreva &lt;3.</p>
            </>
          )}

          {showText && (
            <div>
              <span className="side-label">Cor das letras</span>
              <div className="swatches" role="radiogroup" aria-label="Cor das letras">
                {swatches.map((c) => (
                  <button key={c} role="radio" aria-checked={textColor === c} className={textColor === c ? 'dot dot--lg dot--on' : 'dot dot--lg'} style={{ background: c }} aria-label={`Cor ${c}`} onClick={() => setTextColor(c)} />
                ))}
                <button className="dot dot--lg dot--add" aria-label="Escolher outra cor" onClick={() => setPicking((p) => !p)}>+</button>
              </div>
              {picking && (
                <ColorPicker
                  hex={textColor}
                  onChange={(h) => { setTextColor(h); setCustom((l) => (l.includes(h) || l.length > 6 ? l : [...l.slice(-5), h])) }}
                  onClose={() => setPicking(false)}
                />
              )}
            </div>
          )}

          <Stepper label="Tamanho" unit="pontos" value={width} min={MODEL_MIN_WIDTH} max={MODEL_MAX_WIDTH} onChange={setWidth} />
          <p className="hint">{chart.width} × {chart.height} pontos · {chart.palette.length} cores</p>

          <label className="check">
            <input type="checkbox" checked={withBg} onChange={(e) => setWithBg(e.target.checked)} />
            Fundo colorido
          </label>
        </aside>

        <main className="studio__main">
          <div className="toolbar">
            <button className="btn" onClick={onBack}>Outro modelo</button>
            <button className="btn btn--primary" onClick={create} disabled={busy}>{busy ? 'Criando…' : 'Criar gráfico'}</button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}

          <div className="viewtabs viewtabs--center" role="tablist">
            <button role="tab" aria-selected={tab === 'grafico'} className={tab === 'grafico' ? 'viewtab viewtab--on' : 'viewtab'} onClick={() => setTab('grafico')}>Gráfico</button>
            <button role="tab" aria-selected={tab === 'croche'} className={tab === 'croche' ? 'viewtab viewtab--on' : 'viewtab'} onClick={() => setTab('croche')}>Como fica em crochê</button>
          </div>

          <section className="card chartcard">
            <div className="chart-scroll chart-scroll--tall">
              <ChartCanvas chart={chart} options={options} mode={tab} />
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
