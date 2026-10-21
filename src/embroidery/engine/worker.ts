/// <reference lib="webworker" />
import { runMethod } from './methods'
import type { EngineParams, MethodId } from './params'

export interface LineRequest {
  id: number
  data: Uint8ClampedArray
  width: number
  height: number
  method: MethodId
  params: Partial<EngineParams>
  scale: number
}

export type LineResponse = { id: number; ok: true; ink: Uint8Array } | { id: number; ok: false; error: string }

self.onmessage = (e: MessageEvent<LineRequest>) => {
  const { id, data, width, height, method, params, scale } = e.data
  try {
    const ink = runMethod(method, { data, width, height }, params, scale)
    const res: LineResponse = { id, ok: true, ink }
    ;(self as unknown as Worker).postMessage(res, [ink.buffer])
  } catch (err) {
    // Sem detalhes internos: a tela mostra uma mensagem simples.
    const res: LineResponse = { id, ok: false, error: err instanceof Error ? err.message.slice(0, 120) : 'erro' }
    ;(self as unknown as Worker).postMessage(res)
  }
}
