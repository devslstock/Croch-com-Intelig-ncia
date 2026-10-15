import { useMemo, useState } from 'react'
import { AppBar } from '../components/AppBar'
import { ChartThumb } from '../components/ChartThumb'
import { composeModel } from '../models/compose'
import { CATEGORY_ICON, CATEGORY_LABEL, MODEL_CATEGORIES, MODELS, type Model, type ModelCategory } from '../models/library'

/** Catálogo de modelos: desenhos prontos para colocar nome e data. */
export function Models({ onBack, onPick }: { onBack: () => void; onPick: (m: Model) => void }) {
  const [filter, setFilter] = useState<'todos' | ModelCategory>('todos')
  const previews = useMemo(
    () => new Map(MODELS.map((m) => [m.id, composeModel(m, { name: m.sample, date: '', textColor: m.sampleColor, width: m.recipe ? 70 : 40, withBg: true })])),
    [],
  )
  const list = MODELS.filter((m) => filter === 'todos' || m.category === filter)

  return (
    <div className="studio-page">
      <AppBar title="Modelos" onBack={onBack} />
      <div className="app app--wide">
        <header className="top">
          <h1>Modelos</h1>
          <p>Escolha um desenho e escreva o nome ou a data: o gráfico sai pronto, com as letras já em pontos. Aqui também ficam os gráficos prontos e as receitas.</p>
        </header>

        <div className="pills" role="tablist" aria-label="Tipos de modelo">
          <button role="tab" aria-selected={filter === 'todos'} className={filter === 'todos' ? 'pill pill--on' : 'pill'} onClick={() => setFilter('todos')}>Todos</button>
          {MODEL_CATEGORIES.map((c) => (
            <button key={c} role="tab" aria-selected={filter === c} className={filter === c ? 'pill pill--on' : 'pill'} onClick={() => setFilter(c)}>
              <span aria-hidden>{CATEGORY_ICON[c]}</span> {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>

        <ul className="model-grid">
          {list.map((m) => (
            <li key={m.id}>
              <button className="model-card" onClick={() => onPick(m)}>
                <span className="model-card__img" style={{ background: m.bg }}><ChartThumb chart={previews.get(m.id)!} /></span>
                <span className="model-card__title">{m.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
