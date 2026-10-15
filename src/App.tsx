import { useState } from 'react'
import { useAuth } from './auth/AuthProvider'
import { Converter } from './pages/Converter'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { supabase } from './auth/supabase'
import { localChartStore, type ChartStore, type SavedChart, type SavedChartInput } from './storage/charts'
import { supabaseChartStore } from './storage/supabaseCharts'

const cloudStore: ChartStore | null = supabase ? supabaseChartStore(supabase) : null

type View = { name: 'home' } | { name: 'new' } | { name: 'open'; chart: SavedChart }

/** Login primeiro; depois da entrada, a página inicial. */
export function App() {
  const { user, loading } = useAuth()
  const [view, setView] = useState<View>({ name: 'home' })

  if (loading) return <p className="empty">Carregando…</p>
  if (!user) return <Login />

  // Com conta de verdade: nuvem (Supabase). Em demonstração ou sem Supabase: só neste navegador.
  const store: ChartStore = !user.demo && cloudStore ? cloudStore : localChartStore
  const save = (input: SavedChartInput) => store.save(user.id, input)

  if (view.name === 'new') return <Converter onBack={() => setView({ name: 'home' })} onSave={save} />
  if (view.name === 'open') return <Converter key={view.chart.id} initial={view.chart} onBack={() => setView({ name: 'home' })} onSave={save} />
  return <Home store={store} onNew={() => setView({ name: 'new' })} onOpen={(chart) => setView({ name: 'open', chart })} />
}
