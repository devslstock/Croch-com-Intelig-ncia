import { readJson, type StorageLike } from '../tools/storage'
import { imageLimit, MONTH_KEY, planWithTrial, type Account } from './plans'

/**
 * Plano da conta guardado no aparelho para usar o app sem internet.
 * Cada vez que a conta é carregada com internet, uma cópia fica aqui. Sem conexão, o app usa essa cópia: o vencimento do plano
 * e o fim do teste grátis são conferidos pelo relógio do aparelho, e depois de OFFLINE_MAX_DAYS dias sem verificar online
 * pedimos para conectar (assim cancelamentos e pagamentos recusados acabam valendo).
 */
export const OFFLINE_MAX_DAYS = 30

interface Cached {
  account: Account
  /** Quando a conta foi confirmada com a internet pela última vez. */
  at: string
  /** Mês em que `imagesUsed` vale (a cota do Básico zera todo mês). */
  month: string
}

const key = (userId: string) => `tramado:offline:account:${userId}`

export function cacheAccount(storage: StorageLike, userId: string, account: Account, now: Date = new Date()) {
  const { offline: _offline, ...rest } = account
  void _offline
  try {
    storage.setItem(key(userId), JSON.stringify({ account: rest, at: now.toISOString(), month: MONTH_KEY(now) } satisfies Cached))
  } catch {
    /* sem espaço: o app segue funcionando online */
  }
}

export function forgetAccount(storage: StorageLike, userId: string) {
  try {
    storage.setItem(key(userId), '')
  } catch {
    /* nada */
  }
}

const empty = null as unknown as Cached

function read(storage: StorageLike, userId: string): Cached | null {
  const c = readJson<Cached | null>(storage, key(userId), empty)
  return c && c.account && typeof c.at === 'string' ? c : null
}

/** Conta como estava na última vez com internet, já com o plano recalculado para agora. Nulo se não há cópia ou ela venceu. */
export function loadOfflineAccount(storage: StorageLike, userId: string, now: Date = new Date()): Account | null {
  const c = read(storage, userId)
  if (!c) return null
  const age = now.getTime() - new Date(c.at).getTime()
  if (age > OFFLINE_MAX_DAYS * 86_400_000) return null
  const a = c.account
  const effective = planWithTrial(a.plan, a.blocked, a.expiresAt, a.prices.graceDays, a.trialEndsAt, now)
  const paid = planWithTrial(a.plan, a.blocked, a.expiresAt, a.prices.graceDays, null, now)
  return {
    ...a,
    effective,
    trialEndsAt: paid === 'none' && effective === 'basic' ? a.trialEndsAt : null,
    imagesUsed: c.month === MONTH_KEY(now) ? a.imagesUsed : 0,
    offline: true,
  }
}

/** Dias que faltam para a cópia vencer (para avisar a pessoa antes). */
export function offlineDaysLeft(storage: StorageLike, userId: string, now: Date = new Date()): number | null {
  const c = read(storage, userId)
  if (!c) return null
  return Math.max(0, Math.ceil(OFFLINE_MAX_DAYS - (now.getTime() - new Date(c.at).getTime()) / 86_400_000))
}

/**
 * Gasta uma imagem nova na cota guardada no aparelho, com a mesma regra do banco (gráficos de presente cobrem "sem plano" e
 * "acabou a cota do mês"; o Plus é ilimitado). Quando a internet volta, o servidor recalcula tudo.
 */
export function consumeOfflineImage(storage: StorageLike, userId: string, now: Date = new Date()): Account | null {
  const c = read(storage, userId)
  const cur = loadOfflineAccount(storage, userId, now)
  if (!c || !cur) return null
  const lim = imageLimit(cur)
  const next: Account = { ...c.account }
  if (cur.effective === 'none' || (lim !== null && cur.imagesUsed >= lim)) {
    next.bonusImages = Math.max(0, cur.bonusImages - 1)
    next.imagesUsed = cur.imagesUsed
  } else {
    next.imagesUsed = cur.imagesUsed + 1
    next.bonusImages = cur.bonusImages
  }
  try {
    storage.setItem(key(userId), JSON.stringify({ account: next, at: c.at, month: MONTH_KEY(now) } satisfies Cached))
  } catch {
    /* nada */
  }
  return loadOfflineAccount(storage, userId, now)
}
