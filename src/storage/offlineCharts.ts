import { readJson, type StorageLike } from '../tools/storage'
import { AccessError } from '../billing/plans'
import { isOffline, withTimeout } from '../offline/net'
import { OfflineError, toChartResult, toSaved, type ChartStore, type SaveResult, type SavedChart, type SavedChartInput } from './charts'

/**
 * "Meus gráficos" que funciona sem internet.
 * Cada gráfico é salvo primeiro neste aparelho (cópia local) e depois enviado à nuvem. Sem conexão, o envio fica numa fila
 * e vai sozinho quando a internet volta (`flush`). A cópia local também é o que aparece na lista quando não há rede.
 */
type Op = { kind: 'save'; chart: SavedChart; at: string } | { kind: 'remove'; id: string; at: string }

export interface Rejected {
  id: string
  name: string
  /** Por que a nuvem recusou (ex.: limite do plano). O gráfico continua neste aparelho. */
  message: string
}

export interface SyncStatus {
  pending: number
  rejected: Rejected[]
}

const mirrorKey = (u: string) => `tramado:offline:charts:${u}`
const outboxKey = (u: string) => `tramado:offline:outbox:${u}`
const rejectedKey = (u: string) => `tramado:offline:rejected:${u}`

const byDate = (a: SavedChart, b: SavedChart) => b.createdAt.localeCompare(a.createdAt)

export interface OfflineChartStore extends ChartStore {
  /** Envia o que ficou na fila. Para no primeiro problema de conexão. */
  flush(userId: string): Promise<{ sent: number; failed: number }>
  status(userId: string): SyncStatus
  dismissRejected(userId: string): void
  subscribe(fn: () => void): () => void
}

export interface OfflineOptions {
  /** Aparelho sem internet? (padrão: navigator.onLine) */
  isOffline?: () => boolean
  /** Quanto esperar a nuvem antes de guardar na fila (padrão: 10 s). */
  timeoutMs?: number
}

