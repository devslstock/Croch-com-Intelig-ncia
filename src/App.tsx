import { useState } from 'react'
import { useAuth } from './auth/AuthProvider'
import { Converter } from './pages/Converter'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { localChartStore, type SavedChart, type SavedChartInput } from './storage/charts'

type View = { name: 'home' } | { name: 'new' } | { name: 'open'; chart: SavedChart }

/** Login primeiro; depois da entrada, a página inicial. */
export function App() {
  const { user, loading } = useAuth()
  const [view, setView] = useState<View>({ name: 'home' })

  if (loading) return <p className="empty">Carregando…</p>
  if (!user) return <Login />

  const save = (input: SavedChartInput) => localChartStore.save(user.id, input)

  if (view.name === 'new') return <Converter onBack={() => setView({ name: 'home' })} onSave={save} />
  if (view.name === 'open') return <Converter key={view.chart.id} initial={view.chart} onBack={() => setView({ name: 'home' })} onSave={save} />
  return <Home store={localChartStore} onNew={() => setView({ name: 'new' })} onOpen={(chart) => setView({ name: 'open', chart })} />
}
