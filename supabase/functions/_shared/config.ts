// Credenciais do Mercado Pago: as do painel de gestão (cartão "Banco") valem; se não houver, usa as variáveis de ambiente.
import { createClient } from 'npm:@supabase/supabase-js@2'

export interface PaymentConfig {
  mode: 'test' | 'production'
  accessToken: string | null
  webhookSecret: string | null
  /** E-mail do comprador de teste (@testuser.com), usado como pagador só no modo teste. */
  testBuyerEmail: string | null
}

export const serviceClient = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

export async function loadPaymentConfig(admin: ReturnType<typeof serviceClient>): Promise<PaymentConfig> {
  const { data, error } = await admin.rpc('get_payment_config')
  const c = (error ? null : data) as Partial<PaymentConfig> | null
  return {
    mode: c?.mode === 'production' ? 'production' : 'test',
    accessToken: c?.accessToken || Deno.env.get('MP_ACCESS_TOKEN') || null,
    webhookSecret: c?.webhookSecret || Deno.env.get('MP_WEBHOOK_SECRET') || null,
    testBuyerEmail: c?.testBuyerEmail || null,
  }
}
