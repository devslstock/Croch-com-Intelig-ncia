// Recebe os avisos do Mercado Pago e libera/renova o plano SOZINHO (sem passar pelo painel).
// Deploy SEM verificação de JWT (o Mercado Pago não manda login): supabase functions deploy mp-webhook --no-verify-jwt
// A autenticidade vem da assinatura x-signature (MP_WEBHOOK_SECRET). O pagamento é sempre reconsultado na API do
// Mercado Pago com o nosso token: nada do que chega no corpo do aviso é aceito como verdade.
// Credenciais: as do painel de gestão (cartão "Banco", modo teste ou produção); se vazias, MP_ACCESS_TOKEN e MP_WEBHOOK_SECRET.
import { loadPaymentConfig, serviceClient } from '../_shared/config.ts'
import { parseReference, toCents, verifyMpSignature, type Reference } from '../_shared/billing.ts'

const MP = 'https://api.mercadopago.com'
const admin = serviceClient()

let token = ''
async function mpGet(path: string) {
  const res = await fetch(`${MP}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`mp_${res.status}`)
  return await res.json()
}

async function applyPayment(ref: Reference, payment: { id: unknown; transaction_amount: unknown }, via: 'card' | 'pix') {
  const { data, error } = await admin.rpc('apply_payment', {
    p_user: ref.userId,
    p_plan: ref.plan,
    p_cycle: ref.cycle,
    p_method: via,
    p_provider_payment_id: String(payment.id),
    p_amount_cents: toCents(payment.transaction_amount),
  })
  if (error) throw new Error(`apply_payment: ${error.message}`)
  return data
}

const methodOf = (p: { payment_method_id?: string; payment_type_id?: string }): 'card' | 'pix' =>
  p.payment_method_id === 'pix' ? 'pix' : 'card'

async function onPayment(id: string) {
  const p = await mpGet(`/v1/payments/${encodeURIComponent(id)}`)
  if (!p) return 'pagamento_inexistente'
  if (p.status !== 'approved') return `ignorado_${p.status}`
  const ref = parseReference(p.external_reference)
  // Cobranças automáticas da assinatura chegam também em "subscription_authorized_payment", que sabe achar a dona.
  if (!ref) return 'sem_referencia'
  const r = await applyPayment(ref, p, methodOf(p))
  return r?.applied ? 'aplicado' : 'ja_aplicado'
}

async function onAuthorizedPayment(id: string) {
  const ap = await mpGet(`/authorized_payments/${encodeURIComponent(id)}`)
  if (!ap) return 'cobranca_inexistente'
  const paymentId = ap.payment?.id
  if (!paymentId || ap.payment?.status !== 'approved') return 'ignorado'
  const sub = ap.preapproval_id ? await mpGet(`/preapproval/${encodeURIComponent(ap.preapproval_id)}`) : null
  const ref = parseReference(sub?.external_reference ?? ap.external_reference)
  if (!ref) return 'sem_referencia'
  const p = (await mpGet(`/v1/payments/${encodeURIComponent(String(paymentId))}`)) ?? { id: paymentId, transaction_amount: ap.transaction_amount }
  const r = await applyPayment(ref, p, 'card')
  return r?.applied ? 'aplicado' : 'ja_aplicado'
}

async function onPreapproval(id: string) {
  const s = await mpGet(`/preapproval/${encodeURIComponent(id)}`)
  const ref = parseReference(s?.external_reference)
  if (!s || !ref) return 'sem_referencia'
  const { error } = await admin.rpc('record_subscription', {
    p_user: ref.userId, p_provider_id: String(s.id), p_plan: ref.plan, p_cycle: ref.cycle, p_status: String(s.status ?? 'unknown'),
  })
  if (error) throw new Error(`record_subscription: ${error.message}`)
  // Cancelada: nada a fazer; o acesso vai até o fim do período já pago e depois cai sozinho.
  return `assinatura_${s.status}`
}

/** Anota o aviso e o que foi feito com ele (aparece no painel, cartão Banco). Nunca derruba o webhook. */
async function note(type: string, dataId: string, outcome: string) {
  try {
    await admin.rpc('log_payment_event', { p_type: type, p_data_id: dataId, p_outcome: outcome })
  } catch {
    /* sem registro */
  }
}

Deno.serve(async (req) => {
  const cfg = await loadPaymentConfig(admin)
  const secret = cfg.webhookSecret
  if (!secret || !cfg.accessToken) {
    await note('', '', 'nao_configurado')
    return new Response('nao_configurado', { status: 503 })
  }
  token = cfg.accessToken

  const url = new URL(req.url)
  const body = await req.json().catch(() => ({}))
  const type = String(body?.type ?? body?.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '')
  const dataId = String(url.searchParams.get('data.id') ?? body?.data?.id ?? url.searchParams.get('id') ?? '')

  const valid = await verifyMpSignature({
    secret,
    signature: req.headers.get('x-signature'),
    requestId: req.headers.get('x-request-id'),
    dataId: url.searchParams.get('data.id') ?? (body?.data?.id != null ? String(body.data.id) : null),
  })
  if (!valid) {
    await note(type, dataId, 'assinatura_invalida')
    return new Response('assinatura_invalida', { status: 401 })
  }
  if (!dataId) {
    await note(type, '', 'sem_id')
    return new Response('sem_id', { status: 200 })
  }

  try {
    let result = 'tipo_ignorado'
    if (type === 'payment') result = await onPayment(dataId)
    else if (type === 'subscription_authorized_payment') result = await onAuthorizedPayment(dataId)
    else if (type === 'subscription_preapproval' || type === 'preapproval') result = await onPreapproval(dataId)
    console.log('mp-webhook', type, dataId, result)
    await note(type, dataId, result)
    return new Response(result, { status: 200 })
  } catch (e) {
    // 500 faz o Mercado Pago tentar de novo mais tarde.
    console.error('mp-webhook falhou', type, dataId, e instanceof Error ? e.message : e)
    await note(type, dataId, 'erro')
    return new Response('erro', { status: 500 })
  }
})
