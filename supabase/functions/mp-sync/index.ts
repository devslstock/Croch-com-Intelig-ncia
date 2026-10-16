// Segunda via para liberar o plano: confere no Mercado Pago os pagamentos APROVADOS da própria usuária e aplica os que ainda não foram.
// Serve quando o aviso (webhook) atrasa, falha ou é recusado. Chamada pelo app (usuária logada) enquanto ela espera a confirmação.
// Segurança: só olha pagamentos cuja referência traz o ID da usuária logada; o pagamento é lido DIRETO na API do Mercado Pago com o
// nosso token (nada vem do navegador) e o banco aplica cada pagamento uma única vez (apply_payment é idempotente).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { loadPaymentConfig, serviceClient } from '../_shared/config.ts'
import { parseReference, toCents } from '../_shared/billing.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'metodo' }, 405)

  const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: auth } = await user.auth.getUser()
  if (!auth.user) return json({ error: 'nao_autenticada' }, 401)
  const userId = auth.user.id

  const admin = serviceClient()
  const { accessToken } = await loadPaymentConfig(admin)
  if (!accessToken) return json({ applied: 0, error: 'pagamento_nao_configurado' })

  try {
    const since = new Date(Date.now() - 3 * 86_400_000).toISOString()
    const res = await fetch(
      `https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=100&begin_date=${encodeURIComponent(since)}&end_date=NOW`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!res.ok) return json({ applied: 0, error: 'mp_indisponivel' })
    const found = ((await res.json()).results ?? []) as Array<{ id: unknown; status?: string; external_reference?: string; transaction_amount: unknown; payment_method_id?: string }>

    let applied = 0
    for (const p of found) {
      if (p.status !== 'approved') continue
      const ref = parseReference(p.external_reference)
      if (!ref || ref.userId !== userId) continue
      const { data, error } = await admin.rpc('apply_payment', {
        p_user: ref.userId, p_plan: ref.plan, p_cycle: ref.cycle, p_method: p.payment_method_id === 'pix' ? 'pix' : 'card',
        p_provider_payment_id: String(p.id), p_amount_cents: toCents(p.transaction_amount),
      })
      if (error) throw new Error(error.message)
      if ((data as { applied?: boolean } | null)?.applied) {
        applied++
        await admin.rpc('log_payment_event', { p_type: 'sync', p_data_id: String(p.id), p_outcome: 'aplicado' })
      }
    }
    return json({ applied })
  } catch (e) {
    console.error('mp-sync falhou', e instanceof Error ? e.message : e)
    return json({ applied: 0, error: 'erro' }, 500)
  }
})
