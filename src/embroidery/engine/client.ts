import type { RawImage } from '../../engine/types'
import { runMethod } from './methods'
import type { EngineParams, MethodId } from './params'
import type { LineRequest, LineResponse } from './worker'

/** A pré-visualização foi trocada por outra mais nova antes de começar: ignore o resultado. */
export class Superseded extends Error {
  constructor() {
    super('superseded')
  }
}

const TIMEOUT_MS = 60_000

interface Job {
  req: LineRequest
  channel: 'preview' | 'export'
  resolve: (ink: Uint8Array) => void
  reject: (e: Error) => void
}

let worker: Worker | null = null
let current: { job: Job; timer: ReturnType<typeof setTimeout> } | null = null
const waiting: Job[] = []
let nextId = 1

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<LineResponse>) => {
      if (!current || current.job.req.id !== e.data.id) return
      const { job, timer } = current
      clearTimeout(timer)
      current = null
      if (e.data.ok) job.resolve(e.data.ink)
      else job.reject(new Error('Não foi possível gerar o risco.'))
      pump()
    }
    worker.onerror = () => fail(new Error('Não foi possível gerar o risco.'))
  }
  return worker
}

/** Erro do worker ou tempo esgotado: recria o worker e libera quem estava esperando. */
function fail(err: Error) {
  worker?.terminate()
  worker = null
  if (current) {
    clearTimeout(current.timer)
    current.job.reject(err)
    current = null
  }
  pump()
}

function pump() {
  if (current || waiting.length === 0) return
  const job = waiting.shift()!
  const w = getWorker()
  current = { job, timer: setTimeout(() => fail(new Error('O processamento demorou demais. Tente uma foto menor ou outro método.')), TIMEOUT_MS) }
  // Copia: o buffer vai para o worker e a tela continua usando a imagem.
  const copy = new Uint8ClampedArray(job.req.data)
  w.postMessage({ ...job.req, data: copy }, [copy.buffer])
}

/**
 * Calcula o risco em segundo plano, um de cada vez (limite de uso de CPU). Pedidos de pré-visualização que
 * ainda não começaram são descartados quando chega um mais novo; a exportação nunca é descartada.
 */
export function computeInk(raw: RawImage, method: MethodId, params: Partial<EngineParams>, scale: number, channel: 'preview' | 'export' = 'preview'): Promise<Uint8Array> {
  if (typeof Worker === 'undefined') return Promise.resolve(runMethod(method, raw, params, scale))
  return new Promise((resolve, reject) => {
    if (channel === 'preview') {
      for (let i = waiting.length - 1; i >= 0; i--) {
        if (waiting[i].channel === 'preview') waiting.splice(i, 1)[0].reject(new Superseded())
      }
    }
    waiting.push({ req: { id: nextId++, data: raw.data, width: raw.width, height: raw.height, method, params, scale }, channel, resolve, reject })
    pump()
  })
}
