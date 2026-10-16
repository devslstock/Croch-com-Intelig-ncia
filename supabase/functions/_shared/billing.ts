// Lógica pura do pagamento (sem Deno nem rede): testada em src/billing/billing.test.ts.

export type PaidPlan = 'basic' | 'plus'
export type Cycle = 'monthly' | 'yearly'
export type Method = 'card' | 'pix'

export interface Reference {
  userId: string
  plan: PaidPlan
  cycle: Cycle
  method: Method
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** external_reference enviado ao Mercado Pago: é como o webhook descobre de quem é o pagamento. */
export function buildReference(r: Reference): string {
  return [r.userId, r.plan, r.cycle, r.method].join('|')
}

export function parseReference(text: unknown): Reference | null {
  if (typeof text !== 'string') return null
  const [userId, plan, cycle, method] = text.split('|')
  if (!UUID.test(userId ?? '')) return null
  if (plan !== 'basic' && plan !== 'plus') return null
  if (cycle !== 'monthly' && cycle !== 'yearly') return null
  if (method !== 'card' && method !== 'pix') return null
  return { userId: userId.toLowerCase(), plan, cycle, method }
}

export function validCheckoutRequest(body: unknown): { plan: PaidPlan; cycle: Cycle; method: Method; email?: string } | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (b.plan !== 'basic' && b.plan !== 'plus') return null
  if (b.cycle !== 'monthly' && b.cycle !== 'yearly') return null
  if (b.method !== 'card' && b.method !== 'pix') return null
  const email = typeof b.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim()) ? b.email.trim() : undefined
  return { plan: b.plan, cycle: b.cycle, method: b.method, email }
}

export const toReais = (cents: number) => Math.round(cents) / 100
export const toCents = (reais: unknown) => Math.round(Number(reais) * 100)

export const PLAN_NAME: Record<PaidPlan, string> = { basic: 'Tramado Básico', plus: 'Tramado Plus' }
export const cycleLabel = (c: Cycle) => (c === 'yearly' ? 'anual' : 'mensal')

/**
 * Confere a assinatura do webhook (cabeçalho x-signature = "ts=...,v1=..."):
 * HMAC-SHA256 do texto "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" com a chave secreta do webhook.
 * Partes ausentes saem do texto, como manda a documentação do Mercado Pago.
 */
export async function verifyMpSignature(opts: {
  secret: string
  signature: string | null
  requestId: string | null
  dataId: string | null
}): Promise<boolean> {
  const { secret, signature, requestId, dataId } = opts
  if (!secret || !signature) return false
  const parts = Object.fromEntries(
    signature.split(',').map((p) => {
      const i = p.indexOf('=')
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()]
    }),
  )
  const ts = parts.ts
  const v1 = parts.v1
  if (!ts || !v1) return false
  let manifest = ''
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`
  if (requestId) manifest += `request-id:${requestId};`
  manifest += `ts:${ts};`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest)))
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('')
  if (hex.length !== v1.length) return false
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.toLowerCase().charCodeAt(i)
  return diff === 0
}
