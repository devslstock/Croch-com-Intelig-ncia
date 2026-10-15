import type { WorkerRequest, WorkerResponse } from './worker'
import type { ChartResult, EngineParams, RawImage } from './types'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (r: ChartResult) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const p = pending.get(e.data.id)
      if (!p) return
      pending.delete(e.data.id)
      if (e.data.ok) p.resolve(e.data.result)
      else p.reject(new Error(e.data.error))
    }
  }
  return worker
}

/** Gera o gráfico em segundo plano, sem travar a tela. */
export function generateChart(image: RawImage, params: EngineParams): Promise<ChartResult> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    const req: WorkerRequest = { id, image, params }
    getWorker().postMessage(req)
  })
}
