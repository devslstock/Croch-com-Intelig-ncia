import { useState } from 'react'
import { supabase } from './auth/supabase'
import { useAuth } from './auth/AuthProvider'
import { useAccount } from './billing/AccountProvider'
import { canCreateImage, canUseTools, type PaidPlan } from './billing/plans'
import { NavContext } from './nav'
import { Admin } from './pages/Admin'
import { Plans, type PlansReason } from './pages/Plans'
import { Converter } from './pages/Converter'
import { Editor } from './pages/Editor'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { ModelEditor } from './pages/ModelEditor'
import { Models } from './pages/Models'
import { PriceCalculator } from './pages/PriceCalculator'
import { SalesAssistant } from './pages/SalesAssistant'
import type { Model } from './models/library'
import { localChartStore, type ChartStore, type SavedChart, type SavedChartInput } from './storage/charts'
import { supabaseChartStore } from './storage/supabaseCharts'

const cloudStore: ChartStore | null = supabase ? supabaseChartStore(supabase) : null

type View = { name: 'home' } | { name: 'new' } | { name: 'models' } | { name: 'assistente' } | { name: 'calculadora' } | { name: 'model'; model: Model } | { name: 'edit'; chart: SavedChart; crochetar?: boolean } | { name: 'plans'; reason: PlansReason; preselect?: PaidPlan } | { name: 'admin' }

/** Login primeiro; depois a assinatura; depois a página inicial. Foto → gráfico → salvar → editor. */
export function App() {
  const { user, loading } = useAuth()
  const { account, loading: loadingAccount, error: accountError, reload, consumeDemoImage } = useAccount()
  const [view, setView] = useState<View>({ name: 'home' })

  if (loading) return <p className="empty">Carregando…</p>
  if (!user) return <Login />
  if (!account) {
    return accountError ? (
      <div className="app"><p className="error" role="alert">{accountError}</p><button className="btn" onClick={() => void reload()}>Tentar de novo</button></div>
    ) : (
      <p className="empty">{loadingAccount ? 'Carregando…' : ''}</p>
    )
  }

  // Com conta de verdade: nuvem (Supabase). Em demonstração ou sem Supabase: só neste navegador.
  const store: ChartStore = !user.demo && cloudStore ? cloudStore : localChartStore
  const save = async (input: SavedChartInput) => {
    // Imagem nova gasta a cota. No Supabase quem conta é o banco; na demonstração, o app.
    if (!input.id && account.demo) consumeDemoImage()
    const saved = await store.save(user.id, input)
    if (!input.id) void reload()
    return saved
  }
  const home = () => setView({ name: 'home' })
  const nav = { goPlans: () => setView({ name: 'plans', reason: null }), goAdmin: () => setView({ name: 'admin' }) }

  const render = () => {
    // Sem assinatura ativa só se vê a tela de planos (o painel continua acessível a quem administra).
    if (account.effective === 'none' && view.name !== 'admin') {
      return <Plans reason={account.blocked ? null : 'inactive'} onBack={home} onAdmin={nav.goAdmin} />
    }
    if (view.name === 'admin') return <Admin onBack={home} />
    if (view.name === 'plans') return <Plans reason={view.reason} preselect={view.preselect} onBack={home} onAdmin={nav.goAdmin} />
    if (view.name === 'new') return <Converter onBack={home} onSave={save} onSaved={(chart) => setView({ name: 'edit', chart })} />
    if (view.name === 'assistente' || view.name === 'calculadora') {
      if (!canUseTools(account)) return <Plans reason="tools" onBack={home} />
      return view.name === 'assistente'
        ? <SalesAssistant onBack={home} onCalculator={() => setView({ name: 'calculadora' })} />
        : <PriceCalculator store={store} onBack={home} onAssistant={() => setView({ name: 'assistente' })} />
    }
    if (view.name === 'models') return <Models onBack={home} onPick={(model) => (canCreateImage(account) ? setView({ name: 'model', model }) : setView({ name: 'plans', reason: 'limit' }))} />
    if (view.name === 'model') {
      return <ModelEditor model={view.model} onBack={() => setView({ name: 'models' })} onSave={save} onSaved={(chart) => setView({ name: 'edit', chart })} />
    }
    if (view.name === 'edit') return <Editor key={view.chart.id} saved={view.chart} startInCrochetar={view.crochetar} onBack={home} onSave={save} />
    return (
      <Home
        store={store}
        onNew={() => (canCreateImage(account) ? setView({ name: 'new' }) : setView({ name: 'plans', reason: 'limit' }))}
        onModels={() => setView({ name: 'models' })}
        onTool={(t) => (canUseTools(account) ? setView(t === 'assistente' ? { name: 'assistente' } : { name: 'calculadora' }) : setView({ name: 'plans', reason: 'tools' }))}
        onPlans={nav.goPlans}
        onUpgrade={() => setView({ name: 'plans', reason: 'tools', preselect: 'plus' })}
        onOpen={(chart, crochetar) => setView({ name: 'edit', chart, crochetar })}
      />
    )
  }

  return <NavContext.Provider value={nav}>{render()}</NavContext.Provider>
}
