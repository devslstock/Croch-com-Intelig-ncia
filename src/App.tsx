import { useState } from 'react'
import { supabase } from './auth/supabase'
import { useAuth } from './auth/AuthProvider'
import { Converter } from './pages/Converter'
import { Editor } from './pages/Editor'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { ModelEditor } from './pages/ModelEditor'
import { Models } from './pages/Models'
import type { Model } from './models/library'
import { localChartStore, type ChartStore, type SavedChart, type SavedChartInput } from './storage/charts'
import { supabaseChartStore } from './storage/supabaseCharts'

const cloudStore: ChartStore | null = supabase ? supabaseChartStore(supabase) : null

type View = { name: 'home' } | { name: 'new' } | { name: 'models' } | { name: 'model'; model: Model } | { name: 'edit'; chart: SavedChart; crochetar?: boolean }

/** Login primeiro; depois da entrada, a página inicial. Foto → gráfico → salvar → editor. */
export function App() {
  const { user, loading } = useAuth()
  const [view, setView] = useState<View>({ name: 'home' })

  if (loading) return <p className="empty">Carregando…</p>
  if (!user) return <Login />

  // Com conta de verdade: nuvem (Supabase). Em demonstração ou sem Supabase: só neste navegador.
  const store: ChartStore = !user.demo && cloudStore ? cloudStore : localChartStore
  const save = (input: SavedChartInput) => store.save(user.id, input)
  const home = () => setView({ name: 'home' })

  if (view.name === 'new') return <Converter onBack={home} onSave={save} onSaved={(chart) => setView({ name: 'edit', chart })} />
  if (view.name === 'models') return <Models onBack={home} onPick={(model) => setView({ name: 'model', model })} />
  if (view.name === 'model') {
    return <ModelEditor model={view.model} onBack={() => setView({ name: 'models' })} onSave={save} onSaved={(chart) => setView({ name: 'edit', chart })} />
  }
  if (view.name === 'edit') return <Editor key={view.chart.id} saved={view.chart} startInCrochetar={view.crochetar} onBack={home} onSave={save} />
  return (
    <Home
      store={store}
      onNew={() => setView({ name: 'new' })}
      onModels={() => setView({ name: 'models' })}
      onOpen={(chart, crochetar) => setView({ name: 'edit', chart, crochetar })}
    />
  )
}
