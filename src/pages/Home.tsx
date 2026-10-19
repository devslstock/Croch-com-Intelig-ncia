import { InstallPrompt } from '../components/InstallPrompt'
import { useOfflineReady } from '../offline/useOnline'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useAccount } from '../billing/AccountProvider'
import { canUseTools, imageLimit, monthlyLeft, PLAN_LABEL, type Account } from '../billing/plans'
import { AppBar } from '../components/AppBar'
import { ChartThumb } from '../components/ChartThumb'
import { UpgradeModal } from '../components/UpgradeModal'
import { toChartResult, type ChartStore, type SavedChart } from '../storage/charts'
import { YARN_PALETTES } from '../yarn/library'

interface Tool {
  view: 'assistente' | 'calculadora'
  icon: string
  title: string
  text: string
}

const TOOLS: Tool[] = [
  { view: 'assistente', icon: '💬', title: 'Assistente de vendas', text: 'Cole a conversa e receba uma resposta sugerida.' },
  { view: 'calculadora', icon: '🧮', title: 'Calculadora de preço', text: 'Material, horas e lucro: o preço certo da peça.' },
]

/** Linha de resumo do plano na tela inicial (cota do mês e gráficos de presente). */
function quotaText(a: Account): string {
  const lim = imageLimit(a)
  if (lim === null) return 'Imagens ilimitadas'
  const bonus = a.bonusImages > 0 ? `${a.bonusImages} gráfico${a.bonusImages === 1 ? '' : 's'} de presente` : ''
  if (a.effective === 'none') return bonus ? `${bonus} para criar · assine para continuar` : 'Sem imagens disponíveis'
  const month = `${monthlyLeft(a)} de ${lim} imagens restantes este mês`
  return bonus ? `${month} + ${bonus}` : month
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

export function Home({ store, onNew, onModels, onTool, onPlans, onUpgrade, onOpen }: { store: ChartStore; onNew: () => void; onModels: () => void; onTool: (t: 'assistente' | 'calculadora') => void; onPlans: () => void; onUpgrade: () => void; onOpen: (c: SavedChart, crochetar?: boolean) => void }) {
  const { user } = useAuth()
  const { account } = useAccount()
  const offlineReady = useOfflineReady()
  const [charts, setCharts] = useState<SavedChart[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [upgrade, setUpgrade] = useState(false)

  useEffect(() => {
    if (!user) return
    let alive = true
    store
      .list(user.id)
      .then((l) => alive && setCharts(l))
      .catch(() => alive && setError('Não consegui carregar seus gráficos.'))
    return () => {
      alive = false
    }
  }, [store, user])

  if (!user) return null
  const first = user.name.split(' ')[0]

  const remove = async (c: SavedChart) => {
    if (!window.confirm(`Apagar “${c.name}”? Isso não pode ser desfeito.`)) return
    try {
      await store.remove(user.id, c.id)
      setCharts((l) => (l ?? []).filter((x) => x.id !== c.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível apagar.')
    }
  }

  return (
    <div className="studio-page">
      <AppBar />
      <div className="app">
      <header className="top">
        <h1>Olá, {first}!</h1>
        <p>O que vamos criar hoje?</p>
      </header>

      <main>
        {user.demo && (
          <p className="notice" role="status">Modo demonstração: seus gráficos ficam só neste navegador e não vão para a nuvem.</p>
        )}

        <InstallPrompt />

        {account && (
          <button className="planchip" onClick={onPlans} aria-label="Minha assinatura">
            <b>{account.effective === 'none' ? 'Sem plano ativo' : account.trialEndsAt ? `Teste grátis · até ${fmtDate(account.trialEndsAt)}` : `Plano ${PLAN_LABEL[account.effective]}`}</b>
            <span>{quotaText(account)}</span>
            <em>Ver</em>
          </button>
        )}
        {offlineReady && !user.demo && <p className="offline-ready">📴 Pronto para usar sem internet</p>}

        <section className="home-grid" aria-label="Começar">
          <button className="tile tile--main" onClick={onNew}>
            <span className="tile__icon" aria-hidden>📷</span>
            <b>Foto em gráfico</b>
            <span>Envie uma foto e receba o gráfico com os fios certos.</span>
          </button>
          <button className="tile" onClick={onModels}>
            <span className="tile__icon" aria-hidden>🧸</span>
            <b>Modelos</b>
            <span>Desenhos, nomes e alfabeto prontos para usar.</span>
          </button>
        </section>

        <h2 className="section-title">Ferramentas</h2>
        <section className="tools" aria-label="Ferramentas">
          {TOOLS.map((t) => (
            <button
              key={t.title}
              className={`tool${account && !canUseTools(account) ? ' tool--locked' : ''}`}
              onClick={() => (account && !canUseTools(account) ? setUpgrade(true) : onTool(t.view))}
              aria-haspopup={account && !canUseTools(account) ? 'dialog' : undefined}
            >
              <span className="tile__icon" aria-hidden>{t.icon}</span>
              <b>{t.title}</b>
              <span>{t.text}</span>
              {account && !canUseTools(account) && <em className="badge">🔒 Plus</em>}
            </button>
          ))}
        </section>

        <h2 className="section-title">Meus gráficos</h2>
        {error && <p className="error" role="alert">{error}</p>}
        {charts === null && !error && <p className="hint">Carregando…</p>}
        {charts?.length === 0 && (
          <div className="card empty-card">
            <p>Você ainda não salvou nenhum gráfico.</p>
            <button className="btn btn--primary" onClick={onNew}>Criar o primeiro</button>
          </div>
        )}
        <section className="my-charts">
          {charts?.map((c) => {
            const yarn = YARN_PALETTES.find((y) => y.id === c.yarnId)
            return (
              <article key={c.id} className="chart-card">
                <div className="chart-card__thumb"><ChartThumb chart={toChartResult(c)} /></div>
                <div className="chart-card__body">
                  <h3>{c.name}</h3>
                  <p className="hint">
                    {c.width} × {c.height} pontos · {c.palette.length} cores
                    {yarn ? ` · ${yarn.brand} ${yarn.line}` : ''} · {fmtDate(c.createdAt)}
                  </p>
                  {c.progress > 0 && <p className="hint">Crochetando: carreira {Math.min(c.height, c.progress + 1)} de {c.height}</p>}
                  <div className="row row--tight">
                    <button className="btn btn--primary btn--sm" onClick={() => onOpen(c, true)}>Crochetar ▶</button>
                    <button className="btn btn--sm" onClick={() => onOpen(c)}>Editar</button>
                    <button className="btn btn--sm" onClick={() => remove(c)}>Apagar</button>
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      </main>
      </div>
      {upgrade && <UpgradeModal onClose={() => setUpgrade(false)} onChoose={() => { setUpgrade(false); onUpgrade() }} />}
    </div>
  )
}
