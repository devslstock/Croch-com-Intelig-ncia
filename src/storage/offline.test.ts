import { describe, expect, it } from 'vitest'
import { AccessError, DEFAULT_PRICES, LIMIT_MESSAGE, type Account } from '../billing/plans'
import { cacheAccount, consumeOfflineImage, loadOfflineAccount, OFFLINE_MAX_DAYS } from '../billing/offlineAccount'
import { OfflineError, toSaved, type ChartStore, type SavedChart, type SavedChartInput } from './charts'
import { offlineChartStore } from './offlineCharts'
import { withTimeout } from '../offline/net'

const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

const input = (name: string, over: Partial<SavedChartInput> = {}): SavedChartInput => ({
  name, yarnId: 'dmc', picked: {}, startSide: 'right',
  chart: { width: 2, height: 2, grid: new Uint8Array([0, 1, 1, 0]), palette: [{ letter: 'A', symbol: '●', hex: '#ffffff', count: 2 }] as never },
  ...over,
})

/** Nuvem de mentira: guarda em memória, e pode "cair" (OfflineError) ou recusar por limite do plano. */
function fakeCloud() {
  const rows = new Map<string, SavedChart>()
  const state = { down: false, deny: null as null | string, calls: 0 }
  const store: ChartStore = {
    async list() {
      if (state.down) throw new OfflineError()
      return [...rows.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    async save(_u, i) {
      state.calls++
      if (state.down) throw new OfflineError()
      if (state.deny) throw new AccessError('limite_mensal', state.deny)
      const saved = toSaved(i, rows.get(i.id ?? ''))
      rows.set(saved.id, saved)
      return saved
    },
    async remove(_u, id) {
      if (state.down) throw new OfflineError()
      rows.delete(id)
    },
  }
  return { rows, state, store }
}

describe('gráficos sem internet: fila de envio', () => {
  it('sem internet o gráfico fica no aparelho, aparece na lista e entra na fila', async () => {
    const c = fakeCloud()
    c.state.down = true
    const s = offlineChartStore(c.store, mem(), { isOffline: () => true })
    const saved = await s.save('u1', input('Ursinho'))
    expect(saved.queued).toBe(true)
    expect(c.state.calls).toBe(0) // nem tentou a nuvem
    expect((await s.list('u1')).map((x) => x.name)).toEqual(['Ursinho'])
    expect(s.status('u1').pending).toBe(1)
  })

  it('quando a internet volta, a fila vai para a nuvem com o mesmo id e a data original', async () => {
    const c = fakeCloud()
    let off = true
    const s = offlineChartStore(c.store, mem(), { isOffline: () => off })
    const saved = await s.save('u1', input('Ursinho'))
    off = false
    const r = await s.flush('u1')
    expect(r).toEqual({ sent: 1, failed: 0 })
    expect(c.rows.get(saved.id)?.createdAt).toBe(saved.createdAt)
    expect(s.status('u1').pending).toBe(0)
    expect((await s.list('u1')).length).toBe(1)
  })

  it('várias edições sem internet viram um único envio (vale a última)', async () => {
    const c = fakeCloud()
    let off = true
    const s = offlineChartStore(c.store, mem(), { isOffline: () => off })
    const a = await s.save('u1', input('Rascunho'))
    await s.save('u1', input('Rascunho 2', { id: a.id }))
    await s.save('u1', input('Versão final', { id: a.id, progress: 1 } as never))
    expect(s.status('u1').pending).toBe(1)
    off = false
    await s.flush('u1')
    expect(c.rows.size).toBe(1)
    expect(c.rows.get(a.id)?.name).toBe('Versão final')
  })

  it('apagar sem internet também espera a volta da conexão', async () => {
    const c = fakeCloud()
    let off = false
    const s = offlineChartStore(c.store, mem(), { isOffline: () => off })
    const a = await s.save('u1', input('Para apagar'))
    expect(c.rows.size).toBe(1)
    off = true
    await s.remove('u1', a.id)
    expect((await s.list('u1')).length).toBe(0) // some da lista na hora
    expect(c.rows.size).toBe(1) // ainda na nuvem
    off = false
    await s.flush('u1')
    expect(c.rows.size).toBe(0)
  })

  it('limite do plano recusado no envio: o gráfico continua no aparelho e a pessoa é avisada', async () => {
    const c = fakeCloud()
    let off = true
    const s = offlineChartStore(c.store, mem(), { isOffline: () => off })
    const a = await s.save('u1', input('Feito offline'))
    off = false
    c.state.deny = LIMIT_MESSAGE
    const r = await s.flush('u1')
    expect(r).toEqual({ sent: 0, failed: 1 })
    expect(s.status('u1').pending).toBe(0)
    expect(s.status('u1').rejected[0]).toMatchObject({ id: a.id, name: 'Feito offline' })
    // mesmo depois de recarregar a lista da nuvem, o gráfico não some
    expect((await s.list('u1')).map((x) => x.name)).toEqual(['Feito offline'])
    s.dismissRejected('u1')
    expect(s.status('u1').rejected).toEqual([])
  })

  it('com internet, salvar vai direto para a nuvem e recusa de limite desfaz a cópia local', async () => {
    const c = fakeCloud()
    const s = offlineChartStore(c.store, mem(), { isOffline: () => false })
    const ok = await s.save('u1', input('Normal'))
    expect(ok.queued).toBeUndefined()
    expect(c.rows.size).toBe(1)
    c.state.deny = LIMIT_MESSAGE
    await expect(s.save('u1', input('Passou do limite'))).rejects.toThrow()
    expect((await s.list('u1')).map((x) => x.name)).toEqual(['Normal'])
    expect(s.status('u1').pending).toBe(0)
  })

  it('nuvem lenta demais: desiste no prazo e guarda na fila', async () => {
    const slow: ChartStore = {
      list: () => new Promise(() => undefined),
      save: () => new Promise(() => undefined),
      remove: () => new Promise(() => undefined),
    }
    const s = offlineChartStore(slow, mem(), { isOffline: () => false, timeoutMs: 20 })
    const saved = await s.save('u1', input('Conexão fraca'))
    expect(saved.queued).toBe(true)
    expect((await s.list('u1')).length).toBe(1)
  })

  it('cada pessoa tem a sua fila e a sua cópia no mesmo aparelho', async () => {
    const c = fakeCloud()
    const st = mem()
    const s = offlineChartStore(c.store, st, { isOffline: () => true })
    await s.save('u1', input('Da Ana'))
    await s.save('u2', input('Da Bia'))
    expect((await s.list('u1')).map((x) => x.name)).toEqual(['Da Ana'])
    expect((await s.list('u2')).map((x) => x.name)).toEqual(['Da Bia'])
  })

  it('a fila sobrevive a fechar e abrir o app', async () => {
    const c = fakeCloud()
    const st = mem()
    await offlineChartStore(c.store, st, { isOffline: () => true }).save('u1', input('Guardado'))
    const reaberto = offlineChartStore(c.store, st, { isOffline: () => false })
    expect(reaberto.status('u1').pending).toBe(1)
    expect((await reaberto.flush('u1')).sent).toBe(1)
    expect(c.rows.size).toBe(1)
  })

  it('withTimeout devolve o erro combinado', async () => {
    await expect(withTimeout(new Promise(() => undefined), 10, () => new Error('lento'))).rejects.toThrow('lento')
    await expect(withTimeout(Promise.resolve(7), 50, () => new Error('lento'))).resolves.toBe(7)
  })
})

const acc = (over: Partial<Account> = {}): Account => ({
  plan: 'basic', effective: 'basic', expiresAt: '2026-11-20T00:00:00Z', trialEndsAt: null, blocked: false, cycle: 'monthly', method: 'card', isAdmin: false,
  email: 'a@b.c', imagesUsed: 3, bonusImages: 2, coupon: null, prices: DEFAULT_PRICES, ...over,
})
const t0 = new Date('2026-10-19T12:00:00Z')

describe('plano guardado no aparelho (uso sem internet)', () => {
  it('sem cópia não há plano offline', () => {
    expect(loadOfflineAccount(mem(), 'u1', t0)).toBeNull()
  })

  it('devolve a conta como estava e avisa que veio do aparelho', () => {
    const st = mem()
    cacheAccount(st, 'u1', acc(), t0)
    const a = loadOfflineAccount(st, 'u1', new Date('2026-10-20T12:00:00Z'))
    expect(a).toMatchObject({ effective: 'basic', imagesUsed: 3, bonusImages: 2, offline: true })
  })

  it('o vencimento é conferido pelo relógio do aparelho (com a tolerância do plano)', () => {
    const st = mem()
    cacheAccount(st, 'u1', acc({ expiresAt: '2026-10-25T00:00:00Z' }), t0)
    expect(loadOfflineAccount(st, 'u1', new Date('2026-10-26T00:00:00Z'))?.effective).toBe('basic') // dentro dos 3 dias de tolerância
    expect(loadOfflineAccount(st, 'u1', new Date('2026-11-05T00:00:00Z'))?.effective).toBe('none')
  })

  it('o teste grátis acaba na hora, sem tolerância', () => {
    const st = mem()
    cacheAccount(st, 'u1', acc({ plan: 'none', effective: 'basic', expiresAt: null, trialEndsAt: '2026-10-22T00:00:00Z' }), t0)
    expect(loadOfflineAccount(st, 'u1', new Date('2026-10-21T00:00:00Z'))).toMatchObject({ effective: 'basic', trialEndsAt: '2026-10-22T00:00:00Z' })
    expect(loadOfflineAccount(st, 'u1', new Date('2026-10-22T00:00:01Z'))).toMatchObject({ effective: 'none', trialEndsAt: null })
  })

  it('conta desativada continua sem acesso', () => {
    const st = mem()
    cacheAccount(st, 'u1', acc({ blocked: true, effective: 'none' }), t0)
    expect(loadOfflineAccount(st, 'u1', t0)?.effective).toBe('none')
  })

  it(`depois de ${OFFLINE_MAX_DAYS} dias sem verificar com a internet, pede para conectar`, () => {
    const st = mem()
    cacheAccount(st, 'u1', acc(), t0)
    expect(loadOfflineAccount(st, 'u1', new Date(t0.getTime() + (OFFLINE_MAX_DAYS - 1) * 86_400_000))).not.toBeNull()
    expect(loadOfflineAccount(st, 'u1', new Date(t0.getTime() + (OFFLINE_MAX_DAYS + 1) * 86_400_000))).toBeNull()
  })

  it('a cota do mês zera sozinha na virada do mês', () => {
    const st = mem()
    cacheAccount(st, 'u1', acc({ imagesUsed: 12 }), new Date('2026-10-30T12:00:00Z'))
    expect(loadOfflineAccount(st, 'u1', new Date('2026-11-02T12:00:00Z'))?.imagesUsed).toBe(0)
  })

  it('gasta imagens com a mesma regra do banco: cota do Básico, depois o bônus', () => {
    const st = mem()
    cacheAccount(st, 'u1', acc({ imagesUsed: 11, bonusImages: 2 }), t0)
    expect(consumeOfflineImage(st, 'u1', t0)).toMatchObject({ imagesUsed: 12, bonusImages: 2 }) // última da cota
    expect(consumeOfflineImage(st, 'u1', t0)).toMatchObject({ imagesUsed: 12, bonusImages: 1 }) // agora o bônus
    expect(consumeOfflineImage(st, 'u1', t0)).toMatchObject({ bonusImages: 0 })
    expect(consumeOfflineImage(st, 'u1', t0)).toMatchObject({ bonusImages: 0 }) // nunca fica negativo
  })

  it('o Plus é ilimitado e não gasta o bônus; sem plano, só o bônus', () => {
    const st = mem()
    cacheAccount(st, 'p', acc({ plan: 'plus', effective: 'plus', imagesUsed: 50, bonusImages: 3 }), t0)
    expect(consumeOfflineImage(st, 'p', t0)).toMatchObject({ imagesUsed: 51, bonusImages: 3 })
    cacheAccount(st, 'n', acc({ plan: 'none', effective: 'none', expiresAt: null, imagesUsed: 0, bonusImages: 1 }), t0)
    expect(consumeOfflineImage(st, 'n', t0)).toMatchObject({ bonusImages: 0, imagesUsed: 0 })
  })
})
