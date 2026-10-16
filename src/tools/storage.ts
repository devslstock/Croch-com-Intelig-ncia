import type { RoundTo } from './pricing'

/** Dados das ferramentas, guardados neste aparelho (por usuária). Troca fácil por nuvem depois. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface ShopSettings {
  shopName: string
  /** Seu nome como aparece na conversa (para o assistente saber qual lado é você). */
  myName: string
  standardDays: number
  depositPct: number
  pixKey: string
  shipping: string
  exchangePolicy: string
}

export const DEFAULT_SETTINGS: ShopSettings = {
  shopName: '',
  myName: '',
  standardDays: 15,
  depositPct: 50,
  pixKey: '',
  shipping: '',
  exchangePolicy: '',
}

export interface PricingPrefs {
  skeinPrice: number
  skeinGrams: number
  /** Gramas de fio gastas a cada 100 pontos (pese o novelo antes e depois para achar o seu). */
  gramsPer100: number
  stitchesPerHour: number
  hourlyRate: number
  feesPct: number
  taxPct: number
  contingencyPct: number
  marginPct: number
  depositPct: number
  roundTo: RoundTo
  wholeSkeins: boolean
}

/** Valores de exemplo: ajuste para a sua realidade. */
export const DEFAULT_PREFS: PricingPrefs = {
  skeinPrice: 15,
  skeinGrams: 125,
  gramsPer100: 1.8,
  stitchesPerHour: 200,
  hourlyRate: 15,
  feesPct: 5,
  taxPct: 0,
  contingencyPct: 5,
  marginPct: 20,
  depositPct: 50,
  roundTo: '90',
  wholeSkeins: false,
}

export interface Quote {
  id: string
  name: string
  price: number
  minPrice: number
  deposit: number
  days: number | null
  createdAt: string
}

export function readJson<T>(storage: StorageLike, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(fallback)) return (Array.isArray(parsed) ? parsed : fallback) as T
    return parsed && typeof parsed === 'object' ? ({ ...fallback, ...(parsed as object) } as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(storage: StorageLike, key: string, value: unknown) {
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    /* sem espaço ou sem armazenamento: a tela continua funcionando sem salvar */
  }
}

const MAX_QUOTES = 50

export function toolsStorage(userId: string, storage: StorageLike) {
  const k = (name: string) => `tramado:tools:${userId}:${name}`
  return {
    getSettings: () => readJson<ShopSettings>(storage, k('settings'), DEFAULT_SETTINGS),
    saveSettings: (s: ShopSettings) => writeJson(storage, k('settings'), s),
    getPrefs: () => readJson<PricingPrefs>(storage, k('prefs'), DEFAULT_PREFS),
    savePrefs: (p: PricingPrefs) => writeJson(storage, k('prefs'), p),
    listQuotes: () => readJson<Quote[]>(storage, k('quotes'), []),
    addQuote(q: Omit<Quote, 'id' | 'createdAt'>): Quote {
      const quote: Quote = { ...q, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
      writeJson(storage, k('quotes'), [quote, ...readJson<Quote[]>(storage, k('quotes'), [])].slice(0, MAX_QUOTES))
      return quote
    },
    removeQuote(id: string) {
      writeJson(storage, k('quotes'), readJson<Quote[]>(storage, k('quotes'), []).filter((x) => x.id !== id))
    },
  }
}
