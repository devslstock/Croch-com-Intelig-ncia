import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../auth/supabase'
import { localAdminStore, supabaseAdminStore, type AdminStore } from './adminStore'
import type { Account } from './plans'
import { isOffline, withTimeout } from '../offline/net'
import { cacheAccount, consumeOfflineImage, loadOfflineAccount } from './offlineAccount'
import { localAccountStore, supabaseAccountStore, type AccountStore } from './store'

interface AccountApi {
  account: Account | null
  loading: boolean
  error: string | null
  reload(): Promise<void>
  store: AccountStore
  admin: AdminStore
  /** Demonstração: conta uma imagem nova na cota local (no Supabase quem conta é o banco). */
  consumeDemoImage(): void
  /** Sem internet: gasta uma imagem na cota guardada no aparelho (o servidor confere quando a conexão voltar). */
  consumeOfflineImage(): void
  resetDemo(): void
}

const Ctx = createContext<AccountApi | null>(null)

const local = localAccountStore(window.localStorage)
const localAdmin = localAdminStore(window.localStorage)

export function AccountProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const useCloud = !!user && !user.demo && !!supabase
  const store: AccountStore = useMemo(() => (useCloud && supabase ? supabaseAccountStore(supabase) : local), [useCloud])
  const admin: AdminStore = useMemo(() => (useCloud && supabase ? supabaseAdminStore(supabase) : localAdmin), [useCloud])
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Conta de verdade: confirma com a internet e guarda uma cópia; sem internet, usa a cópia (com o plano recalculado). */
  const fetchAccount = useCallback(async (): Promise<Account> => {
    try {
      // Sem internet (ou conexão lenta demais): nem espera a nuvem, vai direto para a cópia do aparelho.
      if (useCloud && isOffline()) throw new Error('offline')
      const a = useCloud ? await withTimeout(store.get(), 8000, () => new Error('lento')) : await store.get()
      if (useCloud && user) cacheAccount(window.localStorage, user.id, a)
      return a
    } catch (e) {
      if (useCloud && user) {
        const cached = loadOfflineAccount(window.localStorage, user.id)
        if (cached) return cached
      }
      throw e
    }
  }, [store, user, useCloud])

  const reload = useCallback(async () => {
    if (!user) return
    try {
      setAccount(await fetchAccount())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui carregar sua assinatura.')
    }
  }, [fetchAccount, user])

  useEffect(() => {
    if (!user) {
      setAccount(null)
      return
    }
    let alive = true
    setLoading(true)
    fetchAccount()
      .then((a) => alive && (setAccount(a), setError(null)))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Não consegui carregar sua assinatura.'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [fetchAccount, user])

  // Voltou do Mercado Pago (ou de outra aba): confere de novo se o pagamento já entrou.
  useEffect(() => {
    if (!user) return
    const onVisible = () => document.visibilityState === 'visible' && void reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [user, reload])

  const value = useMemo<AccountApi>(
    () => ({
      account, loading, error, reload, store, admin,
      consumeDemoImage: () => local.consumeImage(),
      consumeOfflineImage: () => {
        if (!user || user.demo) return
        const next = consumeOfflineImage(window.localStorage, user.id)
        if (next) setAccount(next)
      },
      resetDemo: () => { local.reset(); void reload() },
    }),
    [account, loading, error, reload, store, admin, user],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAccount(): AccountApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAccount fora do AccountProvider')
  return v
}
