import { useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from './auth/supabase'
import { useAuth } from './auth/AuthProvider'
import { useAccount } from './billing/AccountProvider'
import { canCreateImage, canUseApp, canUseTools, type PaidPlan } from './billing/plans'
import { NavContext } from './nav'
import { OfflineBanner } from './components/OfflineBanner'
import { useOnline } from './offline/useOnline'
import { Admin } from './pages/Admin'
import { Plans, type PlansReason } from './pages/Plans'
import { Converter } from './pages/Converter'
import { Editor } from './pages/Editor'
import { Embroidery } from './pages/Embroidery'
import type { EmbProject } from './embroidery/project'
import { Home } from './pages/Home'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { usePublicRoute } from './landing/route'
import { ModelEditor } from './pages/ModelEditor'
import { Models } from './pages/Models'
import { PriceCalculator } from './pages/PriceCalculator'
import { SalesAssistant } from './pages/SalesAssistant'
import type { Model } from './models/library'
import { localChartStore, type ChartStore, type SavedChart, type SavedChartInput } from './storage/charts'
import { offlineChartStore } from './storage/offlineCharts'
import { supabaseChartStore } from './storage/supabaseCharts'

/** Nuvem com cópia no aparelho: funciona sem internet e envia o que ficou na fila quando a conexão volta. */
const cloudStore = supabase ? offlineChartStore(supabaseChartStore(supabase), window.localStorage) : null
const NO_SYNC = { pending: 0, rejected: [] as never[] }

type View = { name: 'home' } | { name: 'new' } | { name: 'models' } | { name: 'bordado'; project?: EmbProject } | { name: 'assistente' } | { name: 'calculadora' } | { name: 'model'; model: Model } | { name: 'edit'; chart: SavedChart; crochetar?: boolean } | { name: 'plans'; reason: PlansReason; preselect?: PaidPlan } | { name: 'admin' }

/** Login primeiro; depois a assinatura; depois a página inicial. Foto → gráfico → salvar → editor. */
export function App() {
  const { user, loading } = useAuth()
  const { account, loading: loadingAccount, error: accountError, reload, consumeDemoImage, consumeOfflineImage } = useAccount()
  const online = useOnline()
  const [view, setView] = useState<View>({ name: 'home' })
  const [route, goPublic] = usePublicRoute()

  // Estado do envio dos gráficos feitos sem internet (muda quando a fila anda).
  const syncKey = useSyncExternalStore(
    (fn) => (cloudStore ? cloudStore.subscribe(fn) : () => undefined),
    () => (cloudStore && user && !user.demo ? JSON.stringify(cloudStore.status(user.id)) : ''),
  )
  const sync = syncKey ? (JSON.parse(syncKey) as typeof NO_SYNC) : NO_SYNC

  // Com internet: envia a fila (ao entrar, quando a conexão volta e de minuto em minuto enquanto houver pendência).
  const userId = user && !user.demo ? user.id : null
  useEffect(() => {
    if (!cloudStore || !userId || !online) return
    const run = () => void cloudStore.flush(userId).then((r) => { if (r.sent > 0 || r.failed > 0) void reload() })
    run()
    const t = window.setInterval(() => { if (cloudStore.status(userId).pending > 0) run() }, 60_000)
    return () => window.clearInterval(t)
  }, [userId, online, reload])

  // Entrou: limpa o "#criar", "#saiba-mais" etc. do endereço.
  useEffect(() => {
    if (user && window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [user])

  if (loading) return <p className="empty">Carregando…</p>
  if (!user) {
    if (route.page === 'landing') return <Landing go={goPublic} />
    return (
      <Login
        key={`${route.mode}|${route.coupon}`}
        initialMode={route.mode}
        initialCoupon={route.coupon}
        onLearnMore={() => goPublic({ page: 'landing' })}
      />
    )
  }
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
    if (!input.id) {
      // Ficou só neste aparelho (sem internet): gasta da cota guardada; com internet o banco já contou.
      if (saved.queued) consumeOfflineImage()
      else void reload()
    }
    return saved
  }
  const home = () => setView({ name: 'home' })
  const nav = { goPlans: () => setView({ name: 'plans', reason: null }), goAdmin: () => setView({ name: 'admin' }) }

  const render = () => {
    // Sem assinatura ativa e sem gráficos de presente só se vê a tela de planos (o painel continua acessível a quem administra).
    if (!canUseApp(account) && view.name !== 'admin') {
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
    if (view.name === 'bordado') return <Embroidery initial={view.project} onBack={home} />
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
        onBordado={(project) => setView({ name: 'bordado', project })}
        onTool={(t) => (canUseTools(account) ? setView(t === 'assistente' ? { name: 'assistente' } : { name: 'calculadora' }) : setView({ name: 'plans', reason: 'tools' }))}
        onPlans={nav.goPlans}
        onUpgrade={() => setView({ name: 'plans', reason: 'tools', preselect: 'plus' })}
        onOpen={(chart, crochetar) => setView({ name: 'edit', chart, crochetar })}
      />
    )
  }

  return (
    <NavContext.Provider value={nav}>
      {!user.demo && (
        <OfflineBanner
          online={online} status={sync} account={account} userId={user.id}
          onPlans={() => setView({ name: 'plans', reason: null })}
          onDismiss={() => cloudStore?.dismissRejected(user.id)}
        />
      )}
      {render()}
    </NavContext.Provider>
  )
}