export function offlineChartStore(rawCloud: ChartStore, storage: StorageLike, opts: OfflineOptions = {}): OfflineChartStore {
  const offline = opts.isOffline ?? isOffline
  const timeoutMs = opts.timeoutMs ?? 10_000
  /** Chamadas à nuvem: sem internet nem tentamos; com conexão lenta, desistimos depois do prazo (vai para a fila). */
  const guard = <T>(fn: () => Promise<T>): Promise<T> => (offline() ? Promise.reject(new OfflineError()) : withTimeout(fn(), timeoutMs, () => new OfflineError()))
  const cloud: ChartStore = {
    list: (u) => guard(() => rawCloud.list(u)),
    save: (u, i) => guard(() => rawCloud.save(u, i)),
    remove: (u, id) => guard(() => rawCloud.remove(u, id)),
  }
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((f) => f())
  let flushing: Promise<{ sent: number; failed: number }> | null = null

  const write = (key: string, value: unknown) => {
    try {
      storage.setItem(key, JSON.stringify(value))
    } catch {
      throw new Error('Sem espaço neste aparelho para guardar o gráfico. Apague algum gráfico antigo e tente de novo.')
    }
  }
  const mirror = (u: string) => readJson<SavedChart[]>(storage, mirrorKey(u), [])
  const outbox = (u: string) => readJson<Op[]>(storage, outboxKey(u), [])
  const rejected = (u: string) => readJson<Rejected[]>(storage, rejectedKey(u), [])
  const putMirror = (u: string, list: SavedChart[]) => write(mirrorKey(u), list)
  const putOutbox = (u: string, ops: Op[]) => {
    write(outboxKey(u), ops)
    notify()
  }
  const opId = (o: Op) => (o.kind === 'save' ? o.chart.id : o.id)

  /** Lista da nuvem com o que ainda está na fila por cima (o que foi feito aqui vale mais). */
  const applyPending = (remote: SavedChart[], ops: Op[]): SavedChart[] => {
    let out = [...remote]
    for (const o of ops) {
      out = out.filter((c) => c.id !== opId(o))
      if (o.kind === 'save') out.push(o.chart)
    }
    return out.sort(byDate)
  }

  const toInput = (c: SavedChart): SavedChartInput => ({
    id: c.id, name: c.name, yarnId: c.yarnId, picked: c.picked, startSide: c.startSide, progress: c.progress, progressStitch: c.progressStitch,
    createdAt: c.createdAt, chart: toChartResult(c),
  })

  const api: OfflineChartStore = {
    async list(userId) {
      try {
        const remote = await cloud.list(userId)
        const old = mirror(userId)
        const merged = applyPending(remote, outbox(userId))
        // Gráficos que a nuvem recusou (limite do plano) continuam na lista, só neste aparelho, até a pessoa resolver.
        for (const r of rejected(userId)) {
          const local = old.find((c) => c.id === r.id)
          if (local && !merged.some((c) => c.id === r.id)) merged.push(local)
        }
        merged.sort(byDate)
        putMirror(userId, merged)
        return merged
      } catch (e) {
        if (e instanceof OfflineError) return mirror(userId).sort(byDate)
        // Qualquer outra falha do servidor: melhor mostrar o que há no aparelho do que uma tela vazia.
        const local = mirror(userId)
        if (local.length > 0) return local.sort(byDate)
        throw e
      }
    },

    async save(userId, input): Promise<SaveResult> {
      const before = mirror(userId)
      const existing = input.id ? before.find((c) => c.id === input.id) : undefined
      const saved = toSaved(input, existing)
      // Primeiro no aparelho: nada se perde se a internet cair no meio.
      putMirror(userId, [saved, ...before.filter((c) => c.id !== saved.id)])
      try {
        const remote = await cloud.save(userId, { ...input, id: saved.id, createdAt: saved.createdAt })
        putMirror(userId, [remote, ...mirror(userId).filter((c) => c.id !== remote.id)])
        putOutbox(userId, outbox(userId).filter((o) => !(o.kind === 'save' && o.chart.id === saved.id)))
        return remote
      } catch (e) {
        if (e instanceof OfflineError) {
          putOutbox(userId, [...outbox(userId).filter((o) => opId(o) !== saved.id), { kind: 'save', chart: saved, at: new Date().toISOString() }])
          return { ...saved, queued: true }
        }
        // A nuvem recusou (limite do plano, assinatura parada): desfaz a cópia local para não ficar um gráfico "fantasma".
        putMirror(userId, existing ? [existing, ...before.filter((c) => c.id !== existing.id)] : before)
        throw e
      }
    },

    async remove(userId, id) {
      putMirror(userId, mirror(userId).filter((c) => c.id !== id))
      try {
        await cloud.remove(userId, id)
        putOutbox(userId, outbox(userId).filter((o) => opId(o) !== id))
      } catch (e) {
        if (!(e instanceof OfflineError)) throw e
        putOutbox(userId, [...outbox(userId).filter((o) => opId(o) !== id), { kind: 'remove', id, at: new Date().toISOString() }])
      }
    },

    flush(userId) {
      if (flushing) return flushing
      flushing = (async () => {
        let sent = 0
        let failed = 0
        let ops = outbox(userId)
        while (ops.length > 0) {
          const op = ops[0]
          try {
            if (op.kind === 'save') {
              const remote = await cloud.save(userId, toInput(op.chart))
              putMirror(userId, [remote, ...mirror(userId).filter((c) => c.id !== remote.id)])
            } else {
              await cloud.remove(userId, op.id)
            }
            sent++
          } catch (e) {
            if (e instanceof OfflineError) break
            if (e instanceof AccessError && op.kind === 'save') {
              // Limite do plano ou assinatura parada: o gráfico fica só neste aparelho e avisamos a pessoa.
              write(rejectedKey(userId), [...rejected(userId).filter((r) => r.id !== op.chart.id), { id: op.chart.id, name: op.chart.name, message: e.message }])
              failed++
            } else {
              break
            }
          }
          ops = outbox(userId).filter((o) => !(opId(o) === opId(op) && o.at === op.at))
          putOutbox(userId, ops)
        }
        notify()
        return { sent, failed }
      })().finally(() => {
        flushing = null
      })
      return flushing
    },

    status(userId) {
      return { pending: outbox(userId).length, rejected: rejected(userId) }
    },

    dismissRejected(userId) {
      write(rejectedKey(userId), [])
      notify()
    },

    subscribe(fn) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
  }
  return api
}
