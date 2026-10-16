import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../auth/supabase'
import { DEMO_ADMIN_KEY } from '../billing/adminStore'
import { DEFAULT_PRICES, type Prices } from '../billing/plans'
import { readJson, type StorageLike } from '../tools/storage'
import { DEFAULT_CONFIG, DEFAULT_INFO, DEFAULT_ITEMS, type ChatConfig, type ChatItem, type PublicInfo } from './chatbot'

export interface PublicStore {
  get(): Promise<PublicInfo>
}

const str = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v : fallback)

/** Lê a resposta de public_landing() com cuidado: o que faltar ou vier estranho cai nos valores padrão. */
export function parsePublicInfo(data: unknown): PublicInfo {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  const p = (d.prices && typeof d.prices === 'object' ? d.prices : {}) as Partial<Prices>
  const c = (d.config && typeof d.config === 'object' ? d.config : {}) as Partial<ChatConfig>
  const items: ChatItem[] = Array.isArray(d.items)
    ? d.items
        .map((x) => x as Record<string, unknown>)
        .filter((x) => typeof x?.question === 'string' && typeof x?.answer === 'string')
        .map((x, i) => ({ id: String(x.id ?? i), question: String(x.question), answer: String(x.answer), keywords: typeof x.keywords === 'string' ? x.keywords : '' }))
    : DEFAULT_ITEMS
  return {
    prices: { ...DEFAULT_PRICES, ...p },
    items,
    config: { greeting: str(c.greeting, DEFAULT_CONFIG.greeting), fallback: str(c.fallback, DEFAULT_CONFIG.fallback), whatsapp: typeof c.whatsapp === 'string' ? c.whatsapp : '' },
  }
}

export function supabasePublicStore(client: SupabaseClient): PublicStore {
  return {
    async get() {
      const { data, error } = await client.rpc('public_landing')
      if (error || !data) throw new Error('Não consegui carregar a página.')
      return parsePublicInfo(data)
    },
  }
}

/** Demonstração: usa o que foi cadastrado no painel de demonstração, no mesmo navegador. */
export function localPublicStore(storage: StorageLike): PublicStore {
  return {
    async get() {
      const saved = readJson<{ prices?: Partial<Prices>; chatbot?: { items?: Array<ChatItem & { active?: boolean; sort?: number }>; config?: ChatConfig } }>(storage, DEMO_ADMIN_KEY, {})
      const items = saved.chatbot?.items
        ? saved.chatbot.items.filter((i) => i.active !== false).sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100))
        : DEFAULT_ITEMS
      return { prices: { ...DEFAULT_PRICES, ...saved.prices }, items, config: { ...DEFAULT_CONFIG, ...saved.chatbot?.config } }
    },
  }
}

/** Dados públicos (preços e perguntas do chatbot). Começa com os padrões e se atualiza quando o banco responde. */
export function usePublicInfo(): PublicInfo {
  const [info, setInfo] = useState<PublicInfo>(DEFAULT_INFO)
  useEffect(() => {
    let alive = true
    const store = supabase ? supabasePublicStore(supabase) : localPublicStore(window.localStorage)
    store.get().then((i) => alive && setInfo(i)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
  return info
}
