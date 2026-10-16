import { describe, expect, it } from 'vitest'
import { buildReference, parseReference, validCheckoutRequest, verifyMpSignature, toCents } from '../../supabase/functions/_shared/billing'

const uid = '0a1b2c3d-1111-4222-8333-444455556666'

async function sign(secret: string, manifest: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest)))
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('')
}

describe('referência do pagamento', () => {
  it('ida e volta', () => {
    const r = { userId: uid, plan: 'plus', cycle: 'yearly', method: 'pix' } as const
    expect(parseReference(buildReference(r))).toEqual(r)
  })
  it('recusa lixo', () => {
    for (const t of [null, '', 'abc', `${uid}|vip|monthly|card`, `${uid}|basic|weekly|card`, `${uid}|basic|monthly|boleto`, `x|basic|monthly|card`]) {
      expect(parseReference(t)).toBeNull()
    }
  })
})

describe('pedido de checkout', () => {
  it('valida plano, ciclo e método; ignora valor enviado pelo navegador', () => {
    expect(validCheckoutRequest({ plan: 'plus', cycle: 'monthly', method: 'card', amount: 1 })).toEqual({ plan: 'plus', cycle: 'monthly', method: 'card', email: undefined })
    expect(validCheckoutRequest({ plan: 'plus', cycle: 'monthly', method: 'card', email: ' a@b.co ' })?.email).toBe('a@b.co')
    expect(validCheckoutRequest({ plan: 'plus', cycle: 'monthly', method: 'card', email: 'invalido' })?.email).toBeUndefined()
    expect(validCheckoutRequest({ plan: 'free', cycle: 'monthly', method: 'card' })).toBeNull()
    expect(validCheckoutRequest(null)).toBeNull()
  })
  it('converte reais em centavos sem erro de ponto flutuante', () => {
    expect(toCents(19.9)).toBe(1990)
    expect(toCents('39.90')).toBe(3990)
    expect(toCents(0.1 + 0.2)).toBe(30)
  })
})

describe('assinatura do webhook', () => {
  const secret = 's3gredo'
  it('aceita a assinatura correta (com e sem request-id)', async () => {
    const v1 = await sign(secret, 'id:123456;request-id:req-1;ts:1742505638683;')
    expect(await verifyMpSignature({ secret, signature: `ts=1742505638683,v1=${v1}`, requestId: 'req-1', dataId: '123456' })).toBe(true)
    const v2 = await sign(secret, 'id:123456;ts:1742505638683;')
    expect(await verifyMpSignature({ secret, signature: `ts=1742505638683,v1=${v2}`, requestId: null, dataId: '123456' })).toBe(true)
  })
  it('o id alfanumérico entra em minúsculas', async () => {
    const v1 = await sign(secret, 'id:abc123;request-id:r;ts:1;')
    expect(await verifyMpSignature({ secret, signature: `ts=1,v1=${v1}`, requestId: 'r', dataId: 'ABC123' })).toBe(true)
  })
  it('recusa chave errada, id trocado, cabeçalho ausente ou malformado', async () => {
    const v1 = await sign(secret, 'id:1;request-id:r;ts:9;')
    const base = { secret, signature: `ts=9,v1=${v1}`, requestId: 'r', dataId: '1' }
    expect(await verifyMpSignature(base)).toBe(true)
    expect(await verifyMpSignature({ ...base, secret: 'outra' })).toBe(false)
    expect(await verifyMpSignature({ ...base, dataId: '2' })).toBe(false)
    expect(await verifyMpSignature({ ...base, signature: null })).toBe(false)
    expect(await verifyMpSignature({ ...base, signature: 'lixo' })).toBe(false)
    expect(await verifyMpSignature({ ...base, signature: `ts=9,v1=${v1.slice(0, -1)}0` })).toBe(false)
    expect(await verifyMpSignature({ ...base, secret: '' })).toBe(false)
  })
})
