import { buildChart } from './pipeline'
import type { ChartResult, EngineParams, RawImage } from './types'

export interface WorkerRequest {
  id: number
  image: RawImage
  params: EngineParams
}
export type WorkerResponse =
  | { id: number; ok: true; result: ChartResult }
  | { id: number; ok: false; error: string }

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, image, params } = e.data
  try {
    const result = buildChart(image, params)
    const msg: WorkerResponse = { id, ok: true, result }
    ;(self as unknown as Worker).postMessage(msg)
  } catch (err) {
    const msg: WorkerResponse = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
    ;(self as unknown as Worker).postMessage(msg)
  }
}
