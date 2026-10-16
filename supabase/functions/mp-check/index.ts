// Botão "Testar conexão" do painel (cartão "Banco"): confere se o Access Token do modo ativo é aceito pelo Mercado Pago.
// Só a gestão pode chamar. Nunca devolve o token, só o nome da conta do Mercado Pago.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { loadPaymentConfig, serviceClient } from '../_shared/config.ts'

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
  const { data: isAdmin } = await user.rpc('is_admin')
  if (isAdmin !== true) return json({ error: 'sem_permissao' }, 403)

  const cfg = await loadPaymentConfig(serviceClient())
  if (!cfg.accessToken) return json({ ok: false, mode: cfg.mode, error: 'sem_token' })

  try {
    const res = await fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: `Bearer ${cfg.accessToken}` } })
    if (res.status === 401 || res.status === 403) return json({ ok: false, mode: cfg.mode, error: 'token_recusado' })
    if (!res.ok) return json({ ok: false, mode: cfg.mode, error: 'mp_indisponivel' })
    const me = await res.json()
    return json({
      ok: true,
      mode: cfg.mode,
      hasWebhookSecret: !!cfg.webhookSecret,
      account: { id: me.id ?? null, nickname: me.nickname ?? null, siteId: me.site_id ?? null },
    })
  } catch {
    return json({ ok: false, mode: cfg.mode, error: 'mp_indisponivel' })
  }
})
