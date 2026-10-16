// Cria o pagamento no Mercado Pago. Chamada pelo app (usuária logada): supabase.functions.invoke('mp-checkout', { body }).
//  - cartão mensal  -> assinatura (preapproval): a cobrança se repete sozinha; devolve o link de autorização
//  - cartão anual   -> pagamento único (Checkout Pro) com 2 mensalidades de desconto
//  - Pix (mensal ou anual) -> QR Code (copia e cola); o Pix não renova sozinho, a pessoa paga de novo no vencimento
// O VALOR vem do banco (checkout_price: tabela de preços + cupom da conta), nunca do navegador.
// Credenciais: as do painel de gestão (cartão "Banco"); se vazias, a variável MP_ACCESS_TOKEN. APP_URL = endereço do app.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { loadPaymentConfig, serviceClient } from '../_shared/config.ts'
import { buildReference, cycleLabel, PLAN_NAME, toReais, validCheckoutRequest } from '../_shared/billing.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MP = 'https://api.mercadopago.com'

class MpError extends Error {
  constructor(public path: string, public status: number, public mpMessage: string, public cause_: string) {
    super('mp_error')
  }
}

async function mp(token: string, path: string, init: { method?: string; body?: unknown; idempotencyKey?: string }) {
  const res = await fetch(`${MP}${path}`, {
    method: init.method ?? 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.idempotencyKey ? { 'X-Idempotency-Key': init.idempotencyKey } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('Mercado Pago recusou', path, res.status, JSON.stringify(data).slice(0, 500))
    throw new MpError(path, res.status, String((data as { message?: string }).message ?? ''), String((data as { cause?: Array<{ description?: string }> }).cause?.[0]?.description ?? ''))
  }
  return data
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'metodo' }, 405)
  const { accessToken, mode, testBuyerEmail } = await loadPaymentConfig(serviceClient())
  if (!accessToken) return json({ error: 'pagamento_nao_configurado' }, 503)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) return json({ error: 'nao_autenticada' }, 401)

  const request = validCheckoutRequest(await req.json().catch(() => null))
  if (!request) return json({ error: 'pedido_invalido' }, 400)
  // Em ambiente de TESTE o Mercado Pago só aceita pagador de teste (e-mail @testuser.com): a gestão pode informar o do comprador de teste.
  // Em produção esse e-mail informado é ignorado.
  // O e-mail do comprador de teste guardado no painel vale para qualquer conta; o informado na tela (só gestão) vale se não houver.
  const testBuyer = mode === 'test' ? testBuyerEmail ?? (request.email && /@testuser\.com$/i.test(request.email) ? request.email : undefined) : undefined
  const email = testBuyer ?? user.email ?? request.email
  if (!email) return json({ error: 'email_necessario' }, 400)

  // Preço da tabela já com o cupom da conta (se valer para este plano e período). Calculado no banco.
  const { data: price, error } = await supabase.rpc('checkout_price', { p_plan: request.plan, p_cycle: request.cycle })
  const cents = (price as { finalCents?: number } | null)?.finalCents
  if (error || typeof cents !== 'number' || cents < 100) return json({ error: 'preco_indisponivel' }, 500)
  const amount = toReais(cents)
  const couponCode = (price as { coupon?: string | null }).coupon

  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')
  const reference = buildReference({ userId: user.id, plan: request.plan, cycle: request.cycle, method: request.method })
  const title = `${PLAN_NAME[request.plan]} (${cycleLabel(request.cycle)})${couponCode ? ` · cupom ${couponCode}` : ''}`
  const notification_url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-webhook`

  try {
    if (request.method === 'pix') {
      const p = await mp(accessToken, '/v1/payments', {
        idempotencyKey: crypto.randomUUID(),
        body: {
          transaction_amount: amount,
          description: title,
          payment_method_id: 'pix',
          payer: { email },
          external_reference: reference,
          notification_url,
          date_of_expiration: new Date(Date.now() + 24 * 3600_000).toISOString().replace('Z', '+00:00'),
        },
      })
      const t = p.point_of_interaction?.transaction_data ?? {}
      return json({ kind: 'pix', amountCents: cents, paymentId: String(p.id), qrCode: t.qr_code, qrCodeBase64: t.qr_code_base64, ticketUrl: t.ticket_url, expiresAt: p.date_of_expiration })
    }

    if (request.cycle === 'monthly') {
      const s = await mp(accessToken, '/preapproval', {
        body: {
          reason: title,
          external_reference: reference,
          payer_email: email,
          back_url: appUrl || undefined,
          status: 'pending',
          auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: amount, currency_id: 'BRL' },
          notification_url,
        },
      })
      return json({ kind: 'redirect', url: s.init_point, amountCents: cents })
    }

    // cartão anual: pagamento único, com parcelamento do cartão se a pessoa quiser
    const pref = await mp(accessToken, '/checkout/preferences', {
      body: {
        items: [{ title, quantity: 1, unit_price: amount, currency_id: 'BRL' }],
        payer: { email },
        external_reference: reference,
        notification_url,
        back_urls: { success: appUrl, pending: appUrl, failure: appUrl },
        auto_return: 'approved',
        payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'bank_transfer' }, { id: 'atm' }] },
      },
    })
    return json({ kind: 'redirect', url: pref.init_point, amountCents: cents })
  } catch (e) {
    // Motivo devolvido pelo Mercado Pago (texto dele, sem segredos): ajuda a achar o problema.
    // Pix com credenciais de TESTE: o Mercado Pago não oferece Pix nesse ambiente (só em produção).
    if (request.method === 'pix' && mode === 'test' && e instanceof MpError && e.status === 401) return json({ error: 'pix_so_em_producao' }, 502)
    const detail = e instanceof MpError ? { path: e.path, status: e.status, message: e.mpMessage, cause: e.cause_ } : undefined
    return json({ error: 'pagamento_falhou', detail }, 502)
  }
})
